//! trade2/headers.rs — サーバーの応答を読んで門番に反映する (規則 / 現在数 / 罰則 / 別経路)
//!
//! 2026-09-19 に trade2.rs (1066 行) から切り出した。
//! サブモジュールは private なので pub にしてもクレートの外には出ない。
use super::*;

/// この門を通る窓口 (罰則は IP 単位なので、1 つ食らったら全部止める)
pub const KINDS: [&str; 3] = ["search", "fetch", "history"];

/// 罰則は同じ IP にかかるので、全ての窓口を同じ時刻まで止める。
///
/// 2026-09-18 の記録: 21:36:04 の fetch (retry-after 600) と 21:36:13 の search (retry-after 591) は
/// **解除時刻が同じ 21:46:04** だった。窓口ごとに別々の罰則ではない。それまでは片方が 429 を
/// 食らってももう片方は投げ続けていたので、冷却中に枠を使ってしまっていた。
pub fn block_all_until(map: &mut HashMap<String, Gate>, until_ms: i64) {
    for kind in KINDS {
        map.entry(kind.to_string()).or_default();
    }
    for g in map.values_mut() {
        g.blocked_until = g.blocked_until.max(until_ms);
    }
}

/// 直近 n 秒に送った回数 (全窓口の合計)。記録に残す用
pub fn recent_counts(map: &HashMap<String, Gate>, now: i64) -> String {
    [60i64, 300, 900, 3600]
        .iter()
        .map(|w| {
            let n: usize = map
                .values()
                .map(|g| g.sends.iter().filter(|t| **t > now - w * 1000).count())
                .sum();
            format!("{w}秒={n}回")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// 応答のヘッダで規則と現在数を合わせる (罰則が残っていればその間は送らない)
pub fn gate_note(kind: &str, headers: &HeaderMap) {
    // サーバーが出している規則群を起動ごとに 1 回だけ丸ごと残す。
    // 2026-09-18: 門番は x-rate-limit-ip しか見ていない。ほかに account / client の規則が
    // 出ているなら、そちらで断られている可能性があるので、実物を確かめられるようにする。
    if let Ok(mut seen) = HEADERS_LOGGED.lock() {
        if seen.insert(kind.to_string()) {
            crate::app_log::line_static(&format!(
                "[trade2] {kind} のレート規則ヘッダ: {}",
                rate_limit_headers(headers)
            ));
        }
    }
    let get = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let rules_raw = get("x-rate-limit-ip");
    let state_raw = get("x-rate-limit-ip-state");
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let mut rules = {
        let g = map.entry(kind.to_string()).or_default();
        if let Some(raw) = rules_raw {
            let parsed: Vec<Rule> = raw
                .split(',')
                .filter_map(|part| {
                    let mut it = part.split(':');
                    let max = it.next()?.trim().parse::<u32>().ok()?;
                    let period = it.next()?.trim().parse::<i64>().ok()?;
                    Some((max, period))
                })
                .collect();
            if !parsed.is_empty() && parsed != g.rules {
                crate::app_log::line_static(&format!("[trade2] {kind} の規則が変わりました: {parsed:?}"));
                if rules_widened(&g.rules, &parsed) {
                    // 枠が広がった (ログインで Account 規則が付くと IP の 5 分枠が 30 → 60 になる。
                    // 2026-09-19 19:50 の実測)。下げていた合計上限は古い枠で踏んだ物なので基準に戻す
                    if let Ok(mut m) = ADAPTIVE_MAX.lock() {
                        if *m < COMBINED_MAX_300 {
                            *m = COMBINED_MAX_300;
                            crate::app_log::line_static(&format!("[trade2] 枠が広がったので合計の 5 分上限を {COMBINED_MAX_300} に戻します"));
                        }
                    }
                }
                g.rules = parsed;
            }
        }
        g.rules.clone()
    };
    if rules.is_empty() {
        rules = default_rules();
    }
    if let Some(raw) = state_raw {
        for (i, part) in raw.split(',').enumerate() {
            let nums: Vec<i64> = part.split(':').filter_map(|x| x.trim().parse::<i64>().ok()).collect();
            let (Some(&cur), Some(&period), Some(&restricted)) = (nums.first(), nums.get(1), nums.get(2)) else {
                continue;
            };
            // 罰則が残っていればその間は送らない (全窓口)
            if restricted > 0 {
                crate::app_log::line_static(&format!(
                    "[trade2] {kind} 窓{period}秒に罰則が残っています (あと {restricted} 秒)"
                ));
                block_all_until(map, now + restricted * 1000 + 500);
                continue;
            }
            // 同じ IP の別経路 (ブラウザで開いたトレード検索など) が枠を使っていないかを見る。
            // 2026-09-19 から**ログに出すだけ**で枠は縮めない (オーナー「アプリ側で制限かけるの
            // 良くない。送り方さえ統一して踏まないように」)。どれだけ別経路があるかの記録用。
            //
            // 「サーバーの数 > こちらの記録」では判定できない。2026-09-18 の記録では 6 時間窓が常に
            // 90 回ほど多かったが、これは記録を保存する前の自分の送信で、差はずっと一定だった。
            // 見るべきは**伸び方**: 前回の応答からサーバーの数が増えたぶんが、その間にこちらが
            // 送った数より多ければ、その差は他の誰かが送っている。
            let Some(&(max, _)) = rules.get(i) else { continue };
            let margin = if max >= 15 { 2 } else { 1 };
            let keep = max.saturating_sub(margin).max(1) as i64;
            let (own, prev) = {
                let g = map.entry(kind.to_string()).or_default();
                let own = g.sends.iter().filter(|t| **t > now - period * 1000).count() as i64;
                (own, g.last_state.insert(period, (cur, now)))
            };
            let Some((prev_cur, prev_at)) = prev else { continue };
            // 窓が一周していたら古いぶんが抜けて数が減るので、伸び方では比べられない
            if now - prev_at >= period * 1000 {
                continue;
            }
            let own_delta = {
                let g = map.entry(kind.to_string()).or_default();
                // 境界は入れる側に寄せる (自分の送信を取りこぼすと別経路と誤判定するため)。
                // 前回の応答より後に送った物しかここには入らない (応答は必ずその送信より後なので)
                g.sends.iter().filter(|t| **t >= prev_at && **t <= now).count() as i64
            };
            let foreign = cur - prev_cur - own_delta;
            if foreign <= 0 {
                continue;
            }
            crate::app_log::line_static(&format!(
                "[trade2] {kind} 窓{period}秒: 前回の応答からサーバーは {} 回増、こちらの送信は {own_delta} 回。差の {foreign} 回は同じ回線の別経路 (ブラウザのトレード検索など)。今の現在数 {cur} / 上限 {max} (こちらの記録 {own})",
                cur - prev_cur
            ));
            let g = map.entry(kind.to_string()).or_default();
            if cur >= keep {
                // 窓は滑って動くので、平均すると period/max ごとに 1 枠空く。
                // 超過ぶんだけ待てば上限を下回る (窓の長さぶん丸ごと止めると、
                // 8 銘柄ほどで 5 分止まる = オーナー報告「8 銘柄くらいしか取れない」2026-09-18)。
                let slot_ms = (period * 1000 / max.max(1) as i64).max(1);
                let excess = cur - keep + 1;
                g.blocked_until = g.blocked_until.max(now + slot_ms * excess);
            }
        }
    }
    maybe_recover_adaptive_max(now);
    let g = map.entry(kind.to_string()).or_default();
    g.sends.sort_unstable();
    save_gates_locked(map);
}

/// 429 を食らった時の罰則を控える。
///
/// 2026-09-18 オーナー「やっぱ制限がでるね、なんでやろ」: それまで retry-after しか記録して
/// いなかったので、**どの規則で断られたのか**が後から分からなかった (こちらの記録では
/// 5 分に 24 回で、規則は search 30 回 / fetch 50 回。届いていないのに断られている)。
/// サーバーが返した x-rate-limit-* と本文の頭、それに自分の送信回数を丸ごと残す。
pub fn gate_penalty(kind: &str, retry_after_secs: i64, rl: &serde_json::Value, body: &str) {
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    crate::app_log::line_static(&format!(
        "[trade2] {kind} で 429 (retry-after {retry_after_secs} 秒)\n  サーバーの規則と現在数: {rl}\n  こちらの送信 (全窓口): {}\n  本文: {}",
        recent_counts(map, now),
        body.chars().take(200).collect::<String>().replace('\n', " ")
    ));
    let lowered = lower_adaptive_max(now);
    crate::app_log::line_static(&format!(
        "[trade2] 合計の 5 分上限を {lowered} 回に下げました (次からこの線で投げます)"
    ));
    block_all_until(map, now + retry_after_secs.max(1) * 1000 + 500);
    save_gates_locked(map);
}

/// 門番の今の状態。画面に出す数字はここだけを見る。
///
/// 2026-09-19 のリファクタ以前は `gate_blocked_until_secs` / `gate_wait_secs` /
/// `gate_usage_300` / `gate_budget_wait_secs` の 4 つに分かれていて、呼ぶ側 (market_flow)
/// が 4 回 GATES を lock し、画面も「罰則」「枠待ち」「ペース」を別々の式で数えていた。

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trade2::testutil::*;

    /// 別経路の判定は「差」ではなく「伸び方」で見る。
    ///
    /// 自分の送信だけで上限近くまで使っても余計に止めない (止めていた頃は 28 件ごとに 300 秒止まった)。
    /// サーバーの数がこちらの記録より多いだけでも止めない (2026-09-18: 6 時間窓が常に 90 回多く、
    /// それは記録を保存する前の自分の送信だった)。前回の応答からの伸びがこちらの送信より速い時だけ。
    #[test]
    fn only_a_faster_growing_counter_counts_as_another_client() {
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let now = now_ms();
        let key = "test-own";
        let push_send = || {
            let mut guard = GATES.lock().unwrap();
            let map = guard.get_or_insert_with(HashMap::new);
            map.entry(key.to_string()).or_default().sends.push(now_ms());
        };
        let blocked = || GATES.lock().unwrap().as_ref().unwrap()[key].blocked_until;
        {
            let mut guard = GATES.lock().unwrap();
            let map = guard.get_or_insert_with(HashMap::new);
            let g = map.entry(key.to_string()).or_default();
            g.rules = vec![(5, 10)];
            g.sends = vec![now - 3_000, now - 2_000, now - 1_000, now - 500];
            g.blocked_until = 0;
            g.last_state.clear();
        }
        let mut h = HeaderMap::new();
        h.insert("x-rate-limit-ip", HeaderValue::from_static("5:10:60"));
        // 1 回目: 比べる相手がまだ無い
        h.insert("x-rate-limit-ip-state", HeaderValue::from_static("4:10:0"));
        gate_note(key, &h);
        assert_eq!(blocked(), 0, "1 回目は比べられないので止めない");
        // こちらが 1 回送り、サーバーも 1 増えた = 全部自分の送信
        push_send();
        h.insert("x-rate-limit-ip-state", HeaderValue::from_static("5:10:0"));
        gate_note(key, &h);
        assert_eq!(blocked(), 0, "伸びたぶんが自分の送信と同じなら止めない");
        // こちらは 1 回しか送っていないのにサーバーは 3 増えた = 2 回は別経路
        push_send();
        h.insert("x-rate-limit-ip-state", HeaderValue::from_static("8:10:0"));
        gate_note(key, &h);
        let b = blocked();
        // 上限 5 / 10 秒 なら 1 枠 = 2 秒。超過 (8 - 4 + 1 = 5 枠) ぶんだけ待つ
        assert!(b >= now + 8_000 && b <= now + 13_000, "超過ぶんだけ待つ (blocked={b}, now={now})");
    }

    /// 429 を 1 つの窓口で食らったら、他の窓口も同じ時刻まで止まる
    /// (2026-09-18 の記録: search と fetch の解除時刻が同じ 21:46:04 だった)
    #[test]
    fn a_penalty_stops_every_kind() {
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let now = now_ms();
        {
            let mut guard = GATES.lock().unwrap();
            let map = guard.get_or_insert_with(HashMap::new);
            for k in KINDS {
                map.entry(k.to_string()).or_default().blocked_until = 0;
            }
        }
        gate_penalty("fetch", 600, &serde_json::Value::Null, "");
        let guard = GATES.lock().unwrap();
        let map = guard.as_ref().unwrap();
        for k in KINDS {
            assert!(map[k].blocked_until >= now + 600_000, "{k} も止まる");
        }
    }

    /// 規則が広がった時だけ「別の環境」とみなす (ログインで 30 → 60)。狭まった / 同じ / 無い は違う
    #[test]
    fn widened_rules_are_detected_only_when_the_5min_cap_grows() {
        let old = vec![(5, 10), (15, 60), (30, 300), (600, 21600)];
        let new = vec![(8, 10), (15, 60), (60, 300), (600, 10800)];
        assert!(rules_widened(&old, &new), "5 分枠 30 → 60");
        assert!(!rules_widened(&new, &old), "狭まった");
        assert!(!rules_widened(&old, &old), "同じ");
        assert!(!rules_widened(&[], &new), "前の規則が無い (初回) は違う");
    }
}

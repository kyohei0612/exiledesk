//! POE2 公式 trade2 API クライアント (Tauri command)。
//!
//! オーナー判断 (2026-05-10): trade2 search API は CORS 制約でブラウザから直叩き不可、
//! また rate limit ヘッダ管理の都合で Rust 側に proxy を置く方針。
//!
//! 現状の機能:
//!   - `trade2_search`: query を POST、id / total / result(ID列) を含むレスポンス全体を返す
//!   - `trade2_search_count`: 上の `total` だけ取り出す軽量版（母集団件数表示用）
//!   - `trade2_fetch`: search で取った listing id 列（最大 10）を query_id 付きで照会、listing 詳細を返す
//!
//! rate limit: 全リクエストがこのファイルの門番 (gate_acquire) を通り、上限に当たる前に間隔を空ける (2026-09-18)。
//!   成功時はレスポンスに `_ratelimit` (x-rate-limit-* ヘッダ) を足し、429 時はエラー文字列に
//!   `ratelimit={...}` を含める (フロントはこれを表示と自分の記録の突き合わせに使う)。
//!
//! User-Agent: ExileDesk/0.1 (連絡先 hardcode せず、必要なら env で渡す)

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// ============================================================================
// レートの門番 (2026-09-18 オーナー指示:「レート止まるね、どうにか止まらんようにしたい、一括で」)
// ============================================================================
//
// これまでは「送ってみて 429 を食らったら待つ」だったので、罰則 (retry-after) を食らうたびに
// 一括取得が数分〜20 分止まっていた。ここを通る全てのリクエスト (画面からの取得も、裏の一括取得も)
// を 1 か所で数え、**上限に当たる前に間隔を空ける**ようにする。罰則を食らわなければ止まらない。
//
// 規則はサーバーが毎回返す x-rate-limit-ip (上限:窓秒:罰則秒) をそのまま使い、
// x-rate-limit-ip-state (現在数:窓秒:残り罰則秒) で自分の記録とサーバーの数え方を突き合わせる
// (同じ IP から手で検索した分など、こちらの記録に無い呼び出しがあるため)。

/// 窓ごとの規則 (上限, 窓の長さ秒)
type Rule = (u32, i64);

#[derive(Default)]
struct Gate {
    /// 送った時刻 (ミリ秒)。窓の判定に使う
    sends: Vec<i64>,
    /// サーバーが返した規則。取れるまでは既定を使う
    rules: Vec<Rule>,
    /// 罰則などで送れない時刻 (ミリ秒)
    blocked_until: i64,
    /// 同じ IP の別経路 (ブラウザのトレード検索や他のツール) を最後に見つけた時刻 (ミリ秒)。
    /// 2026-09-18: こちらは上限の半分も使っていないのに 429 (retry-after 600 秒) を食らった。
    /// サーバーの数えた回数がこちらの記録より多い = 別経路が枠を使っているので、その間は半分に抑える
    foreign_seen_at: i64,
    /// 窓の長さ(秒) → (前回サーバーが返した現在数, その時刻ミリ秒)。
    ///
    /// 「サーバーの数 > こちらの記録」をそのまま別経路の証拠にすると外れる。2026-09-18 の 6 時間窓が
    /// まさにそれで、送信記録を保存するようになる前 (v0.1.168 より前) の自分の送信 90 回ぶんが
    /// こちらにだけ無く、ずっと「別経路がいる」と誤判定して枠を半分に絞っていた。
    /// 差が一定なら古い履歴、**伸び方がこちらの送信より速ければ**本当に別経路。そのための前回値。
    last_state: HashMap<i64, (i64, i64)>,
}

static GATES: StdMutex<Option<HashMap<String, Gate>>> = StdMutex::new(None);

/// レート規則ヘッダを丸ごと記録した窓口 (起動ごとに 1 回だけ出す)
static HEADERS_LOGGED: StdMutex<std::collections::BTreeSet<String>> =
    StdMutex::new(std::collections::BTreeSet::new());

/// 送信記録の保存先 (アプリを閉じても覚えておくため)。起動時に `load_gates` で入れる。
///
/// 2026-09-18 オーナー報告「一括でやった時に死ぬほどレート引っかかる」:
/// 記録がメモリだけだったので、アプリを再起動するたびに「まだ 1 回も送っていない」状態に戻り、
/// 上限いっぱいまで一気に投げて → サーバ側の枠を使い切って長い待ちに入る、を繰り返していた。
/// 今日は更新で 4 回再起動しているので、そのたびにバーストしていたことになる。
static GATE_STORE: StdMutex<Option<std::path::PathBuf>> = StdMutex::new(None);

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct StoredGate {
    sends: Vec<i64>,
    rules: Vec<Rule>,
    blocked_until: i64,
    #[serde(default)]
    foreign_seen_at: i64,
}

/// 起動時に 1 回。保存してあった送信記録を読み込む
pub fn load_gates(path: std::path::PathBuf) {
    if let Ok(mut g) = GATE_STORE.lock() {
        *g = Some(path.clone());
    }
    let Ok(raw) = std::fs::read_to_string(&path) else { return };
    let Ok(stored) = serde_json::from_str::<HashMap<String, StoredGate>>(&raw) else { return };
    let now = now_ms();
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    for (kind, st) in stored {
        let sends: Vec<i64> = st.sends.into_iter().filter(|t| *t > now - 6 * 3600 * 1000).collect();
        let e = map.entry(kind).or_default();
        e.sends = sends;
        e.rules = st.rules;
        e.blocked_until = st.blocked_until;
        e.foreign_seen_at = st.foreign_seen_at;
    }
}

/// 送信記録を保存する (GATES の lock を持っている間に呼ぶ)
fn save_gates_locked(map: &HashMap<String, Gate>) {
    let Some(path) = GATE_STORE.lock().ok().and_then(|g| g.clone()) else { return };
    let stored: HashMap<&String, StoredGate> = map
        .iter()
        .map(|(k, g)| {
            (
                k,
                StoredGate {
                    sends: g.sends.clone(),
                    rules: g.rules.clone(),
                    blocked_until: g.blocked_until,
                    foreign_seen_at: g.foreign_seen_at,
                },
            )
        })
        .collect();
    if let Ok(json) = serde_json::to_string(&stored) {
        let _ = std::fs::write(path, json);
    }
}

/// 規則が取れるまでの控えめな既定 (search の公表値より 1 段きつめ)
fn default_rules() -> Vec<Rule> {
    vec![(4, 10), (12, 60), (24, 300)]
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// 同じ IP の別経路を見つけてから、控えめに投げ続ける時間
const FOREIGN_QUIET_MS: i64 = 10 * 60 * 1000;
/// エンドポイントごとの最低間隔。
///
/// 2026-09-18 オーナー報告「昨日は一括押しても止まらなかった」→ 何が変わったかを記録で突き合わせた。
/// v0.1.159 のレビューで、画面側 (pricing.ts) が持っていた最低間隔 (search 10.5 秒 / fetch 2.5 秒) を
/// 「Rust の門番があるから二重待ちになる」と外していた。門番は窓の上限しか見ないので、
/// 手動の再取得が **3 発を 1 秒以内**に出せるようになり (記録で確認: 18:28:49-50 に 3 発)、
/// そこから 429 (retry-after 600 秒) を踏んでいた。昨日まで効いていた値をこちらに移す。
fn min_spacing_ms(kind: &str) -> i64 {
    match kind {
        "search" => 10_500,
        _ => 2_500,
    }
}

/// 窓ごとの上限に対して「あと何ミリ秒待てば 1 枠空くか」。空いていれば 0
fn window_wait(sends: &[i64], rules: &[Rule], now: i64, shy: bool) -> i64 {
    let mut wait = 0;
    for &(max, period) in rules {
        // 上限ぴったりまで使うと他の呼び出しとぶつかるので、少し残して止める
        let margin = if shy { max / 2 } else if max >= 15 { 2 } else { 1 };
        let keep = max.saturating_sub(margin).max(1) as usize;
        let window_ms = period * 1000;
        let in_window: Vec<i64> = sends.iter().copied().filter(|t| *t > now - window_ms).collect();
        if in_window.len() >= keep {
            // 一番古い物が窓から出た瞬間に 1 枠空く
            let oldest = in_window[in_window.len() - keep];
            wait = wait.max(oldest + window_ms + 300 - now);
        }
    }
    wait
}

/// その窓口だけで見た待ち時間
fn wait_for_rules(g: &Gate, now: i64, spacing_ms: i64) -> i64 {
    let mut wait = (g.blocked_until - now).max(0);
    // 直前の送信からは最低 spacing_ms 空ける (窓に余裕があっても burst にしない)
    if let Some(last) = g.sends.iter().max() {
        wait = wait.max(last + spacing_ms - now);
    }
    // 同じ IP の別経路 (ブラウザのトレード検索など) が見えている間は、枠を半分しか使わない
    let shy = now - g.foreign_seen_at < FOREIGN_QUIET_MS;
    let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
    wait.max(window_wait(&g.sends, &rules, now, shy))
}

/// 全窓口あわせた枠。同じ長さの窓を持つ規則のうち**一番きつい上限**を、合計の送信数に当てる。
///
/// 2026-09-18 の実測。**公表されている規則ではこの 429 は説明がつかない**ので、経験則で置いている。
///
/// サーバーが返す規則は search が 5 分 30 回 (policy trade-search-request-limit)、
/// fetch が 5 分 50 回 (trade-fetch-request-limit)。どちらも rules は "Ip" だけで、
/// state の数え方も窓口ごとに独立している (片方を 1 回投げてももう片方の数は増えない)。
/// つまり公表ぶんは確かに窓口ごとの枠。それでも 429 が出る:
///   - 429 の応答には x-rate-limit-* が**1 つも付かない**。policy 名も無く、
///     本文は `{"error":{"code":3,"message":"Rate limit exceeded"}}` だけ。
///     公表された規則の違反ならヘッダが付いて restricted が立つはずなので、これは別の制限。
///     どの窓で断られたのかはサーバーからは永久に分からない = 手前で防ぐしかない
///   - 罰則は IP 単位 (search と fetch の 429 の解除時刻がミリ秒まで同じだった)
///   - 429 を食らった時の**合計**送信数 (直近 5 分) は 24 / 25 / 30 / 32 回。通ったのは最大 29 回。
///     窓口ごとの上限にはどちらも遠いが、合計で見ると 30 前後にきれいに揃う
/// ので「合計で 5 分 30 回」を隠れた上限とみなして手前で止める。別々に数えていた頃は
/// 合計 5 分 57 回投げていて (10.5 秒ごとに search と fetch を 1 組)、2 分ごとに 429 を踏んでいた。
/// この数字は観測から置いた推定値で、公表値ではない。
///
/// 2026-09-19 に引き下げ (オーナー了承)。それまで search の公表値 30 をそのまま合計に当てていたが、
/// 429 を食らった時の合計 (直近 5 分) の観測が 24 / 25 / 30 / 32 / **21** 回で、
/// 通ったのは最大 29 回。**21 回で断られた記録が出た**ので 30 では高すぎる。
/// 22 に下げる (門番は上限から 2 残すので、実際には 5 分 20 回 = 15 秒に 1 回まで)。
/// 代償: 42 銘柄 (84 リクエスト) の 1 巡が 20 分 → 約 27 分。止まるよりは待つ方を採る。
const COMBINED_MAX_300: u32 = 22;
/// これ以上は下げない (下げすぎると 1 巡が現実的でなくなる)
const COMBINED_MIN_300: u32 = 10;
/// 429 を食らわずにこれだけ経ったら 1 段戻す
const RECOVER_QUIET_MS: i64 = 45 * 60 * 1000;

/// 今使っている合計の 5 分上限。**429 を食らうたびに自分で下げる**。
///
/// 2026-09-19 オーナー「なんか取れんかったっぽい、マジで何でなん」:
/// 上限を 22 (実効 20) まで下げたのに、**ちょうど 20 回で 429** を 2 回食らった。
/// サーバーは 429 に規則を返さないので本当の線は分からず、こちらが当て続けるしかない。
/// 当てるのをやめて、踏んだら 4 分の 3 に下げ、しばらく踏まなければ 1 ずつ戻す。
static ADAPTIVE_MAX: StdMutex<u32> = StdMutex::new(COMBINED_MAX_300);
/// 最後に 429 を食らった時刻 (戻すかの判断に使う)
static LAST_PENALTY_AT: StdMutex<i64> = StdMutex::new(0);

fn adaptive_max() -> u32 {
    ADAPTIVE_MAX.lock().map(|g| *g).unwrap_or(COMBINED_MAX_300)
}

/// 429 を踏んだので上限を下げる。下がった値を返す
fn lower_adaptive_max(now: i64) -> u32 {
    if let Ok(mut at) = LAST_PENALTY_AT.lock() {
        *at = now;
    }
    let Ok(mut g) = ADAPTIVE_MAX.lock() else { return COMBINED_MAX_300 };
    *g = (*g * 3 / 4).max(COMBINED_MIN_300);
    *g
}

/// しばらく 429 を踏んでいなければ 1 段戻す (静かな時に少しずつ速さを取り戻す)
fn maybe_recover_adaptive_max(now: i64) {
    let last = LAST_PENALTY_AT.lock().map(|g| *g).unwrap_or(0);
    if last == 0 || now - last < RECOVER_QUIET_MS {
        return;
    }
    if let Ok(mut at) = LAST_PENALTY_AT.lock() {
        *at = now;
    }
    if let Ok(mut g) = ADAPTIVE_MAX.lock() {
        if *g < COMBINED_MAX_300 {
            *g += 1;
            crate::app_log::line_static(&format!("[trade2] 静かなので合計の 5 分上限を {} に戻します", *g));
        }
    }
}

fn combined_rules(map: &HashMap<String, Gate>) -> Vec<Rule> {
    let mut by_period: std::collections::BTreeMap<i64, u32> = std::collections::BTreeMap::new();
    for g in map.values() {
        let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
        for (max, period) in rules {
            by_period.entry(period).and_modify(|m| *m = (*m).min(max)).or_insert(max);
        }
    }
    // 5 分窓だけは公表値より低い実測 (429 を踏むたびに下がる) に合わせる
    let cap = adaptive_max();
    by_period.entry(300).and_modify(|m| *m = (*m).min(cap)).or_insert(cap);
    by_period.into_iter().map(|(period, max)| (max, period)).collect()
}

/// 全窓口の送信を合わせた待ち時間
fn combined_wait(map: &HashMap<String, Gate>, now: i64) -> i64 {
    let mut sends: Vec<i64> = map.values().flat_map(|g| g.sends.iter().copied()).collect();
    sends.sort_unstable();
    let shy = map.values().any(|g| now - g.foreign_seen_at < FOREIGN_QUIET_MS);
    window_wait(&sends, &combined_rules(map), now, shy)
}

/// 待てる上限。これを超える待ちは「今は無理」と返して、呼び側にエラーを出させる
/// (2026-09-18: 上限が無く、罰則 10 分の時に「再取得」が無反応のまま 10 分固まっていた)
const MAX_GATE_WAIT_MS: i64 = 90_000;

/// 送ってよくなるまで待って、送った記録を残す。全ての trade2 リクエストがここを通る。
/// 待ちが長すぎる時は Err (呼び側が「レート制限中: あと N 秒」として返す)
pub(crate) async fn gate_acquire(kind: &str) -> Result<(), String> {
    let mut waited = 0i64;
    loop {
        let wait = {
            let mut guard = match GATES.lock() {
                Ok(g) => g,
                Err(_) => return Ok(()),
            };
            let map = guard.get_or_insert_with(HashMap::new);
            let now = now_ms();
            let g = map.entry(kind.to_string()).or_default();
            g.sends.retain(|t| *t > now - 6 * 3600 * 1000);
            let own = wait_for_rules(g, now, min_spacing_ms(kind));
            // 枠は IP 単位なので、全窓口を合わせた分も見る
            let wait = own.max(combined_wait(map, now));
            if wait <= 0 {
                map.entry(kind.to_string()).or_default().sends.push(now);
                save_gates_locked(map);
            }
            wait
        };
        if wait <= 0 {
            return Ok(());
        }
        if waited + wait > MAX_GATE_WAIT_MS {
            return Err(format!(
                "trade2 レート制限中 (あと {} 秒)。少し待ってから取得してください",
                (wait + 999) / 1000
            ));
        }
        let step = wait.min(2000);
        waited += step;
        tokio::time::sleep(Duration::from_millis(step as u64)).await;
    }
}

/// この門を通る窓口 (罰則は IP 単位なので、1 つ食らったら全部止める)
const KINDS: [&str; 3] = ["search", "fetch", "history"];

/// 罰則は同じ IP にかかるので、全ての窓口を同じ時刻まで止める。
///
/// 2026-09-18 の記録: 21:36:04 の fetch (retry-after 600) と 21:36:13 の search (retry-after 591) は
/// **解除時刻が同じ 21:46:04** だった。窓口ごとに別々の罰則ではない。それまでは片方が 429 を
/// 食らってももう片方は投げ続けていたので、冷却中に枠を使ってしまっていた。
fn block_all_until(map: &mut HashMap<String, Gate>, until_ms: i64) {
    for kind in KINDS {
        map.entry(kind.to_string()).or_default();
    }
    for g in map.values_mut() {
        g.blocked_until = g.blocked_until.max(until_ms);
    }
}

/// 直近 n 秒に送った回数 (全窓口の合計)。記録に残す用
fn recent_counts(map: &HashMap<String, Gate>, now: i64) -> String {
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
pub(crate) fn gate_note(kind: &str, headers: &HeaderMap) {
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
            g.foreign_seen_at = now;
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
fn gate_penalty(kind: &str, retry_after_secs: i64, rl: &serde_json::Value, body: &str) {
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

/// 罰則 (429 や x-rate-limit-*-state の restricted) で送れない時の解除予定 (unix 秒)。
///
/// 上限に当たらないための**通常の間隔待ち**はここに入れない。数秒の間隔まで「レート制限中」と
/// 出すと画面のボタンがずっと押せなくなるため、止まっている時だけを出す。
pub fn gate_blocked_until_secs() -> i64 {
    let Ok(mut guard) = GATES.lock() else { return 0 };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let mut until = 0;
    for g in map.values() {
        if g.blocked_until > now {
            until = until.max(g.blocked_until / 1000);
        }
    }
    until
}

/// 次に送れるまでの秒数 (通常の間隔待ちを含む)。進捗表示用
pub fn gate_wait_secs() -> i64 {
    let Ok(mut guard) = GATES.lock() else { return 0 };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let mut wait = 0;
    wait = wait.max(combined_wait(map, now));
    for (kind, g) in map.iter() {
        wait = wait.max(wait_for_rules(g, now, min_spacing_ms(kind)));
    }
    (wait + 999) / 1000
}

/// 5 分窓を全窓口あわせて何回使ったか / 上限は何回か (画面の「5 分で n/26 回」用)。
///
/// 2026-09-19 オーナー「手動と自動のレート制限が合わんね。レート制限中に手動しても
/// そこのレート制限が変わらん。一緒にしてよ、ぐちゃぐちゃになる」:
/// 画面のボタンは JS 側が別に持っている送信記録 (画面から出した分だけ) を数えていたので、
/// 裏の巡回がどれだけ使っても増えなかった。門番の数を返して 1 つにする。
pub fn gate_usage_300() -> (i64, i64) {
    let Ok(mut guard) = GATES.lock() else { return (0, 0) };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let used: i64 = map
        .values()
        .map(|g| g.sends.iter().filter(|t| **t > now - 300_000).count() as i64)
        .sum();
    let max = combined_rules(map)
        .into_iter()
        .find(|(_, period)| *period == 300)
        .map(|(m, _)| m as i64)
        .unwrap_or(adaptive_max() as i64);
    (used, max)
}

/// 「枠が空くまで」の待ち秒。通常の最低間隔 (10 秒前後) は入れない。
///
/// 2026-09-19 オーナー「レート制限周りの同期がずれてる」の調査で分かったこと:
/// 画面が「止まっている」と判断していたのは罰則 (gate_blocked_until_secs) だけだった。
/// 合計の枠 (combined_wait) で数分待つ場合は罰則が 0 なので、画面は「制限なし」に見えるのに
/// 実際には何も進まない、という食い違いが起きる。ここを分けて出せるようにする。
pub fn gate_budget_wait_secs() -> i64 {
    let Ok(mut guard) = GATES.lock() else { return 0 };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    // 最低間隔ぶん (spacing) は「待ち」に数えない = spacing を 0 にして測る
    let mut wait = combined_wait(map, now);
    for g in map.values() {
        wait = wait.max(wait_for_rules(g, now, 0));
    }
    (wait + 999) / 1000
}

/// ログインしていれば POESESSID を乗せる。
///
/// 2026-09-19 の調査。GGG スタッフ「レート制限はサイトが受け取ったリクエストが多すぎる時に起きる。
/// たいていは同じネットワークのサードパーティ製ツールが原因」= **IP 単位**。
/// コミュニティ側の対処として「トレードサイトに手でログインしておくと枠が増える」が挙がっている
/// (ログインすると匿名の IP 枠ではなく account の枠で数えられる)。
/// 取引履歴で使っているログイン (WebView の POESESSID) をそのまま乗せて確かめる。
/// 効かない / 悪化する時は取引履歴の画面からログアウトすれば元に戻る。
fn with_session(rb: reqwest::RequestBuilder, session: &Option<String>) -> reqwest::RequestBuilder {
    match session {
        Some(v) => rb.header(reqwest::header::COOKIE, format!("POESESSID={v}")),
        None => rb,
    }
}

const TRADE2_BASE: &str = "https://www.pathofexile.com/api/trade2";
/// 日本語サイト。検索 ID の名前空間が www と別なので、JP サイトで開く検索は JP の API で作る (2026-09-12)
const TRADE2_BASE_JP: &str = "https://jp.pathofexile.com/api/trade2";

fn base_for(site: &Option<String>) -> &'static str {
    match site.as_deref() {
        Some("jp") => TRADE2_BASE_JP,
        _ => TRADE2_BASE,
    }
}
const USER_AGENT: &str =
    "ExileDesk/0.1 (POE2 personal economy dashboard, Tauri app)";

/// オーナー判断 (2026-05-19): 日本語固定で取得（日本語クライアント表記との整合性）
const ACCEPT_LANGUAGE_VALUE: &str = "ja,en;q=0.9";

/// 共通 reqwest::Client ビルダー。User-Agent と Accept-Language を一括設定。
pub(crate) fn build_client() -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static(ACCEPT_LANGUAGE_VALUE));
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .default_headers(headers)
        .build()
        .map_err(|e| format!("client build error: {e}"))
}

/// search レスポンスのうち、件数だけ (trade2_search_count 用)
#[derive(Debug, Deserialize)]
struct SearchResponse {
    total: Option<u64>,
}

/// search request body (フロントエンドが組み立てる JSON をそのまま透過)。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRequest {
    pub league: String,
    /// "jp" なら jp.pathofexile.com の API を使う (既定 www)
    #[serde(default)]
    pub site: Option<String>,
    /// trade2 query 全体 (status/type/filters/sort 含む)。
    /// フロントで組み立てる JSON value をそのまま受け取って公式 API に POST する。
    pub query: serde_json::Value,
}

/// search を投げて total / id / 結果 ID 列を返す。
/// rate limit に当たった場合 Err。呼び側で適切に retry / throttle すること。
#[tauri::command]
pub async fn trade2_search(app: tauri::AppHandle, req: SearchRequest) -> Result<serde_json::Value, String> {
    trade2_search_with(crate::trade_history::session_value(&app), req).await
}

/// 本体。session はログイン中の POESESSID (無ければ匿名)。
/// 診断プローブ (examples) は AppHandle を持てないのでこちらを直接呼ぶ
pub async fn trade2_search_with(session: Option<String>, req: SearchRequest) -> Result<serde_json::Value, String> {
    let url = format!("{}/search/poe2/{}", base_for(&req.site), urlencode(&req.league));

    let client = build_client()?;

    // 上限に当たる前にここで待つ (画面の取得も裏の一括取得も同じ門を通る)
    gate_acquire("search").await?;
    let res = with_session(client.post(&url), &session)
        .json(&req.query)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    gate_note("search", res.headers());
    let status = res.status();
    // 429 は Retry-After を抽出してフロントで parse できる形で返す
    if status.as_u16() == 429 {
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let rl = rate_limit_headers(res.headers());
        let body = res.text().await.unwrap_or_default();
        gate_penalty("search", retry_after.parse::<i64>().unwrap_or(60), &rl, &body);
        return Err(format!(
            "trade2 search HTTP 429 retry-after={} ratelimit={}: {}",
            retry_after,
            rl,
            body.chars().take(1000).collect::<String>()
        ));
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 search HTTP {}: {}",
            status,
            body.chars().take(1000).collect::<String>()
        ));
    }

    let rl = rate_limit_headers(res.headers());
    let mut body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("json parse error: {e}"))?;
    if let Some(obj) = body.as_object_mut() {
        obj.insert("_ratelimit".to_string(), rl);
    }
    Ok(body)
}

/// 件数だけを返す軽量版。`total` を取り出してフロントで使いやすく。
#[tauri::command]
pub async fn trade2_search_count(app: tauri::AppHandle, req: SearchRequest) -> Result<u64, String> {
    let body = trade2_search(app, req).await?;
    let parsed: SearchResponse =
        serde_json::from_value(body).map_err(|e| format!("response parse error: {e}"))?;
    Ok(parsed.total.unwrap_or(0))
}

/// fetch request: search 後に listing id 列を 10 件以下の batch で照会する。
/// query_id は search のレスポンス `id` フィールドを渡す（trade2 の慣習で fetch URL に付ける）。
#[derive(Debug, Serialize, Deserialize)]
pub struct FetchRequest {
    /// 取得したい listing ID 列（trade2 制約により最大 10 件）
    pub ids: Vec<String>,
    /// search レスポンスの `id`（fetch URL の ?query= に乗せる）
    #[serde(rename = "queryId")]
    pub query_id: String,
    /// search と同じサイト ("jp" / 既定 www)
    #[serde(default)]
    pub site: Option<String>,
}

/// listing 詳細を取得する。レスポンス全体（`{ result: [...] }`）をそのままフロントに返す。
/// rate limit は門番 (gate_acquire) が待つので、呼び側で sleep は要らない。
#[tauri::command]
pub async fn trade2_fetch(app: tauri::AppHandle, req: FetchRequest) -> Result<serde_json::Value, String> {
    trade2_fetch_with(crate::trade_history::session_value(&app), req).await
}

/// 本体 (trade2_search_with と同じ理由で分けてある)
pub async fn trade2_fetch_with(session: Option<String>, req: FetchRequest) -> Result<serde_json::Value, String> {
    if req.ids.is_empty() {
        return Err("fetch ids is empty".to_string());
    }
    if req.ids.len() > 10 {
        return Err(format!(
            "fetch ids must be <= 10, got {}",
            req.ids.len()
        ));
    }
    let ids_csv = req.ids.join(",");
    let url = format!(
        "{}/fetch/{}?query={}",
        base_for(&req.site),
        ids_csv,
        urlencode(&req.query_id)
    );

    let client = build_client()?;

    gate_acquire("fetch").await?;
    let res = with_session(client.get(&url), &session)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    gate_note("fetch", res.headers());
    let status = res.status();
    // 429 は Retry-After を抽出してフロントで parse できる形で返す
    if status.as_u16() == 429 {
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let rl = rate_limit_headers(res.headers());
        let body = res.text().await.unwrap_or_default();
        gate_penalty("fetch", retry_after.parse::<i64>().unwrap_or(60), &rl, &body);
        return Err(format!(
            "trade2 fetch HTTP 429 retry-after={} ratelimit={}: {}",
            retry_after,
            rl,
            body.chars().take(1000).collect::<String>()
        ));
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 fetch HTTP {}: {}",
            status,
            body.chars().take(1000).collect::<String>()
        ));
    }

    let rl = rate_limit_headers(res.headers());
    let mut body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("json parse error: {e}"))?;
    if let Some(obj) = body.as_object_mut() {
        obj.insert("_ratelimit".to_string(), rl);
    }
    Ok(body)
}

/// x-rate-limit-* ヘッダをそのまま JSON にする (2026-09-14)。
/// フロントの擬似レート制限がサーバー側の実カウント (同じ IP の手動検索も含む) に合わせるために使う。
pub(crate) fn rate_limit_headers(h: &HeaderMap) -> serde_json::Value {
    let mut m = serde_json::Map::new();
    for (k, v) in h.iter() {
        let name = k.as_str();
        if name.starts_with("x-rate-limit-") {
            if let Ok(s) = v.to_str() {
                m.insert(name.to_string(), serde_json::Value::String(s.to_string()));
            }
        }
    }
    serde_json::Value::Object(m)
}

/// 簡易 URL encode (Rust 標準は無いので手書き、ASCII + - _ . ~ 以外はパーセント符号化)。
pub(crate) fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

#[cfg(test)]
mod rate_tests {
    use super::*;

    /// テスト用の最低間隔 (search 相当)
    const SPACING: i64 = 10_500;

    /// GATES は 1 つしか無いので、そこを触るテストは順番に走らせる
    static GLOBAL_TEST_LOCK: StdMutex<()> = StdMutex::new(());

    fn gate(sends: Vec<i64>, rules: Vec<Rule>, blocked_until: i64) -> Gate {
        Gate { sends, rules, blocked_until, ..Default::default() }
    }

    /// 枠が余っていれば待たない (ただし直前の送信からは最低 MIN_SPACING_MS 空ける)
    #[test]
    fn free_slot_does_not_wait() {
        let now = 1_000_000;
        let g = gate(vec![now - 11_000], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now, SPACING), 0);
    }

    /// 枠が空いていても 1 秒以内に連発はしない (2026-09-18: 手動の再取得が 3 発を 1 秒で出していた)
    #[test]
    fn burst_is_spaced_out() {
        let now = 1_000_000;
        let g = gate(vec![now - 500], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now, SPACING), 10_000, "直前の送信から 10.5 秒空ける");
    }

    /// 別経路が枠を使っている間は半分しか使わない
    #[test]
    fn foreign_traffic_halves_the_budget() {
        let now = 1_000_000;
        // 上限 10 / 600 秒。普段の余裕は 2 (8 件まで)、別経路が見えている時は半分 (5 件まで)
        let sends: Vec<i64> = (0..6).map(|i| now - 300_000 + i * 10_000).collect();
        let mut g = gate(sends, vec![(10, 600)], 0);
        assert_eq!(wait_for_rules(&g, now, SPACING), 0, "普段は 8 件まで使えるので 6 件なら待たない");
        g.foreign_seen_at = now - 1_000;
        assert!(wait_for_rules(&g, now, SPACING) > 0, "別経路が見えている間は 5 件で止める");
    }

    /// 上限の手前 (余裕 1) まで使ったら、一番古い送信が窓から出るまで待つ
    #[test]
    fn waits_until_oldest_leaves_the_window() {
        let now = 1_000_000;
        // 上限 5 / 10 秒 → 余裕 1 なので 4 件で止める。一番古いのは 3 秒前
        let sends = vec![now - 9_000, now - 8_000, now - 7_000, now - 6_000];
        let g = gate(sends, vec![(5, 10)], 0);
        // 9 秒前の分が窓 (10 秒) から出るまで = あと 1 秒 + 余白 0.3 秒。
        // ただし直前の送信 (6 秒前) から 10.5 秒の最低間隔の方が長いのでそちらが効く
        assert_eq!(wait_for_rules(&g, now, SPACING), 4_500);
    }

    /// 窓が複数ある時は一番長く待つ物に合わせる
    #[test]
    fn takes_the_longest_wait_of_all_windows() {
        let now = 1_000_000;
        let mut sends: Vec<i64> = (0..13).map(|i| now - 50_000 + i * 100).collect();
        sends.push(now - 11_000);
        let g = gate(sends, vec![(5, 10), (15, 60)], 0);
        // 60 秒窓 (上限 15、余裕 2 → 13 件) の方が長い
        assert!(wait_for_rules(&g, now, SPACING) > 9_000);
    }

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

    /// search と fetch は 1 つの枠として数える (罰則が IP 単位なので上限も IP 単位)。
    /// 別々に数えていた頃は、合計で 5 分 57 回投げて 429 を食らっていた (2026-09-18)
    #[test]
    fn search_and_fetch_share_one_budget() {
        // 適応する上限は全テストで共有なので、ここで基準値に戻してから測る
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
        let now = 1_000_000_000;
        let mut map = HashMap::new();
        // それぞれの上限 (30 / 50) には遠いが、合わせると search の 30 に届く
        map.insert("search".to_string(), gate((0..14).map(|i| now - i * 10_000).collect(), vec![(30, 300)], 0));
        map.insert("fetch".to_string(), gate((0..14).map(|i| now - i * 10_000 - 1_000).collect(), vec![(50, 300)], 0));
        for (kind, g) in map.iter() {
            assert_eq!(window_wait(&g.sends, &g.rules, now, false), 0, "{kind} 単体では空いている");
        }
        assert_eq!(combined_rules(&map), vec![(COMBINED_MAX_300, 300)], "5 分窓は実測に合わせた上限を使う");
        assert!(combined_wait(&map, now) > 0, "合計 28 回は 5 分の枠を超えているので待つ");
    }

    /// 429 を食らったら合計の上限を自分で下げ、下限より下には行かない (2026-09-19)
    #[test]
    fn a_penalty_lowers_the_combined_cap() {
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
        let now = now_ms();
        assert_eq!(lower_adaptive_max(now), COMBINED_MAX_300 * 3 / 4, "4 分の 3 に下がる");
        for _ in 0..20 {
            lower_adaptive_max(now);
        }
        assert_eq!(adaptive_max(), COMBINED_MIN_300, "下限より下には行かない");
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
    }

    /// 罰則中はその解除まで待つ
    #[test]
    fn penalty_blocks_until_it_clears() {
        let now = 1_000_000;
        let g = gate(vec![], vec![(5, 10)], now + 30_000);
        assert_eq!(wait_for_rules(&g, now, SPACING), 30_000);
    }
}

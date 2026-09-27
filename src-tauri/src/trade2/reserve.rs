//! trade2/reserve.rs — 取得 1 回分の信号の数で、枠の空きを待つ (2026-09-27)
//!
//! オーナー:「制限にならなかったら使えるから、その取得で制限になりそうなら待つって感じ。それぞれ取得ボタンの信号の数違うから
//! 一括一緒にしたらダメ」「管理は信号の数」。
//! 画面は取得を始める前に「検索 n 本 / 取得 m 本」を渡し、どの枠 (10 秒 / 60 秒 / 5 分 / 3 時間 …) でも 8 割を超えない所まで
//! 待つ ([[gate.rs]] の window_wait_n)。待っている間の理由と解除予定は RESERVE_WAIT に置き、状態 (market_flow_status) で画面の
//! タイマーに出す。中止は世代を進めて抜ける。
use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

/// 予約の世代 (中止で進める。待っている予約は世代が変わったら抜ける)
static RESERVE_GEN: AtomicU64 = AtomicU64::new(0);

/// 今待っている予約 (解除予定 ms, 理由, 枠の長さ 秒)。待っていなければ None
pub static RESERVE_WAIT: StdMutex<Option<(i64, WaitWhy, i64)>> = StdMutex::new(None);

/// 予約で「最後まで収まる」と確かめた本数 (検索, 取得, 期限 ms)。この本数までは門番が 1 本ごとの間隔 (バケット) を待たずに通す。
/// 枠 (各窓の 8 割・最低間隔・全窓口の 5 分合計) の判定はそのまま効く。使い切ったら、今までどおり間隔を待つ
static PASS: StdMutex<Option<(u32, u32, i64)>> = StdMutex::new(None);
/// 通し券の期限 (予約してから、これを過ぎたら使わない)
const PASS_TTL_MS: i64 = 10 * 60 * 1000;

/// その窓口の通し券が残っているか (門番が見る。減らさない)
pub fn pass_left(kind: &str, now: i64) -> bool {
    let Ok(g) = PASS.lock() else { return false };
    match *g {
        Some((s, f, until)) if now < until => if kind == "search" { s > 0 } else { f > 0 },
        _ => false,
    }
}
/// 通し券を 1 本使う (門番が実際に送った時)
pub fn pass_take(kind: &str) {
    if let Ok(mut g) = PASS.lock() {
        if let Some((s, f, _)) = g.as_mut() {
            if kind == "search" { *s = s.saturating_sub(1) } else { *f = f.saturating_sub(1) }
        }
    }
}
fn pass_clear(why: &str) {
    if let Ok(mut g) = PASS.lock() {
        if let Some((s, f, _)) = g.take() {
            if s + f > 0 {
                crate::app_log::line_static(&format!("[予約] 通し券の残り (検索 {s} / 取得 {f}) を捨てた ({why})"));
            }
        }
    }
}

/// 取得 1 回 (n 本) を**途中で制限にかからず最後まで回り切れるか**。回り切れないなら、回り切れるようになるまでの待ち。
///
/// 2026-09-27 オーナー:「取得して途中で制限にならないように作りたい。自動監視後すぐに忍者コピーで検索したら多分制限なるでしょ。
/// 全体で管理して、取得時に全部回りきれるなら待ち時間いらないし、取得中に制限かかるなら取得はできずに既定の時間になるまで待つ」。
///   - 最低間隔だけで 8 割以下に収まる短い枠 (search 2.6 秒おき × 8 割 4 本 ≥ 10 秒) は数えない (送る間隔が勝手に守る)
///   - それより長い枠 (60 秒 / 5 分 / 3 時間) は、使った数 + n が 8 割以下なら待たない。超えるなら古い方から出て入るまで待つ
///   - n が枠の 8 割より大きい (1 回で使い切る) 時は、どうやっても途中でかかるので枠が空になるまで待つ (簡易措置)
pub fn reserve_wait(sends: &[i64], rules: &[Rule], now: i64, n: usize, spacing_ms: i64) -> (i64, WaitWhy, i64) {
    let mut best = (0i64, WaitWhy::None, 0i64);
    if n == 0 {
        return best;
    }
    for &(max, period) in rules {
        let keep = ((max * 8) / 10).max(1) as usize;
        let window_ms = period * 1000;
        if spacing_ms * keep as i64 >= window_ms {
            continue;
        }
        let mut in_window: Vec<i64> = sends.iter().copied().filter(|t| *t > now - window_ms).collect();
        in_window.sort_unstable();
        let used = in_window.len();
        if used + n <= keep {
            continue;
        }
        let (wait, why) = if n >= keep {
            (in_window.last().map(|t| t + window_ms + 300 - now).unwrap_or(0), WaitWhy::Whole)
        } else {
            let out = (used + n - keep).min(used);
            (in_window.get(out.saturating_sub(1)).map(|t| t + window_ms + 300 - now).unwrap_or(0), WaitWhy::Slot)
        };
        if wait > best.0 {
            best = (wait, why, period);
        }
    }
    best
}

/// 全窓口を合わせた 5 分の上限を「8 割にした後の数」として持つための逆算 (reserve_wait は受け取った max の 8 割で見る)
fn combined_frame_max() -> u32 {
    ((combined_cap() * 10 + 7) / 8).max(1) as u32
}

/// その窓口で n 本の取得を回り切れるまでの待ち (罰則も含む)
fn wait_for(map: &HashMap<String, Gate>, kind: &str, n: usize, now: i64) -> (i64, WaitWhy, i64) {
    let Some(g) = map.get(kind) else { return (0, WaitWhy::None, 0) };
    let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
    let (mut wait, mut why, mut period) = reserve_wait(&g.sends, &rules, now, n, min_spacing_ms(kind));
    let blocked = g.blocked_until - now;
    if blocked > wait {
        (wait, why, period) = (blocked, WaitWhy::Slot, 0);
    }
    (wait, why, period)
}

/// 検索 searches 本 / 取得 fetches 本の取得を、途中で制限にかからず回り切れるまで待つ。max_wait_ms を超えるなら諦めて Err
#[tauri::command]
pub async fn trade2_reserve(searches: u32, fetches: u32, max_wait_ms: i64) -> Result<(), String> {
    let gen = RESERVE_GEN.load(Ordering::SeqCst);
    let mut waited = 0i64;
    // 待ちの理由が変わった時だけ書く (1 秒ごとに書かない)
    let mut logged: Option<(WaitWhy, i64)> = None;
    let result = loop {
        if RESERVE_GEN.load(Ordering::SeqCst) != gen {
            break Err("中止しました".to_string());
        }
        let (wait, why, period) = {
            let Ok(mut guard) = GATES.lock() else { break Ok(()) };
            let map = guard.get_or_insert_with(HashMap::new);
            let now = now_ms();
            let a = wait_for(map, "search", searches as usize, now);
            let b = wait_for(map, "fetch", fetches as usize, now);
            // 全窓口を合わせた 5 分の上限 (IP 単位。一番きつい枠) も同じ決まりで見る
            let all: Vec<i64> = map.values().flat_map(|g| g.sends.iter().copied()).collect();
            let c = reserve_wait(&all, &[(combined_frame_max(), 300)], now, (searches + fetches) as usize, 0);
            [a, b, c].into_iter().max_by_key(|x| x.0).unwrap_or((0, WaitWhy::None, 0))
        };
        if wait <= 0 {
            break Ok(());
        }
        if waited + wait > max_wait_ms {
            break Err(format!("trade2 の枠待ち (あと {} 秒)", (wait + 999) / 1000));
        }
        if logged != Some((why, period)) {
            logged = Some((why, period));
            crate::app_log::line_static(&format!(
                "[予約] 検索 {searches} / 取得 {fetches} 本: 待つ あと {} 秒 (理由 {why:?}、枠 {period} 秒)",
                (wait + 999) / 1000
            ));
        }
        if let Ok(mut w) = RESERVE_WAIT.lock() {
            *w = Some((now_ms() + wait, why, period));
        }
        let step = wait.min(1000);
        waited += step;
        tokio::time::sleep(Duration::from_millis(step as u64)).await;
    };
    if let Ok(mut w) = RESERVE_WAIT.lock() {
        *w = None;
    }
    if result.is_ok() {
        if let Ok(mut g) = PASS.lock() {
            *g = Some((searches, fetches, now_ms() + PASS_TTL_MS));
        }
    }
    match &result {
        Ok(()) if waited > 0 => crate::app_log::line_static(&format!("[予約] 検索 {searches} / 取得 {fetches} 本: {} 秒待って開始", waited / 1000)),
        Ok(()) => crate::app_log::line_static(&format!("[予約] 検索 {searches} / 取得 {fetches} 本: 待たずに開始")),
        Err(e) => crate::app_log::line_static(&format!("[予約] 検索 {searches} / 取得 {fetches} 本: 始めない ({e}、{} 秒待った)", waited / 1000)),
    }
    result
}

/// 画面の機能が取引所を使っているか (使っている間は自動の巡回を始めない)
static UI_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
pub fn ui_trade_busy() -> bool {
    UI_BUSY.load(Ordering::SeqCst)
}
/// 画面から: 取引所を使い始めた / 終えた (オーナー 2026-09-27「トレード使えるのは 1 タブだけ」)
#[tauri::command]
pub fn trade2_set_ui_busy(busy: bool) {
    if !busy {
        pass_clear("使用権を離した");
    }
    if UI_BUSY.swap(busy, Ordering::SeqCst) != busy {
        crate::app_log::line_static(if busy { "[使用中] 画面の機能が取引所を使い始めた (巡回は始めない)" } else { "[使用中] 画面の機能が取引所を離した" });
    }
}

/// 待っている予約を止める (中止ボタン)
#[tauri::command]
pub fn trade2_reserve_cancel() {
    RESERVE_GEN.fetch_add(1, Ordering::SeqCst);
    crate::app_log::line_static("[予約] 中止 (待っている予約を止めた)");
    pass_clear("中止");
}

#[cfg(test)]
mod tests {
    use super::*;
    const RULES: [Rule; 3] = [(5, 10), (15, 60), (30, 300)];

    /// 空いていれば、取得全体 (6 本) が回り切れるので待たない。10 秒の枠は送る間隔が守るので数えない
    #[test]
    fn fits_without_waiting() {
        let now = 10_000_000;
        assert_eq!(reserve_wait(&[now - 1_000, now - 500], &RULES, now, 6, 2_600).0, 0);
    }

    /// 自動監視の直後 (5 分に 20 本使った) に 8 本の取得 → 8 割 (24) を超えるので、4 本分が空くまで待つ
    #[test]
    fn waits_when_the_fetch_would_hit_the_limit_midway() {
        let now = 10_000_000;
        let sends: Vec<i64> = (0..20).map(|i| now - 250_000 + i * 10_000).collect();
        let (wait, why, period) = reserve_wait(&sends, &RULES, now, 8, 2_600);
        assert_eq!((why, period), (WaitWhy::Slot, 300));
        // 古い方から 4 本目 (220 秒前) が 5 分の枠から出るまで
        assert_eq!(wait, 80_300);
    }

    /// 1 回で枠の 8 割より多く使う取得は、枠が空になってから始める (簡易措置)
    #[test]
    fn a_fetch_larger_than_the_frame_waits_until_empty() {
        let now = 10_000_000;
        let sends = vec![now - 100_000, now - 30_000];
        let (wait, why, period) = reserve_wait(&sends, &RULES, now, 40, 2_600);
        assert_eq!((why, period), (WaitWhy::Whole, 300));
        assert_eq!(wait, 270_300);
    }
}

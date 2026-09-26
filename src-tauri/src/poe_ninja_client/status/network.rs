//! poe_ninja_client/status/network.rs — 画面に出すネットワーク状態 (NetworkStatus / get_network_status) と罰則の記録
//!
//! status.rs から分割 (2026-09-26)。
use super::*;

/// 現在のネットワーク状態 (TS UI の polling 用)。
///
/// 旧 `RateLimitStatus` を発展させ、retry 情報も統合した payload。
/// rename 経緯 (2026-05-23): 「4 並列の 1-2 件が retry sleep 中」の表示が
/// rate-limit ペナルティとは別軸で必要になったため、命名も `NetworkStatus`
/// (= 通信全般の現在状態) に広げた。
#[derive(Serialize, Clone, Debug)]
pub struct NetworkStatus {
    /// 現在グローバルペナルティ待機中か (= until_ms > now)。
    /// 旧 `waiting` のリネーム — 「rate-limit ペナルティ (= 全タスク一斉停止)」用。
    pub global_penalty_waiting: bool,
    /// グローバルペナルティ解除まで残り秒数 (waiting=false の時は 0)
    pub global_penalty_remaining_secs: u64,
    /// 最後にグローバルペナルティを受けた理由 (例: "429 Too Many Requests")
    pub global_penalty_reason: Option<String>,
    /// 現在 retry sleep 中のタスク数 (5xx/429 backoff 中)。
    /// 4 並列中で 1-2 件が retry なら 1 or 2、全件正常なら 0。
    pub active_retry_count: usize,
    /// 直近 retry の理由 (例: "522 Bad Gateway")。retry 一度も発生していなければ None。
    pub last_retry_reason: Option<String>,
    /// 直近 retry の残秒数 (sleep 終了予定までの残り)。
    /// `LAST_RETRY_INFO.until_ms` が過去になれば 0 を返す。
    pub last_retry_remaining_secs: u64,
    /// ON/OFF サイクルの現在フェーズ。
    /// Some("on") / Some("off") / None (= まだサイクル未開始 = 取得中ではない)。
    /// UI 側で「🛌 休憩中」表示に使う想定 (現状は次 Phase で実装)。
    pub cycle_phase: Option<String>,
    /// 現在フェーズの残秒数。
    ///   - phase="off" のとき: OFF 期間が終わるまで (= 次の ON 開始まで)
    ///   - phase="on" / None のとき: 0 (UI 側で「休憩中」を出さない)
    pub cycle_remaining_secs: u64,
}

/// 今残っているレート制限の罰則 (無ければ 0)。
///
/// `RateGate` はコマンドごとに作り直すので、罰則を覚えているのはこのグローバルだけ。
/// 新しく作ったゲートにこれを入れておかないと、解除前に投げて 429 を再発させる
/// (2026-09-18 オーナー報告「すぐレート制限になる」の一因)。
pub fn global_penalty_remaining() -> Duration {
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let until = CURRENT_PENALTY_UNTIL_MS.load(Ordering::Relaxed);
    if until > now_ms {
        Duration::from_millis(until - now_ms)
    } else {
        Duration::ZERO
    }
}

/// UI が 1 秒ごとに呼ぶ「現在のネットワーク状態」command。
/// AtomicU64/AtomicUsize のロード + 短期 Mutex<Option<...>> ロードだけなので極めて高速。
///
/// 旧名 `get_rate_limit_status` からのリネーム (2026-05-23) — retry 情報を含む
/// より広いネットワーク状態 payload を返すため。TS 側も合わせて更新。
#[tauri::command]
pub fn get_network_status() -> NetworkStatus {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // --- グローバルペナルティ (旧 RateLimitStatus 相当) ---
    let penalty_until_ms = CURRENT_PENALTY_UNTIL_MS.load(Ordering::Relaxed);
    let global_penalty_waiting = penalty_until_ms > now_ms;
    let global_penalty_remaining_secs = if global_penalty_waiting {
        (penalty_until_ms - now_ms) / 1000
    } else {
        0
    };
    let global_penalty_reason = LAST_PENALTY_REASON
        .lock()
        .ok()
        .and_then(|g| g.clone());

    // --- retry 情報 (新規) ---
    let active_retry_count = ACTIVE_RETRY_COUNT.load(Ordering::Relaxed);
    let (last_retry_reason, last_retry_remaining_secs) = match LAST_RETRY_INFO.lock().ok().and_then(|g| g.clone()) {
        Some(info) => {
            let remaining_secs = if info.until_ms > now_ms {
                (info.until_ms - now_ms) / 1000
            } else {
                0
            };
            (Some(info.reason), remaining_secs)
        }
        None => (None, 0),
    };

    // --- ON/OFF サイクル (2026-05-23) ---
    // CURRENT_OFF_END_MS は acquire の OFF 検出時に「OFF 終了時刻」を書き込む。
    // 過去になれば自動的に ON フェーズとして扱う (= リセット書き込み不要)。
    // 0 のままなら「まだ acquire が一度も呼ばれていない」 or 「OFF にまだ入っていない」
    // = phase は None として UI には何も表示しない。
    let off_end_ms = CURRENT_OFF_END_MS.load(Ordering::Relaxed);
    let (cycle_phase, cycle_remaining_secs) = if off_end_ms == 0 {
        (None, 0)
    } else if off_end_ms > now_ms {
        let remaining = (off_end_ms - now_ms) / 1000;
        (Some("off".to_string()), remaining)
    } else {
        // OFF 終了済 = 現在 ON 期間中 (or サイクル外)。UI 側で「休憩中」を消すために
        // phase="on" を明示的に返す (None だと「まだ未開始」と区別がつかない)。
        (Some("on".to_string()), 0)
    };

    NetworkStatus {
        global_penalty_waiting,
        global_penalty_remaining_secs,
        global_penalty_reason,
        active_retry_count,
        last_retry_reason,
        last_retry_remaining_secs,
        cycle_phase,
        cycle_remaining_secs,
    }
}

/// `set_penalty` から呼ばれる: global state を更新して UI に可視化させる。
/// `until_instant` は Tokio の `Instant` (単調時計) 由来なので、UNIX epoch に
/// 変換するために「現在の差分」を SystemTime ベースで再計算する。
pub(crate) fn record_penalty_for_ui(until_instant: Instant, reason: Option<String>) {
    let now_instant = Instant::now();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let remaining_ms = if until_instant > now_instant {
        until_instant.duration_since(now_instant).as_millis() as u64
    } else {
        0
    };
    let target_ms = now_ms + remaining_ms;
    // 「既存ペナルティが長ければ伸ばさない」(max を取る) のは set_penalty 側で
    // 行う前提だが、ここでも fetch_max でガードしておく。
    CURRENT_PENALTY_UNTIL_MS.fetch_max(target_ms, Ordering::Relaxed);
    if let Some(r) = reason {
        if let Ok(mut g) = LAST_PENALTY_REASON.lock() {
            *g = Some(r);
        }
    }
}

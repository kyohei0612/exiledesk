//! キャンセルフラグ / ペナルティ・リトライ状態の可視化 / NetworkStatus (get_network_status)
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// Cancel flag (Medium-M7, 2026-05-22)
// ============================================================================
//
// craft_v2_fetch_all は数百回の HTTP リクエストを並列実行する長時間タスク。
// 旧実装は UI からのキャンセル手段なし → ユーザは window を閉じるしかなかった。
//
// 最小実装ポリシー:
//   - グローバル static AtomicBool 1 つ
//   - `craft_v2_cancel` Tauri command が flag を true にする
//   - fetch ループ (アセンダンシー loop / character spawn task) が随所で `.load()` 確認、
//     true なら早期 return (中途キャッシュは emit 済みなので失われない)
//   - fetch 開始時 (`craft_v2_fetch_all` 入口) に flag を false にリセット
//
// より厳密な CancellationToken (tokio-util) を使わない理由:
//   - 依存追加を避けつつ最小実装を優先 (UI 連携は別 Phase)
//   - HTTP リクエスト中断ではなく「次の HTTP 開始前にチェック」で十分

/// グローバルキャンセルフラグ。
/// `craft_v2_cancel` で true にセット、`craft_v2_fetch_all` 開始時に false にリセット。
pub(crate) static CRAFT_V2_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

/// fetch ループから随時呼び出し、キャンセル要求が来ていれば true を返すヘルパ。
pub(crate) fn is_cancel_requested() -> bool {
    CRAFT_V2_CANCEL_FLAG.load(Ordering::Relaxed)
}

/// UI 側から呼ぶキャンセル commaand。fetch 中であれば次のチェックポイントで停止する。
/// 既に停止済 / 未開始でも安全 (flag を立てるだけ)。
#[tauri::command]
pub fn craft_v2_cancel() {
    CRAFT_V2_CANCEL_FLAG.store(true, Ordering::Relaxed);
}

// ============================================================================
// Rate limit penalty 可視化 (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「残り取得中で止まるのって実際何してんの、結構長いけどリミット待ち?」
//   への回答として、Cloudflare 1015 ペナルティ / 429 backoff 中の残秒数を UI に
//   リアルタイム表示するための global state。
//
// 設計判断:
//   - `CURRENT_PENALTY_UNTIL_MS`: AtomicU64 (UNIX epoch ms、0 = ペナルティなし)。
//     RateGate::set_penalty で書き込み、TS 側 polling から読み込む。
//     1 回の load/store だけで完結する単純な数値なので AtomicU64 (lock-free)
//     を採用 — Mutex を取らないので polling 側もペナルティ書き込み側も
//     一切ブロックされない。値を「時刻」として保持し、TS 側で `now` と比較する
//     ことで「ペナルティ解除時にリセットを忘れる」競合が原理的に発生しない
//     (時刻が過去になれば自動的に waiting=false になる)。
//
//   - `LAST_PENALTY_REASON`: Mutex<Option<String>>。
//     String を atomic に扱う primitive が無いため Mutex で保護。
//     書き込みは 429/5xx 検出時のみ (= 数秒〜数分に 1 回)、読み込みは UI polling
//     から 1 秒に 1 回 → lock 競合は実質ゼロ。標準 std::sync::Mutex を採用
//     (tokio::sync::Mutex は async 用途、ここは同期 command なので不要)。
//
// なぜ atomic と mutex を混在させたか:
//   - 数値 (u64) は AtomicU64 で十分高速
//   - String は AtomicPtr 等を組むより Mutex の方が安全 & 短期 lock
//   - lock-free / lock 制御は「アクセス頻度」と「データ型」のバランス選択
pub(crate) static CURRENT_PENALTY_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
pub(crate) static LAST_PENALTY_REASON: StdMutex<Option<String>> = StdMutex::new(None);

// ============================================================================
// per-character 進捗可視化 (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「取得中ってのは新しいキャラを取り込むときの取得中の事だよ?
//   何で何も取得中に待ってる感じにしてんの」への対応。
//   1 アセ内のキャラ取得進捗 (32/50 など) と現在の並列度を UI に流す。
//
// 設計判断:
//   - `ACTIVE_FETCH_COUNT`: AtomicUsize、`http_get_with_backoff` 前後で fetch_add/sub。
//     並列度 snapshot は emit 時に `load(Relaxed)` で読み込むのみ — lock 不要。
//   - per-character emit は **5 キャラ毎にバッチ** (= 並列 4 で動いてる時、約 1 秒に 1 回)
//     にする。全 50 キャラ毎回 emit すると Tauri IPC オーバーヘッドが上がる。
//     例外: phase 切り替え時 (search→fetching, fetching→completed) は即時 emit。

/// 現在 outbound HTTP リクエストを発行中のタスク数。
/// `http_get_with_backoff` の入口で +1、return 直前 (await 後) で -1。
/// per-character progress emit 時に `current_concurrency` として詰める。
pub(crate) static ACTIVE_FETCH_COUNT: AtomicUsize = AtomicUsize::new(0);

/// fetch ループ内で active fetch count を増減する RAII guard。
/// Drop で必ず減らすので、panic / early return / await 中断のどれでも漏れない。
pub(crate) struct ActiveFetchGuard;
impl ActiveFetchGuard {
    pub(crate) fn new() -> Self {
        ACTIVE_FETCH_COUNT.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for ActiveFetchGuard {
    fn drop(&mut self) {
        ACTIVE_FETCH_COUNT.fetch_sub(1, Ordering::Relaxed);
    }
}

// ============================================================================
// retry 中タスク数の可視化 (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「キャラ取得中でしばらく止まるのはなんでなん? 途中で止まる時あるけど
//   あれなにしてんのそこ」への対応。4 並列のうち 1-2 件が 5xx/429 backoff の sleep
//   中なのに、他の完了済キャラの Semaphore permit を解放できず「N/50 が止まって見える」
//   問題に対し、UI 側で「🔁 再試行中 N 件 (522 Bad Gateway 残 8 秒)」を表示する。
//
// 設計判断:
//   - `ACTIVE_RETRY_COUNT`: AtomicUsize、retry sleep 直前で +1、sleep 完了で -1。
//     RAII guard で panic / early return も漏れない。
//   - `LAST_RETRY_INFO`: StdMutex<Option<RetryInfo>>。直近の retry の理由 + 終了時刻
//     を 1 件だけ保持 (複数並列の場合は最後に書いたもので上書き、UI は 1 行表示なので
//     これで十分)。読み込みは UI polling 1Hz、書き込みは retry 発生時のみ。
pub(crate) static ACTIVE_RETRY_COUNT: AtomicUsize = AtomicUsize::new(0);

/// 直近の retry 情報 (UI polling 用)。
/// `LAST_RETRY_INFO` に格納し、retry sleep 完了後も「最後に何が起きたか」として残す。
/// `until_ms` が過去になれば UI 側は残秒数 0 として扱う。
#[derive(Clone, Debug)]
pub(crate) struct RetryInfo {
    /// 例: "522 Bad Gateway", "429 Too Many Requests"
    reason: String,
    /// sleep が終わる epoch ms (UI 側で `now - until_ms` から残秒数を計算)
    until_ms: u64,
}

pub(crate) static LAST_RETRY_INFO: StdMutex<Option<RetryInfo>> = StdMutex::new(None);

/// retry sleep 中のタスク数を増減する RAII guard。
/// `http_get_with_backoff` で sleep 直前に `new()`、sleep 後に drop することで
/// panic / early return / await 中断のどれでも ACTIVE_RETRY_COUNT が漏れない。
pub(crate) struct ActiveRetryGuard;
impl ActiveRetryGuard {
    pub(crate) fn new() -> Self {
        ACTIVE_RETRY_COUNT.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for ActiveRetryGuard {
    fn drop(&mut self) {
        ACTIVE_RETRY_COUNT.fetch_sub(1, Ordering::Relaxed);
    }
}

/// 直近 retry の理由 + 終了時刻を global state へ書き込む。
/// `http_get_with_backoff` の 429/5xx 分岐で sleep 直前に呼ぶ。
pub(crate) fn record_retry_info(reason: String, retry_after_ms: u64) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let until_ms = now_ms + retry_after_ms;
    if let Ok(mut g) = LAST_RETRY_INFO.lock() {
        *g = Some(RetryInfo { reason, until_ms });
    }
}

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

//! Cloudflare 1015 閾値実測ログ (req 通し番号 / 60 秒 rolling window) と ON/OFF サイクルログ
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// Cloudflare 1015 閾値実測ログ (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「1 並列 500ms でも制限くらう、絶対おかしい、原因解明してくれ」
//   への対応として、各 outbound HTTP リクエストに通し番号 + 直近 60 秒以内の
//   リクエスト数 + セッション経過秒を eprintln! で stderr に詳細出力する。
//
//   これにより「N req in 60 秒で Cloudflare 1015 (= HTTP 429) を食らった」が
//   実測でき、閾値が逆算できる。
//
// 設計判断:
//   - `REQ_COUNTER`: AtomicU64、req# のシーケンス採番 (0001 から)。
//   - `REQ_TIMESTAMPS`: StdMutex<VecDeque<Instant>>、直近 60 秒以内に発行した
//     リクエストの送信時刻のみ保持する rolling window。先頭から古いものを pop して
//     常に 60 秒以内のサンプルだけを残す。lock 範囲は push + 削除 + 長さ取得のみ
//     なので短期 lock、競合は無視できる。
//   - `SESSION_START`: OnceLock<Instant>、プロセス起動からの経過秒を測る基準点。
//     `OnceLock::get_or_init` は thread-safe で最初の 1 回だけ初期化される。
//
// なぜ once_cell ではなく OnceLock:
//   - Cargo.toml に once_cell 依存を追加するのを避けるため (std で代替可能)。
//   - std::sync::OnceLock は Rust 1.70 以降で安定、本プロジェクトは edition=2021 + 最新版 OK。

/// プロセス開始時刻 (= 1 度だけ Instant::now() で初期化)。
/// `SESSION_START.get_or_init(Instant::now)` で thread-safe に初期化される。
pub(crate) static SESSION_START: OnceLock<Instant> = OnceLock::new();

/// 累計リクエスト番号。`fetch_add(1, Relaxed) + 1` で 0001 始まりの連番を採番。
pub(crate) static REQ_COUNTER: AtomicU64 = AtomicU64::new(0);

/// 直近 60 秒以内に発行したリクエスト時刻の rolling window。
/// `record_request_time` で push + 古い要素を pop + 長さを返す。
pub(crate) static REQ_TIMESTAMPS: StdMutex<VecDeque<Instant>> = StdMutex::new(VecDeque::new());

/// セッション開始からの経過秒 (f64)。
/// `SESSION_START` が未初期化なら `Instant::now()` で初期化してから 0.0 を返す。
pub(crate) fn session_elapsed_secs() -> f64 {
    SESSION_START
        .get_or_init(Instant::now)
        .elapsed()
        .as_secs_f64()
}

/// `now` を rolling window に push し、60 秒より古い要素を削除した後の長さを返す。
/// (= 「直近 60 秒間に何件発行したか」を即座に取得)
pub(crate) fn record_request_time(now: Instant) -> usize {
    let mut deque = match REQ_TIMESTAMPS.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    deque.push_back(now);
    while let Some(&front) = deque.front() {
        if now.duration_since(front) > Duration::from_secs(60) {
            deque.pop_front();
        } else {
            break;
        }
    }
    deque.len()
}


// ============================================================================
// ON/OFF サイクル: 共有 state + ログ出力ヘルパ (2026-05-23)
// ============================================================================
//
// 目的:
//   Cloudflare 1015 の発火条件が「短時間の累積 req 数」ではなく「連続送信の継続時間」
//   なら、定期的に完全休止を挟むことで token bucket をリセットさせ、ペナルティを
//   回避できる仮説に基づき、ON 期間 + OFF 期間サイクル送信を導入。
//
// 設計判断:
//   - RateGateState 内で cycle_started_at を保持 (= acquire 呼び出しと同じ lock 内で更新)
//   - 加えて UI 表示用に「現在 OFF 中かどうか」をグローバルに公開: AtomicU64 で
//     OFF 終了時刻 (epoch ms) を持ち、`get_network_status` から polling 可能にする。
//   - log_cycle_event: ON/OFF 遷移を session_elapsed_secs を交えて eprintln。
//     ログから「ON/OFF サイクルが実際に効いているか」「req# との対応」が読める。
//
// なぜ global state も用意するか:
//   RateGateState は async Mutex 越しなので Tauri command (sync) から読みづらい。
//   AtomicU64 の OFF_END_MS は lock-free で即時 polling 可能 — UI 1Hz 更新と相性が良い。
//   書き込みは acquire / penalty 設定時のみ (= 数百回/取得で済む)。

/// 現在の OFF 期間が終わる epoch ms (0 = ON 中 or サイクル未開始)。
/// `acquire` で OFF 検出時に「次サイクル開始時刻」を SystemTime ベースに変換して書き込む。
/// UI polling が SystemTime::now() と比較して残秒数を計算する。
pub(crate) static CURRENT_OFF_END_MS: AtomicU64 = AtomicU64::new(0);

/// ON/OFF サイクルログを stderr に出力。session_elapsed_secs を絡めて時系列で読みやすく。
/// `event`: "ON period started" / "OFF period entered, deferring to next cycle" 等。
/// `from`/`to`: Tokio Instant (単調時計)。差分から「いつから・いつまで」を表示。
///
/// 戻り値は () のみ (`let _ = log_cycle_event(...)` で破棄)。
pub(crate) fn log_cycle_event(event: &str, from: Instant, to: Instant) {
    let now_instant = Instant::now();
    let session_t = session_elapsed_secs();
    let from_offset = if from >= now_instant {
        from.duration_since(now_instant).as_secs_f64()
    } else {
        -now_instant.duration_since(from).as_secs_f64()
    };
    let to_offset = if to >= now_instant {
        to.duration_since(now_instant).as_secs_f64()
    } else {
        -now_instant.duration_since(to).as_secs_f64()
    };
    eprintln!(
        "[rate-cycle] {} — T+{:.1}s (from T+{:.1}s, to T+{:.1}s)",
        event,
        session_t,
        session_t + from_offset,
        session_t + to_offset,
    );
}

/// `acquire` の OFF 検出時に呼ばれ、UI polling 用に OFF 終了時刻 (epoch ms) を更新する。
/// `off_end` は Tokio `Instant` (単調時計) 由来なので、SystemTime に変換するために
/// 「now との差分」を計算して足す。
pub(crate) fn record_off_end_for_ui(off_end: Instant) {
    let now_instant = Instant::now();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let remaining_ms = if off_end > now_instant {
        off_end.duration_since(now_instant).as_millis() as u64
    } else {
        0
    };
    let target_ms = now_ms + remaining_ms;
    // ON 中に OFF 情報を消す: target_ms が「過去」になっていたら 0 に書き戻す。
    // 単純化のため fetch_max ではなく直接 store (= 常に最新を書き込む)。
    CURRENT_OFF_END_MS.store(target_ms, Ordering::Relaxed);
}

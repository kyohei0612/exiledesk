//! グローバルレートゲート (最小送信間隔 + ペナルティ + ON/OFF サイクル)
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// レート制限: グローバルゲート
// ============================================================================

/// グローバルレートゲート: すべての outbound request が最低 MIN_REQUEST_INTERVAL_MS 間隔で送信される。
///
/// Semaphore (並列度上限) と独立して動く。並列度 5 で同時に 5 タスクが request を投げようとしても、
/// このゲートが順次 280ms ずつ間隔を空けてリリースする。
///
/// 低レベル fetch 関数 (`fetch_*`) を pub 公開するため、本体も pub にする。
///
/// 2026-05-22 Rust-H1+H2 修正:
///   旧実装は `last_sent` を lock → drop → sleep → 再取得 する形で、
///   ペナルティ解除直後に複数タスクが同時通過 → Cloudflare 1015 残存。
///   新実装は「予約時刻ベース」: lock を持つ間に next_slot を進めるだけで
///   sleep はしない。各タスクは順に reserved 時刻を受け取り、lock を drop した
///   後に sleep_until で待つ。これにより:
///     - 4 タスクが順番に 280ms 刻みの reserved 時刻を取得する
///     - ペナルティ反映も同じロック内で一括処理 → 解除集中なし
///     - lock 保持中に sleep しない → デッドロックなし
#[derive(Clone)]
pub struct RateGate {
    /// (next_slot, penalty_until) を atomically に扱う。
    /// next_slot: 次に発行できる送信時刻 (単調増加)。
    /// penalty_until: 429 ペナルティで全タスクが揃って待つ時刻。
    state: Arc<Mutex<RateGateState>>,
    min_interval: Duration,
}

pub(crate) struct RateGateState {
    /// 次に予約可能な送信時刻 (各 acquire は自分の slot を受け取った後この値を更新する)
    next_slot: Instant,
    /// 429 ペナルティ: この時刻まで送信禁止
    penalty_until: Instant,
    /// 現在の ON 期間が始まった時刻 (None = まだ最初の acquire が来ていない)。
    /// ON_PERIOD_MS 経過で OFF 期間に入り、ON_PERIOD_MS + OFF_PERIOD_MS 経過で
    /// 自動的に次サイクルが開始される (= cycle_started_at を最新時刻に更新)。
    /// set_penalty とは独立: ペナルティ中も ON/OFF サイクルは時間で進行する。
    cycle_started_at: Option<Instant>,
}

impl RateGate {
    pub fn new(min_interval_ms: u64) -> Self {
        let past = Instant::now() - Duration::from_millis(min_interval_ms * 2);
        Self {
            state: Arc::new(Mutex::new(RateGateState {
                next_slot: past,
                penalty_until: past,
                cycle_started_at: None,
            })),
            min_interval: Duration::from_millis(min_interval_ms),
        }
    }

    /// 1 リクエスト分の枠が空くまで待つ。
    /// 予約時刻ベース: lock 保持中に slot を確定 → drop → sleep_until。
    /// 複数タスクが同時に呼んでも reserved 時刻は単調増加 + min_interval 刻みで配布される。
    ///
    /// 2026-05-23 ON/OFF サイクル対応:
    /// reserved 時刻が現在サイクルの OFF 期間内に入る場合、次サイクルの ON 開始
    /// (= off_end) まで遅延させる。サイクルは「ON 15 秒 + OFF 10 秒」を 1 周期とし、
    /// 最初の acquire 呼び出しで cycle_started_at が初期化される。
    /// 周期経過後の reserved 時刻に対しては、cycle_started_at を新サイクルに進める
    /// (= ループバックして自然に ON 期間として扱う)。
    pub async fn acquire(&self) {
        let send_at = {
            let mut guard = self.state.lock().await;
            let now = Instant::now();
            // 自分の予約時刻: 「今」「次空きスロット」「ペナルティ解除時刻」の最大値。
            // どれが大きくても順序関係は崩れない (next_slot が単調増加するため)。
            let mut reserved = now.max(guard.next_slot).max(guard.penalty_until);

            // ----- ON/OFF サイクル判定 -----
            let on_period = Duration::from_millis(ON_PERIOD_MS);
            let off_period = Duration::from_millis(OFF_PERIOD_MS);
            let cycle_total = on_period + off_period;

            // reserved 時刻が「どのサイクルに属するか」を判定するため、
            // 必要なら cycle_started_at を最新サイクルへ進める。
            // 初回 (None) は reserved を新サイクル開始時刻として記録。
            // 既存サイクル開始から `cycle_total` 以上経過した reserved に対しては、
            // 経過したサイクル数だけ繰り上げて新サイクル開始時刻を再計算する
            // (= reserved を含むサイクルの先頭に揃える)。
            let cycle_start = match guard.cycle_started_at {
                None => {
                    guard.cycle_started_at = Some(reserved);
                    let _ = log_cycle_event("ON period started", reserved, reserved + on_period);
                    reserved
                }
                Some(start) => {
                    if reserved >= start + cycle_total {
                        // reserved が現在サイクル外。何サイクル進んだか計算して
                        // 新サイクル開始時刻に揃える。
                        let elapsed = reserved.duration_since(start);
                        let cycles_elapsed = elapsed.as_millis() / cycle_total.as_millis();
                        // u128 → u64 サイクル幅。1 サイクル = 25 秒なので u64 で十分。
                        let advance = cycle_total
                            .checked_mul(cycles_elapsed as u32)
                            .unwrap_or(Duration::ZERO);
                        let new_start = start + advance;
                        guard.cycle_started_at = Some(new_start);
                        let _ = log_cycle_event(
                            "ON period started",
                            new_start,
                            new_start + on_period,
                        );
                        new_start
                    } else {
                        start
                    }
                }
            };

            let on_end = cycle_start + on_period;
            let off_end = cycle_start + cycle_total;

            // reserved が OFF 期間内 (on_end <= reserved < off_end) なら、次サイクル
            // 開始 (off_end) まで遅延させる。同時に cycle_started_at も次サイクル
            // 開始時刻に更新 (これにより以降の reserved は新サイクルの ON 期間として扱われる)。
            if reserved >= on_end && reserved < off_end {
                let new_start = off_end;
                let _ = log_cycle_event(
                    "OFF period entered, deferring to next cycle",
                    reserved,
                    new_start,
                );
                // UI polling 用に「OFF 終了時刻」を公開 (= 残秒数表示の元ネタ)。
                record_off_end_for_ui(new_start);
                reserved = new_start;
                guard.cycle_started_at = Some(new_start);
                let _ = log_cycle_event(
                    "ON period started",
                    new_start,
                    new_start + on_period,
                );
            }

            // 次の呼び出しは reserved + min_interval 以降にしか発行できない。
            guard.next_slot = reserved + self.min_interval;
            reserved
        };
        // lock を drop した状態で待つ。他タスクは別 slot で並行に進める。
        if send_at > Instant::now() {
            sleep_until(send_at).await;
        }
    }

    /// 429 を食らったら全タスクを `dur` だけ一時停止する。
    /// 既に長いペナルティが設定済の場合は伸ばさない (max を取る)。
    ///
    /// このメソッドが next_slot も同時に押し上げる: 既に reserved 済の
    /// タスクは sleep_until で待っている最中なので影響なし。今後 acquire するタスクは
    /// penalty_until を見て自然に後ろにずれる。
    ///
    /// 2026-05-23: `reason` 引数を追加。UI 側でペナルティ理由 ("429 Too Many Requests" 等)
    /// を表示するため、global static (`LAST_PENALTY_REASON`) も同時に更新する。
    pub async fn set_penalty(&self, dur: Duration, reason: Option<String>) {
        let mut guard = self.state.lock().await;
        let target = Instant::now() + dur;
        if target > guard.penalty_until {
            guard.penalty_until = target;
        }
        // UI 可視化用 global state を更新 (lock-free な AtomicU64 + 短期 Mutex<String>)
        record_penalty_for_ui(guard.penalty_until, reason);
    }
}

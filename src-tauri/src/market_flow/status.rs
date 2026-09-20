//! market_flow/status.rs — 画面に出す状態 (FlowStatus) と周期の設定
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。サブモジュールは private なので
//! pub にしてもクレートの外には出ない (親が pub use した分だけが見える)。
use super::*;




/// UI に出す進捗
#[derive(Serialize, Clone, Debug)]
pub struct FlowStatus {
    /// 取得中か (自動か手動のどちらか)
    pub sampling: bool,
    /// 手動の一括が走っているか
    pub manual_sampling: bool,
    /// 自動巡回 (周期の 1 巡 / 取りこぼしの取り直し) が走っているか。
    /// 画面はこれを見て他の取得ボタンを押せなくする (オーナー指示 2026-09-20:
    /// 「巡回中は他の取得は触れないようにしよう」)
    pub auto_sampling: bool,
    /// 取得中の銘柄名 (取得中のみ)
    pub current: Option<String>,
    /// 何件目 / 全体
    pub done: usize,
    pub total: usize,
    /// 何周したか
    pub rounds: u64,
    /// 最後に取った時刻と次回の予定 (unix 秒)
    pub last_at: i64,
    pub next_at: i64,
    /// 自動で追う銘柄の数 (手動は含まない)
    pub auto_watches: usize,
    pub manual_watches: usize,
    pub last_error: Option<String>,
    /// trade2 のレート制限の使用状況 ("4:10:0,12:60:0,..." 形式)
    pub rate_state: Option<String>,
    /// レート制限の規則 (x-rate-limit-ip)。画面はこれと state から待ち時間を出す
    pub rate_rules: Option<String>,
    /// 次にリクエストを投げられる時刻 (unix 秒)。**止まっているのではなく順番待ち**
    /// (2026-09-19 リファクタ: wait_until / budget_until / pace_until の 3 つが
    ///  どれも「次の 1 本まで」を別の式で出していたので 1 つにした)
    pub wait_until: i64,
    /// 5 分あたり全窓口あわせて何回使ったか / 今の上限 (画面の「5 分で n/N 回」)
    pub budget_used: i64,
    pub budget_max: i64,
    /// 罰則 (429) で止まっている場合の再開予定 (unix 秒、0 なら制限なし)。
    /// **これだけが「止まっている」**
    pub retry_until: i64,
    /// 取りこぼした回の再挑戦予定 (unix 秒、0 なら通常運転)
    pub retry_at: i64,
    /// 取り直しを待っている銘柄数
    pub retry_keys: usize,
    /// 今の 1 巡で取り終わった銘柄数 (自動巡回は時間をかけて回るので進み具合を出す)
    pub sweep_done: usize,
    /// 今の送信間隔 (秒)。門番が 5 分あたりの上限から決めている値 (自動も手動も同じ)
    pub pace_secs: i64,
    /// 1 度でも取れた自動銘柄の数 (1 周目の進捗。画面で「巡回待ち」を出すのに使う)
    pub sampled_watches: usize,
    /// 今の 1 巡の周期 (秒)
    pub cycle_secs: i64,
    /// 最後に全銘柄を 1 巡した時刻 (手動の一括取得を含む)
    pub swept_at: i64,
    /// 自動取得しない設定か (画面の「自動取得しない」)
    pub auto_off: bool,
    /// 直前の 1 巡で取れなかった銘柄数 (取り直しを諦めた後も残る。画面が「完了」と言わないため)
    pub last_failed: usize,
}

/// 自動追跡が今どうなっているか (ジェムコラプトの画面に出す)
#[tauri::command]
pub fn market_flow_status(app: tauri::AppHandle) -> Result<FlowStatus, String> {
    let store = load_store(&app);
    let progress = PROGRESS.lock().ok().and_then(|g| g.clone());
    let gate = crate::trade2::gate_status();
    let manual_sampling = RUNNING_MANUAL.load(Ordering::SeqCst);
    let auto_sampling = RUNNING_AUTO.load(Ordering::SeqCst);
    let sampling = auto_sampling || manual_sampling;
    let (current, done, total) = match progress {
        Some((k, d, t)) => (Some(k), d, t),
        None => (None, 0, 0),
    };
    Ok(FlowStatus {
        sampling,
        manual_sampling,
        auto_sampling,
        current,
        done,
        total,
        rounds: store.rounds,
        last_at: store.sampled_at,
        next_at: if auto_off(&store) {
            0
        } else if store.retry_at > 0 {
            store.retry_at
        } else {
            next_sweep_at(&store)
        },
        swept_at: store.swept_at,
        sampled_watches: store
            .watches
            .iter()
            .filter(|w| w.auto && store.states.get(&w.key).map(|st| st.sampled_at > 0).unwrap_or(false))
            .count(),
        auto_watches: store.watches.iter().filter(|w| w.auto).count(),
        manual_watches: store.watches.iter().filter(|w| w.manual).count(),
        last_error: LAST_ERROR.lock().ok().and_then(|g| g.clone()),
        rate_state: RATE_STATE.lock().ok().and_then(|g| g.clone()),
        rate_rules: RATE_RULES.lock().ok().and_then(|g| g.clone()),
        // レートの数字は門番の 1 回の呼び出しから全部出す (2026-09-19 リファクタ)
        budget_used: gate.used_300,
        budget_max: gate.max_300,
        wait_until: now_secs() + gate.wait_secs,
        retry_until: gate.penalty_until,
        retry_at: store.retry_at,
        retry_keys: store.retry_keys.len(),
        sweep_done: store.sweep_done.len(),
        pace_secs: sweep_pace_secs(),
        cycle_secs: if auto_off(&store) { CYCLE_OFF } else { cycle_secs(&store) },
        auto_off: auto_off(&store),
        last_failed: store.last_failed.len(),
    })
}

/// 1 巡の周期を変える (画面の設定。1〜24 時間)
#[tauri::command]
pub fn market_flow_set_cycle(app: tauri::AppHandle, secs: i64) -> Result<i64, String> {
    let mut store = load_store(&app);
    // 負は「自動取得しない」。それ以外は 1〜24 時間に収める
    store.cycle_secs = if secs < 0 { CYCLE_OFF } else { secs.clamp(CYCLE_MIN_SECS, CYCLE_MAX_SECS) };
    let applied = if auto_off(&store) { CYCLE_OFF } else { cycle_secs(&store) };
    save_store(&app, &store)?;
    Ok(applied)
}

#[cfg(test)]
mod tests {
    use super::*;


    /// 送信間隔は門番が決めた値をそのまま出す (自動巡回だけ別に薄く広げるのはやめた)
    #[test]
    fn pace_comes_from_the_gate() {
        let pace = sweep_pace_secs();
        assert_eq!(pace, (crate::trade2::pace_ms() as f64 / 1000.0).ceil() as i64);
        // 5 分あたりの上限から出しているので、この間隔なら 5 分の枠に収まる
        assert!(pace >= 1, "0 秒間隔にはならない");
        assert!(300 / pace.max(1) <= crate::trade2::gate_status().max_300.max(1));
    }
}

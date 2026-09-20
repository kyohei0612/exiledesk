//! market_flow/state.rs — 巡回中の状態 (走っているか / 進捗 / 直近のエラー / レートの残り)
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。サブモジュールは private なので
//! pub にしてもクレートの外には出ない (親が pub use した分だけが見える)。
use super::*;

/// 自動取得をしない設定か
pub fn auto_off(store: &FlowStore) -> bool {
    // 0 = 未設定。オーナー指示 2026-09-20「自動取得の間隔プルダウン、デフォで無しで設定とする」
    // に合わせて、何も選んでいない時は自動取得しない (手動の一括取得はいつでも押せる)
    store.cycle_secs <= 0
}

/// 1 巡の周期 (保存値、未設定や範囲外なら既定)。無効の時も「間隔を配る」計算には既定を使う
pub fn cycle_secs(store: &FlowStore) -> i64 {
    if store.cycle_secs <= 0 {
        CYCLE_DEFAULT_SECS
    } else {
        store.cycle_secs.clamp(CYCLE_MIN_SECS, CYCLE_MAX_SECS)
    }
}

/// 今の送信間隔 (秒)。門番 (trade2/gate.rs) が上限から決めている値をそのまま出す。
///
/// 2026-09-20: 以前は自動巡回だけ「周期いっぱいに薄く広げる」別の間隔 (spread_pace_secs) を
/// 使っていたが、門番が上限を守って待つようになってからは二重に待っているだけだった。
/// オーナー指示「今の一括取得に合わせてロジック」で廃止。
pub fn sweep_pace_secs() -> i64 {
    (crate::trade2::pace_ms() as f64 / 1000.0).ceil() as i64
}

/// 次に自動で 1 巡する予定時刻 (前回の一括取得から周期ぶん後)。まだ 1 度も取っていなければ今すぐ
pub fn next_sweep_at(store: &FlowStore) -> i64 {
    if store.swept_at <= 0 {
        return now_secs();
    }
    store.swept_at + cycle_secs(store)
}

/// 取りこぼした銘柄を取り直すまでの最短間隔
pub const RETRY_GAP_SECS: i64 = 10 * 60;
/// 取り直しを続ける上限。超えたら諦めて次の周期を待つ (2026-09-18 レビュー: 上限が無いと永久に回る)
pub const MAX_RETRY_ROUNDS: u32 = 3;

/// 一括取得を中止する合図 (画面の「中止」)。自動と手動で別々に持つ
///
/// 2026-09-20 オーナー:「巡回中は他の取得は触れないようにしよう」。触れなくする以上、
/// 自動巡回も手で止められないといけないので、中止を自動にも効かせる。
pub static CANCEL_MANUAL: AtomicBool = AtomicBool::new(false);
pub static CANCEL_AUTO: AtomicBool = AtomicBool::new(false);

/// 1 巡の通し進捗 (これまでに取り終えた数, 全体数)。自動と手動で別々に持つ。
///
/// 2026-09-19 オーナー「取得中の一括、なんか数字行ったり来たりしてない?」:
/// 取り切るまで繰り返すようにしたので、取り直しの周は「1/5」のように母数が小さくなり、
/// 画面の数字が 42/42 → 1/5 と戻って見えていた。周をまたいで通しで数える。
pub static MANUAL_BASE: StdMutex<Option<(usize, usize)>> = StdMutex::new(None);
pub static AUTO_BASE: StdMutex<Option<(usize, usize)>> = StdMutex::new(None);

fn base_cell(slot: Slot) -> &'static StdMutex<Option<(usize, usize)>> {
    match slot {
        Slot::Auto => &AUTO_BASE,
        Slot::Manual => &MANUAL_BASE,
    }
}
pub fn set_sweep_base(slot: Slot, v: Option<(usize, usize)>) {
    if let Ok(mut g) = base_cell(slot).lock() {
        *g = v;
    }
}
pub fn sweep_base(slot: Slot) -> Option<(usize, usize)> {
    base_cell(slot).lock().ok().and_then(|g| *g)
}
/// その枠の「中止」の合図を立てる / 下ろす
pub fn set_cancel(slot: Slot, v: bool) {
    cancel_flag(slot).store(v, Ordering::SeqCst);
}
/// 中止を押されたか
pub fn cancelled(slot: Slot) -> bool {
    cancel_flag(slot).load(Ordering::SeqCst)
}
fn cancel_flag(slot: Slot) -> &'static AtomicBool {
    match slot {
        Slot::Auto => &CANCEL_AUTO,
        Slot::Manual => &CANCEL_MANUAL,
    }
}
/// その枠が走っているかの旗
pub fn running_flag(slot: Slot) -> &'static AtomicBool {
    match slot {
        Slot::Auto => &RUNNING_AUTO,
        Slot::Manual => &RUNNING_MANUAL,
    }
}
/// 自動 (周期の巡回 / 取りこぼしの取り直し) が走っているか
pub static RUNNING_AUTO: AtomicBool = AtomicBool::new(false);
/// 手動の一括が走っているか。
///
/// 2026-09-19 オーナー「一括は全部とっていいよ。ただ、間に記録として挟む感じ。巡回中でも
/// 取った時間で別に挟めるでしょ、手動で」。自動と手動は**同時に走ってよい** (記録は取った時刻
/// つきの観測なので、混ざっても順に積むだけ)。それぞれ 1 本ずつ。
pub static RUNNING_MANUAL: AtomicBool = AtomicBool::new(false);
/// 記録ファイルの 読む→直す→書く を 2 本の巡回で取り合わないための鍵。
/// 持っている間に await しない (中で待つと相手の巡回が止まる)
pub static STORE_LOCK: StdMutex<()> = StdMutex::new(());

/// 巡回の枠。自動と手動で別々に「走っているか」を持つ
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    Auto,
    Manual,
}

pub fn store_lock() -> std::sync::MutexGuard<'static, ()> {
    STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}
/// 今どの銘柄を取っているか (key, 何件目, 全体件数)。UI に出すため
pub static PROGRESS: StdMutex<Option<(String, usize, usize)>> = StdMutex::new(None);
/// 直近の失敗 (UI に出す)
pub static LAST_ERROR: StdMutex<Option<String>> = StdMutex::new(None);
/// trade2 が返したレート制限の使用状況 (x-rate-limit-ip-state)
pub static RATE_STATE: StdMutex<Option<String>> = StdMutex::new(None);
/// trade2 が返したレート制限の規則 (x-rate-limit-ip)。画面側の待ちと同じ物を見せるために出す
pub static RATE_RULES: StdMutex<Option<String>> = StdMutex::new(None);


pub fn set_progress(v: Option<(String, usize, usize)>) {
    if let Ok(mut g) = PROGRESS.lock() {
        *g = v;
    }
}
pub fn set_error(v: Option<String>) {
    if let Ok(mut g) = LAST_ERROR.lock() {
        *g = v;
    }
}
pub fn set_rate_state(v: Option<String>) {
    if let Ok(mut g) = RATE_STATE.lock() {
        *g = v;
    }
}
pub fn set_rate_rules(v: Option<String>) {
    if let Ok(mut g) = RATE_RULES.lock() {
        *g = v;
    }
}
/// 応答に付いてくるレート制限ヘッダ (規則と使用状況) を控える。search / fetch どちらでも呼ぶ
pub fn note_rate_headers(body: &serde_json::Value) {
    let rl = body.get("_ratelimit");
    let pick = |k: &str| rl.and_then(|r| r.get(k)).and_then(|v| v.as_str()).map(str::to_string);
    if let Some(v) = pick("x-rate-limit-ip") {
        set_rate_rules(Some(v));
    }
    if let Some(v) = pick("x-rate-limit-ip-state") {
        set_rate_state(Some(v));
    }
}
/// 罰則 (429 / restricted) で止まっている解除予定 (unix 秒、0 なら止まっていない)。門番が持つ
pub fn penalty_until_secs() -> i64 {
    crate::trade2::gate_status().penalty_until
}
/// 今から再開までの秒数 (止まっていなければ 0)
pub fn retry_wait_secs() -> i64 {
    (penalty_until_secs() - now_secs()).max(0)
}
/// その失敗は後で取り直せば通る物か (429 / 通信 / 門番の待ち切れ)。
/// HTTP 400 のような恒久的な失敗は取り直さない。
///
/// 2026-09-19 オーナー「一括終わってないくせに終わったって言ってる意味が分からん」:
/// 門番が「待ちが長すぎる」と返すエラー (trade2 レート制限中 (あと N 秒)) を
/// **恒久的な失敗**として扱っていたので、取り直しに入らず 41/42 銘柄で「終わりました」に
/// なっていた。これは時間が経てば必ず通るので取り直す。
pub fn is_retriable(msg: &str) -> bool {
    msg.contains("429") || msg.contains("network error") || msg.contains("レート制限中")
}


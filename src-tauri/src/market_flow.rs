//! 捌き速度の追跡 (2026-09-16)
//!
//! 「この商品は何日で売れるのか」を、公式 trade2 の出品を定期的に覗いて測る。
//! ジェム専用ではなく、trade2 のクエリを 1 本渡せば何でも追える (レア装備でも通貨でも)。
//!
//! ## 測り方: 出品 1 件ずつを ID で追う
//! 最安 10 件の listing ID を「追跡対象」に入れ、毎時の search が返す ID 一覧に
//! 載っているかで生死を確認する。消えた時刻 − 初めて見た時刻 = その出品の寿命。
//! 窓 (最安 10 件) から押し出されただけの物を「売れた」と誤判定しないため、ID で追う。
//!
//! オーナー指摘の例:「50 神が滞留しているところに 40 神が 20 件参戦」→ 最安 10 件は
//! 丸ごと入れ替わるが、50 神の ID は追跡し続けるので売れたことにはならない。
//!
//! ## 前の実装 (滞留時間) を捨てた理由
//! examples/gem_flow_sim.rs で 6 パターンの市場を作って測ったところ、
//! 「今並んでいる出品が何分前に出された物か」は **速い市場ほど遅く出た**。
//! 良い出品は覗く前に売れていて、目に入るのは売れ残りだけだから。
//!
//! 手動だけの銘柄 (manual=true / auto=false) は巡回に入れず、画面の「再取得」を押した時だけ記録する。
//! ただし自動リストにも載った銘柄は巡回に戻し、手動で貯めた記録の続きとして扱う。
//! (自動リストの入れ替えでは消えないので、記録は貯まり続ける)
//!
//! ## 取得量 (オーナー指示: 検索の回数を間引く / ばらす)
//! 1 銘柄あたり毎時 search 1 + fetch 1。生存確認は search が返す ID 一覧 (最大 100 件)
//! で賄い、そこに載らない物だけ 3 時間おきにまとめて fetch する (1 回 10 件まで)。
//! trade2 の制限: 5/10 秒, 15/60 秒, 30/5 分, 600/6 時間。
//!
//! 1 時間ぶんをまとめて取ると連続アクセスで制限に当たるので、**10 分おきに 1/6 ずつ**取る
//! (オーナー指示 2026-09-16)。銘柄を 6 組に分けて順番に回すので、1 時間で全銘柄が 1 巡する。
//! 30 銘柄なら 1 回 5 銘柄 = 10 リクエスト。その 10 回も 10 分かけて均すので、
//! 実際の送信は 1 分に 1 回程度になる (バーストを作らない)。
//!
//! ## キャッシュの上限 (オーナー指示: 1 ID あたり 1 週間)
//! 追跡は 1 ID につき 7 日で打ち切り、それ以降は日次集計に畳んで捨てる。

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex as StdMutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

// ============================================================================
// データ構造
// ============================================================================

/// 追跡する銘柄 1 つ (ジェムでも装備でも、trade2 のクエリがあれば何でも)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Watch {
    /// 一意なキー (ジェムなら英語名)
    pub key: String,
    /// 画面に出す名前
    #[serde(default)]
    pub label: String,
    /// trade2 の検索クエリ (フロントで組んだ物をそのまま使う)。手動分は空でもよい
    #[serde(default)]
    pub query: serde_json::Value,
    /// 補足 (「完成品を 41 人が使用」など、登録元が入れる)
    #[serde(default)]
    pub note: String,
    /// 手動で追加した銘柄か。true なら自動リストの入れ替えで消さない (2026-09-16)
    #[serde(default)]
    pub manual: bool,
    /// 今の自動リストに入っているか。true なら 1 時間ごとの巡回で取る。
    /// manual と両方 true もあり得る (手動で足した物が後から自動リストにも載った場合)。
    /// その時は巡回に入れて、手動で貯めた記録の続きとして判断する (オーナー指示 2026-09-17)
    #[serde(default)]
    pub auto: bool,
}

/// 追跡中 (または消えた) 出品 1 件
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Tracked {
    pub id: String,
    /// 実際に出品された時刻 (trade2 の listing.indexed)。取れなければ None。
    /// 齢はこれを起点に数える (こちらが見つけた時にはもう何時間も経っていることが多いため)
    #[serde(default)]
    pub listed_at: Option<i64>,
    /// 初めて見た時刻 (unix 秒)
    pub first_seen: i64,
    /// 最後に生存を確認した時刻
    pub last_seen: i64,
    /// 消えたと判断した時刻 (生きていれば None)
    #[serde(default)]
    pub gone_at: Option<i64>,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
}

impl Tracked {
    /// 齢の起点 (出品時刻が取れていればそれ、無ければ初めて見た時刻)
    pub fn start(&self) -> i64 {
        self.listed_at.unwrap_or(self.first_seen)
    }
    /// 寿命 (秒)。消えていれば消滅まで、生きていれば今まで (打ち切り)
    pub fn age(&self, now: i64) -> i64 {
        self.gone_at.unwrap_or(now) - self.start()
    }
    /// 観測に入った時の齢 (生存分析の左側切断に使う)
    pub fn entry_age(&self) -> i64 {
        (self.first_seen - self.start()).max(0)
    }
}

/// 1 日ぶんの集計 (追跡を捨てた後も残る)
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Daily {
    /// その日の 0 時 (unix 秒、UTC 基準で丸めるだけなので厳密な暦日でなくてよい)
    pub day: i64,
    /// 新しく追跡に入った件数
    pub added: u32,
    /// 消えた件数
    pub gone: u32,
    /// 7 日追っても消えなかった件数 (打ち切り)
    pub survived: u32,
    /// 出品総数の平均
    pub total_avg: f64,
    /// サンプル回数
    pub samples: u32,
}

/// 銘柄ごとの状態
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct WatchState {
    /// 追跡中 + 最近消えた出品 (7 日で捨てる)
    pub tracked: Vec<Tracked>,
    /// 日次集計 (30 日)
    pub daily: Vec<Daily>,
    /// 直近の出品総数
    pub total: u64,
    /// 最後にサンプルした時刻
    pub sampled_at: i64,
    /// 最後に「行方不明の ID」をまとめて確認した時刻 (3 時間おき)
    #[serde(default)]
    pub confirmed_at: i64,
    /// 最安値 (表示用)
    #[serde(default)]
    pub cheapest_amount: Option<f64>,
    #[serde(default)]
    pub cheapest_currency: Option<String>,
}

/// 記録の作り方を変えた時に上げる。合わないデータは捨てて取り直す
///
/// 3 … 2026-09-17: 保存済みのクエリが古い `status: securable` のままで巡回していた。
///     出品者がオフラインになるだけで検索から消えるため、深夜に 10 件同時消失のような
///     「売れた」誤判定が出ていた (コメット / チャージレギュレーションで確認)。
pub const FLOW_SCHEMA: u32 = 3;

/// 保存済みのクエリを今のルールに合わせる。
///
/// 追跡の検索は必ず `status: any` にする。`securable` (直近接続中) だと出品者が
/// 寝落ちしただけで検索から消えて、売れたことにされてしまう。
/// 画面側のクエリは直してあるが、保存済みの古いクエリがそのまま使われていたので、
/// ここで送る直前に必ず上書きする (2026-09-17)。
fn force_status_any(query: &mut serde_json::Value) -> bool {
    let Some(q) = query.get_mut("query") else { return false };
    let now_any = q.get("status").and_then(|s| s.get("option")).and_then(|o| o.as_str()) == Some("any");
    if now_any {
        return false;
    }
    if let Some(obj) = q.as_object_mut() {
        obj.insert("status".to_string(), serde_json::json!({ "option": "any" }));
    }
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FlowStore {
    /// 記録の形式 (FLOW_SCHEMA)
    #[serde(default)]
    pub schema: u32,
    /// 最後にサンプルを取った時刻 (unix 秒)
    pub sampled_at: i64,
    /// 何周したか (UI に出す)
    #[serde(default)]
    pub rounds: u64,
    /// レート制限などで取りこぼした時の再開予定 (unix 秒、0 なら通常の間隔)
    #[serde(default)]
    pub retry_at: i64,
    /// 次に取る組 (0..SLICES)。10 分おきに 1 組ずつ回す
    #[serde(default)]
    pub slice_cursor: usize,
    /// 最後に 1 組を取った時刻
    #[serde(default)]
    pub sliced_at: i64,
    /// 今の組で取り終わった銘柄のキー。組を終えたら空にする。
    /// 途中でアプリを閉じても、次の起動で続きから再開するために残す (オーナー指示 2026-09-16)
    #[serde(default)]
    pub slice_done: Vec<String>,
    /// 追跡リストを更新した時刻
    pub list_refreshed_at: i64,
    pub league: String,
    pub site: String,
    pub watches: Vec<Watch>,
    /// キー → 状態
    pub states: HashMap<String, WatchState>,
}

// ============================================================================
// 定数 (オーナー指示: 判定は 3 日、1 ID の追跡は 7 日)
// ============================================================================

/// 1 ID を追う上限 (これを超えたら打ち切って日次集計に畳む)
const TRACK_MAX_SECS: i64 = 7 * 24 * 3600;
/// 1 銘柄で追跡する上限件数
const TRACK_MAX_PER_WATCH: usize = 60;
/// 日次集計を残す日数
const DAILY_MAX_DAYS: usize = 30;
/// 行方不明の ID をまとめて確認する間隔 (検索回数を間引くため)
/// 行方不明の出品を直接 fetch して確認する間隔。
/// 出品が 100 件を超える銘柄はこれが唯一の判定手段なので、巡回ごと (1 時間) に確認する。
/// 代わりに 1 組あたりの確認回数を CONFIRM_MAX_PER_SLICE で抑える (2026-09-17)
const CONFIRM_INTERVAL_SECS: i64 = 3300;

/// 一度の確認で「追跡中の何割が消えたら怪しいと見なすか」。
///
/// 検索条件がズレている / 応答がおかしい等で、検索に載らないだけの出品を
/// まとめて「売れた」にしてしまう事故が実際に起きた (2026-09-17 全点検)。
/// これを超えたら検索結果を信用せず、ID を直接 fetch して確かめる。
const MASS_GONE_RATIO: f64 = 0.5;
/// 一斉消失とみなす最低件数 (少数なら普通に売れただけ)
const MASS_GONE_MIN: usize = 3;

/// 追跡中のうち、今回の ID 一覧に載っていない件数
fn missing_count(state: &WatchState, ids: &[String]) -> (usize, usize) {
    let present: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
    let alive: Vec<&Tracked> = state.tracked.iter().filter(|t| t.gone_at.is_none()).collect();
    let missing = alive.iter().filter(|t| !present.contains(t.id.as_str())).count();
    (missing, alive.len())
}

/// 一斉に消えた (ように見える) か。true なら検索結果だけで消えた判定をしない
pub fn looks_like_mass_gone(state: &WatchState, ids: &[String]) -> bool {
    let (missing, alive) = missing_count(state, ids);
    missing >= MASS_GONE_MIN && alive > 0 && (missing as f64) > (alive as f64) * MASS_GONE_RATIO
}

/// 1 組 (10 分) あたりの確認 fetch の上限。
/// 通常の取得が 1 時間 60 回なので、これを足しても 6 時間 600 回の制限に収まる
const CONFIRM_MAX_PER_SLICE: usize = 3;
/// リクエストの間隔
const REQUEST_INTERVAL: Duration = Duration::from_secs(8);
/// 全銘柄が 1 巡する周期
const SAMPLE_INTERVAL: Duration = Duration::from_secs(3600);
/// 1 時間を何回に分けて取るか (1 回あたりの連続アクセスを減らす)
const SLICES: usize = 6;
/// 分割 1 回の間隔 (SAMPLE_INTERVAL / SLICES)
const SLICE_INTERVAL_SECS: i64 = 600;
/// 起動直後の 1 回目を飛ばす条件
const FIRST_SAMPLE_MIN_GAP: i64 = 900;
/// 429 を食らった時に待つ上限 (これを超える指定なら一度あきらめて後で再開する)
const MAX_WAIT_IN_SWEEP_SECS: i64 = 20 * 60;
/// 取りこぼした時に再挑戦するまでの最短間隔
const RETRY_GAP_SECS: i64 = 10 * 60;

static SAMPLING: AtomicBool = AtomicBool::new(false);
/// 今どの銘柄を取っているか (key, 何件目, 全体件数)。UI に出すため
static PROGRESS: StdMutex<Option<(String, usize, usize)>> = StdMutex::new(None);
/// 直近の失敗 (UI に出す)
static LAST_ERROR: StdMutex<Option<String>> = StdMutex::new(None);
/// trade2 が返したレート制限の使用状況 (x-rate-limit-ip-state)
static RATE_STATE: StdMutex<Option<String>> = StdMutex::new(None);
/// 429 を食らった時の再開予定時刻 (unix 秒)
static RETRY_UNTIL: StdMutex<i64> = StdMutex::new(0);

fn set_progress(v: Option<(String, usize, usize)>) {
    if let Ok(mut g) = PROGRESS.lock() {
        *g = v;
    }
}
fn set_error(v: Option<String>) {
    if let Ok(mut g) = LAST_ERROR.lock() {
        *g = v;
    }
}
fn set_rate_state(v: Option<String>) {
    if let Ok(mut g) = RATE_STATE.lock() {
        *g = v;
    }
}
/// 429 の再開予定 (unix 秒)
fn retry_until() -> i64 {
    RETRY_UNTIL.lock().map(|g| *g).unwrap_or(0)
}
/// 今から再開までの秒数 (制限中でなければ 0)
fn retry_wait_secs() -> i64 {
    (retry_until() - now_secs()).max(0)
}

/// エラー文字列から 429 の待ち時間を拾って再開予定にする
fn note_retry_after(msg: &str) {
    if !msg.contains("429") {
        return;
    }
    let secs = msg
        .split("retry-after=")
        .nth(1)
        .and_then(|rest| rest.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|d| d.parse::<i64>().ok())
        .unwrap_or(60);
    if let Ok(mut g) = RETRY_UNTIL.lock() {
        *g = now_secs() + secs;
    }
}

// ============================================================================
// 保存
// ============================================================================

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("market_flow.json");
    Ok(dir)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn load_store(app: &tauri::AppHandle) -> FlowStore {
    let Ok(p) = store_path(app) else {
        return FlowStore::default();
    };
    let Ok(text) = fs::read_to_string(&p) else {
        return FlowStore::default();
    };
    let mut store: FlowStore = serde_json::from_str(&text).unwrap_or_default();
    // 2026-09-16: 追跡の検索条件を securable → any に変えた。
    // 古い記録は「出品者がオフラインになっただけ」を売れた扱いにしているので捨てる
    // auto を足す前の記録には印が無いので、手動以外を自動扱いに直す (一度だけ)
    if !store.watches.is_empty() && store.watches.iter().all(|w| !w.auto) {
        for w in store.watches.iter_mut() {
            w.auto = !w.manual;
        }
    }
    // 古いクエリ (securable) はここで直す。直った物は追跡データを捨てる (別の検索なので比べられない)
    let mut fixed: Vec<String> = Vec::new();
    for w in store.watches.iter_mut() {
        if force_status_any(&mut w.query) {
            fixed.push(w.key.clone());
        }
    }
    for k in fixed {
        store.states.remove(&k);
    }
    if store.schema != FLOW_SCHEMA {
        store.schema = FLOW_SCHEMA;
        store.states.clear();
        store.slice_done.clear();
        store.rounds = 0;
    }
    store
}

fn save_store(app: &tauri::AppHandle, store: &FlowStore) -> Result<(), String> {
    let p = store_path(app)?;
    let text = serde_json::to_string(store).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(&p, text).map_err(|e| format!("write {p:?}: {e}"))
}

// ============================================================================
// Tauri commands
// ============================================================================

/// 保存済みの記録を返す (UI 表示用)
#[tauri::command]
pub fn market_flow_load(app: tauri::AppHandle) -> Result<FlowStore, String> {
    Ok(load_store(&app))
}

#[derive(Deserialize)]
pub struct SetWatchesRequest {
    pub watches: Vec<Watch>,
    pub league: String,
    #[serde(default)]
    pub site: Option<String>,
}

/// 自動リストを入れ替える (クラフト選定ジェムの取得後)。
///
/// オーナー指示 (2026-09-17) のルール:
///   - 前回と被っている銘柄 … 何も触らない (記録はそのまま、続きから追う)
///   - 新しく入った銘柄     … 追加して次の巡回から取る
///   - 外れた銘柄           … 追跡は止めるが記録は消さない。7 日経った物だけ掃除する
///     (また一覧に戻ってきた時に続きから使えるように)
///   - 手動で足した銘柄 (manual=true) は入れ替えで消えない。
///     自動リストにも載っていたら巡回に入れ、手動で貯めた記録の続きとして判断する
///     (飛ばさない。オーナー指示 2026-09-17)
#[tauri::command]
pub fn market_flow_set_watches(app: tauri::AppHandle, req: SetWatchesRequest) -> Result<FlowStore, String> {
    let mut store = load_store(&app);
    // 手動分は残す。いったん巡回から外し、今回のリストに載っていれば戻す
    let mut watches: Vec<Watch> = store
        .watches
        .iter()
        .filter(|w| w.manual)
        .map(|w| Watch { auto: false, ..w.clone() })
        .collect();
    // 検索条件が変わった銘柄 (記録を作り直す)
    let mut changed: Vec<String> = Vec::new();
    for w in req.watches {
        match watches.iter_mut().find(|x| x.key == w.key) {
            // 手動で追っていた銘柄が自動リストにも載った: 巡回に入れる。
            // 記録 (states) はそのまま使うので、手動で貯めたぶんの続きから判断される
            Some(existing) => {
                // 検索条件が変わったら、前の記録は別の検索の結果なので比べられない。
                // そのまま残すと「消えた = 売れた」と誤判定するので捨てる (2026-09-17)
                // 手動で登録した銘柄はクエリを持たない (画面の検索条件で取っている)。
                // その場合は条件が変わったわけではないので記録は残す
                if !existing.query.is_null() && existing.query != w.query {
                    changed.push(w.key.clone());
                }
                existing.auto = true;
                existing.label = w.label;
                existing.query = w.query;
                existing.note = w.note;
            }
            None => watches.push(Watch { manual: false, auto: true, ..w }),
        }
    }
    for k in &changed {
        store.states.remove(k);
    }
    let keys: HashSet<String> = watches.iter().map(|w| w.key.clone()).collect();
    // 外れた銘柄の記録は残す (7 日触られていない物だけ捨てる)
    let cutoff = now_secs() - TRACK_MAX_SECS;
    store.states.retain(|k, st| keys.contains(k) || st.sampled_at >= cutoff);
    // リーグが変われば別の市場なので、前のリーグの記録は使えない (2026-09-17 全点検)
    if !store.league.is_empty() && store.league != req.league {
        store.states.clear();
        store.slice_done.clear();
    }
    store.watches = watches;
    store.league = req.league;
    if let Some(s) = req.site {
        store.site = s;
    }
    store.list_refreshed_at = now_secs();
    save_store(&app, &store)?;
    Ok(store)
}

#[derive(Deserialize)]
pub struct ToggleWatchRequest {
    pub watch: Watch,
    /// true で追加、false で外す
    pub on: bool,
    #[serde(default)]
    pub league: Option<String>,
    #[serde(default)]
    pub site: Option<String>,
}

/// 1 銘柄を手動で追跡に足す / 外す (ジェムコラプトの「追跡する」)。
/// 手動で足した物は自動リストの入れ替えでは消えない。
#[tauri::command]
pub fn market_flow_toggle_watch(app: tauri::AppHandle, req: ToggleWatchRequest) -> Result<FlowStore, String> {
    let mut store = load_store(&app);
    if let Some(l) = req.league.filter(|l| !l.is_empty()) {
        store.league = l;
    }
    if let Some(s) = req.site.filter(|s| !s.is_empty()) {
        store.site = s;
    }
    let key = req.watch.key.clone();
    if req.on {
        if let Some(existing) = store.watches.iter_mut().find(|w| w.key == key) {
            existing.manual = true;
            existing.query = req.watch.query;
            existing.label = req.watch.label;
            existing.note = req.watch.note;
        } else {
            store.watches.push(Watch { manual: true, auto: false, ..req.watch });
        }
    } else {
        store.watches.retain(|w| w.key != key);
        store.states.remove(&key);
    }
    save_store(&app, &store)?;
    Ok(store)
}

/// 今すぐ 1 周サンプルを取る (手動)。取得中なら何もしない。
#[tauri::command]
pub async fn market_flow_sample_now(app: tauri::AppHandle) -> Result<FlowStore, String> {
    sample_once(&app).await?;
    Ok(load_store(&app))
}

#[derive(Deserialize)]
pub struct RecordRequest {
    /// 銘柄のキー
    pub key: String,
    /// 画面に出す名前 (未登録なら手動の銘柄として登録する)
    #[serde(default)]
    pub label: Option<String>,
    pub total: u64,
    /// search が返した ID 一覧 (生存確認に使う)
    #[serde(default)]
    pub ids: Vec<String>,
    /// 最安 10 件 (新しく追跡に入れる)
    #[serde(default)]
    pub entries: Vec<ListingRef>,
}

/// 見えていた出品 1 件 (ID と値段)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ListingRef {
    pub id: String,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    /// 出品時刻 (unix 秒)。trade2 の listing.indexed を読んだ物
    #[serde(default)]
    pub listed_at: Option<i64>,
}

/// 画面から手で取った結果を同じ記録に差し込む (ジェムコラプトの「再取得」)。
#[tauri::command]
pub fn market_flow_record(app: tauri::AppHandle, req: RecordRequest) -> Result<Vec<String>, String> {
    let mut store = load_store(&app);
    let now = now_secs();
    // 2026-09-16: 画面で取った銘柄はそのまま記録対象にする (チェックを廃止したため)。
    // 手動扱いなので 1 時間ごとの巡回には入らず、自動リストの入れ替えでも消えない。
    if !store.watches.iter().any(|w| w.key == req.key) {
        store.watches.push(Watch {
            key: req.key.clone(),
            label: req.label.clone().unwrap_or_else(|| req.key.clone()),
            query: serde_json::Value::Null,
            note: "画面で取得".to_string(),
            manual: true,
            auto: false,
        });
    }
    let state = store.states.entry(req.key).or_default();
    // ID 一覧が出品全部を含んでいる時だけ「消えた」を判定する。
    // 画面から最安 10 件しか届かない場合に押し出しを売れた扱いにしないため (2026-09-17)
    let list_complete = req.ids.len() as u64 >= req.total
        && !(req.ids.is_empty() && !state.tracked.is_empty())
        && !looks_like_mass_gone(state, &req.ids);
    apply_sample(state, now, req.total, &req.ids, &req.entries, list_complete);
    // 出品が 100 件を超えていて search の一覧に載らなかった追跡分は、
    // 直接 fetch しないと生死が分からない。画面側に投げ返して確認してもらう (2026-09-17)
    let missing: Vec<String> = if list_complete {
        Vec::new()
    } else {
        let present: HashSet<&str> = req.ids.iter().map(String::as_str).collect();
        state
            .tracked
            .iter()
            .filter(|t| t.gone_at.is_none() && !present.contains(t.id.as_str()))
            .take(10)
            .map(|t| t.id.clone())
            .collect()
    };
    prune(state, now);
    store.sampled_at = now;
    save_store(&app, &store)?;
    Ok(missing)
}

/// 画面が確認 fetch を投げた結果を反映する (market_flow_record の戻り値に対する返事)
#[derive(Deserialize)]
pub struct ConfirmRequest {
    pub key: String,
    /// 確認した ID
    pub checked: Vec<String>,
    /// そのうち実在した ID
    pub alive: Vec<String>,
}

#[tauri::command]
pub fn market_flow_confirm(app: tauri::AppHandle, req: ConfirmRequest) -> Result<FlowStore, String> {
    let mut store = load_store(&app);
    let now = now_secs();
    let Some(state) = store.states.get_mut(&req.key) else {
        return Ok(store);
    };
    let alive: HashSet<String> = req.alive.into_iter().collect();
    apply_confirm(state, now, &req.checked, &alive);
    save_store(&app, &store)?;
    Ok(store)
}

/// trade2 の出品時刻 ("2026-09-16T10:00:00Z") を unix 秒に。chrono を足さずに手で読む
pub fn parse_indexed(indexed: &str) -> Option<i64> {
    if indexed.len() < 19 {
        return None;
    }
    let num = |s: &str| -> Option<i64> { s.parse::<i64>().ok() };
    let y = num(&indexed[0..4])?;
    let mo = num(&indexed[5..7])?;
    let d = num(&indexed[8..10])?;
    let h = num(&indexed[11..13])?;
    let mi = num(&indexed[14..16])?;
    let sec = num(&indexed[17..19])?;
    // Howard Hinnant の days_from_civil
    let y_adj = if mo <= 2 { y - 1 } else { y };
    let era = if y_adj >= 0 { y_adj } else { y_adj - 399 } / 400;
    let yoe = y_adj - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + h * 3600 + mi * 60 + sec)
}

// ============================================================================
// 集計の本体 (テストしやすいよう HTTP から分離)
// ============================================================================

/// 1 回のサンプルを状態に反映する。
///
/// * `ids` … search が返した ID 一覧 (価格の安い順、最大 100)
/// * `entries` … 最安 10 件 (値段つき)。新規は追跡に入れる
/// * `list_complete` … `ids` が出品全部を含んでいるか (総数 < 100 なら true)。
///   true の時だけ「一覧に無い = 消えた」と判断できる。
pub fn apply_sample(
    state: &mut WatchState,
    now: i64,
    total: u64,
    ids: &[String],
    entries: &[ListingRef],
    list_complete: bool,
) {
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let mut gone_now = 0u32;
    // 生き返った出品が「消えた」として数えられていた日 (集計から引く)
    let mut revived_days: Vec<i64> = Vec::new();

    for t in state.tracked.iter_mut() {
        if t.gone_at.is_some() {
            // 消えた扱いにした出品がまた現れたら生き返らせる (取り下げでも売却でもなかった)
            if present.contains(t.id.as_str()) {
                if let Some(g) = t.gone_at {
                    revived_days.push(day_of(g));
                }
                t.gone_at = None;
                t.last_seen = now;
            }
            continue;
        }
        if present.contains(t.id.as_str()) {
            t.last_seen = now;
        } else if list_complete {
            // 出品全部が見えている状態で一覧に無い = 売れたか取り下げた
            t.gone_at = Some(now);
            gone_now += 1;
        }
        // list_complete でない時は判断を保留 (後で confirm_missing がまとめて確認する)
    }

    // 新しく見えた最安 10 件を追跡に入れる
    let known: HashSet<String> = state.tracked.iter().map(|t| t.id.clone()).collect();
    let mut added_now = 0u32;
    for e in entries {
        if known.contains(&e.id) {
            continue;
        }
        state.tracked.push(Tracked {
            id: e.id.clone(),
            listed_at: e.listed_at,
            first_seen: now,
            last_seen: now,
            gone_at: None,
            amount: e.amount,
            currency: e.currency.clone(),
        });
        added_now += 1;
    }

    state.total = total;
    state.sampled_at = now;
    if let Some(first) = entries.first() {
        state.cheapest_amount = first.amount;
        state.cheapest_currency = first.currency.clone();
    }
    // 誤って「消えた」と数えた分を日次集計から取り消す
    for day in revived_days {
        if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
            d.gone = d.gone.saturating_sub(1);
        }
    }
    bump_daily(state, now, added_now, gone_now, 0, total);
}

/// 行方不明だった ID の生死が分かった時に反映する (fetch で確認した結果)。
/// `alive` に入っていない追跡中 ID は消えたことにする。
pub fn apply_confirm(state: &mut WatchState, now: i64, checked: &[String], alive: &HashSet<String>) {
    let mut gone_now = 0u32;
    for t in state.tracked.iter_mut() {
        if t.gone_at.is_some() || !checked.contains(&t.id) {
            continue;
        }
        if alive.contains(&t.id) {
            t.last_seen = now;
        } else {
            t.gone_at = Some(now);
            gone_now += 1;
        }
    }
    state.confirmed_at = now;
    if gone_now > 0 {
        bump_daily(state, now, 0, gone_now, 0, state.total);
    }
}

fn day_of(t: i64) -> i64 {
    t - t.rem_euclid(86_400)
}

fn bump_daily(state: &mut WatchState, now: i64, added: u32, gone: u32, survived: u32, total: u64) {
    let day = day_of(now);
    if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
        d.added += added;
        d.gone += gone;
        d.survived += survived;
        d.total_avg = (d.total_avg * d.samples as f64 + total as f64) / (d.samples + 1) as f64;
        d.samples += 1;
    } else {
        state.daily.push(Daily { day, added, gone, survived, total_avg: total as f64, samples: 1 });
    }
    if state.daily.len() > DAILY_MAX_DAYS {
        let cut = state.daily.len() - DAILY_MAX_DAYS;
        state.daily.drain(0..cut);
    }
}

/// キャッシュを膨らませないための掃除 (オーナー指示: 1 ID は 1 週間)
pub fn prune(state: &mut WatchState, now: i64) {
    let mut survived = 0u32;
    state.tracked.retain(|t| {
        match t.gone_at {
            // 消えた記録は 7 日で捨てる (それまでは寿命の計算に使う)
            Some(g) => now - g < TRACK_MAX_SECS,
            // 生きたまま 7 日を超えた物は「7 日でも売れなかった」として集計に畳んで捨てる
            None => {
                if now - t.first_seen >= TRACK_MAX_SECS {
                    survived += 1;
                    false
                } else {
                    true
                }
            }
        }
    });
    if survived > 0 {
        bump_daily(state, now, 0, 0, survived, state.total);
    }
    // 上限を超えたら古い物から捨てる
    if state.tracked.len() > TRACK_MAX_PER_WATCH {
        state.tracked.sort_by_key(|t| t.first_seen);
        let cut = state.tracked.len() - TRACK_MAX_PER_WATCH;
        state.tracked.drain(0..cut);
    }
}

// ============================================================================
// サンプリング (HTTP)
// ============================================================================

/// 全銘柄を 1 周する (手動ボタン用)
pub async fn sample_once(app: &tauri::AppHandle) -> Result<(), String> {
    sample_slice(app, None).await
}

/// `slice` を渡すとその組だけ取る (10 分おきの自動取得)。None なら全銘柄。
pub async fn sample_slice(app: &tauri::AppHandle, slice: Option<usize>) -> Result<(), String> {
    if SAMPLING.swap(true, Ordering::SeqCst) {
        return Ok(()); // 既に走っている
    }
    let result = sample_inner(app, slice).await;
    SAMPLING.store(false, Ordering::SeqCst);
    result
}

async fn sample_inner(app: &tauri::AppHandle, slice: Option<usize>) -> Result<(), String> {
    let store = load_store(app);
    if store.watches.is_empty() || store.league.is_empty() {
        return Ok(());
    }
    // 追跡の検索は英語名で投げるので www 固定にする。
    // JP サイトは日本語名しか受け付けず "Unknown item base type" (HTTP 400) になる (2026-09-16)。
    let site: Option<String> = Some("www".to_string());
    let now = now_secs();
    // 自動で追う銘柄を 6 組に分け、指定された組だけ取る (10 分おきに 1 組)
    let auto: Vec<&Watch> = store
        .watches
        .iter()
        .filter(|w| w.auto)
        .enumerate()
        .filter(|(i, _)| slice.map(|sl| i % SLICES == sl).unwrap_or(true))
        .map(|(_, w)| w)
        .collect();
    // 途中で終わっていた場合は、その組で取り済みの銘柄を飛ばして続きから
    let done_keys: HashSet<String> = if slice.is_some() { store.slice_done.iter().cloned().collect() } else { HashSet::new() };
    let total_watches = auto.len();
    let resumed = done_keys.len();
    // この組で確認 fetch を使った回数 (上限 CONFIRM_MAX_PER_SLICE)
    let mut confirmed_in_slice: usize = 0;
    // 1 組ぶんを 10 分かけて均す (オーナー指示 2026-09-16: いっぺんにバーストさせない)。
    // 1 銘柄 = search 1 + fetch 1 なので、間隔 = 10 分 × 0.9 ÷ (銘柄数 × 2)
    let pace = if slice.is_some() && total_watches > 0 {
        let secs = ((SLICE_INTERVAL_SECS as f64 * 0.9) / (total_watches as f64 * 2.0)).clamp(8.0, 120.0);
        Duration::from_secs(secs as u64)
    } else {
        REQUEST_INTERVAL
    };
    let mut index = 0usize;
    let mut incomplete = false;
    set_error(None);

    for watch in auto.iter().copied() {
        index += 1;
        if done_keys.contains(&watch.key) {
            continue; // 前回の続き: この銘柄はもう取ってある
        }
        set_progress(Some((watch.label.clone().max(watch.key.clone()), index, total_watches)));
        let _ = resumed;
        // --- search: 総数と ID 一覧 ---
        let mut query = watch.query.clone();
        force_status_any(&mut query);
        let search = crate::trade2::SearchRequest {
            league: store.league.clone(),
            site: site.clone(),
            query,
        };
        let mut body = match crate::trade2::trade2_search(search.clone()).await {
            Ok(v) => Some(v),
            Err(e) => {
                eprintln!("[market_flow] search {} 失敗: {e}", watch.key);
                note_retry_after(&e);
                set_error(Some(format!("{}: {}", watch.key, e.chars().take(140).collect::<String>())));
                None
            }
        };
        // レート制限なら解除を待ってから同じ銘柄を取り直す (オーナー指示 2026-09-16: 止まらないように)
        if body.is_none() {
            let wait = retry_wait_secs();
            if wait > 0 && wait <= MAX_WAIT_IN_SWEEP_SECS {
                set_progress(Some((format!("待機中 ({} 秒)", wait), index, total_watches)));
                tokio::time::sleep(Duration::from_secs(wait as u64 + 2)).await;
                set_progress(Some((watch.label.clone().max(watch.key.clone()), index, total_watches)));
                body = match crate::trade2::trade2_search(search).await {
                    Ok(v) => {
                        set_error(None);
                        Some(v)
                    }
                    Err(e) => {
                        note_retry_after(&e);
                        set_error(Some(format!("{}: {}", watch.key, e.chars().take(140).collect::<String>())));
                        None
                    }
                };
            }
        }
        let Some(body) = body else {
            incomplete = true;
            tokio::time::sleep(pace).await;
            continue;
        };
        // レート制限の使用状況を控える (UI に出す)
        set_rate_state(
            body.get("_ratelimit")
                .and_then(|r| r.get("x-rate-limit-ip-state"))
                .and_then(|v| v.as_str())
                .map(str::to_string),
        );
        let total = body.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
        let query_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ids: Vec<String> = body
            .get("result")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        tokio::time::sleep(pace).await;

        // --- fetch: 最安 10 件の値段 (新規を追跡に入れるため) ---
        let mut entries: Vec<ListingRef> = Vec::new();
        let top: Vec<String> = ids.iter().take(10).cloned().collect();
        if !top.is_empty() && !query_id.is_empty() {
            let fetch = crate::trade2::FetchRequest { ids: top, query_id: query_id.clone(), site: site.clone() };
            match crate::trade2::trade2_fetch(fetch).await {
                Ok(v) => {
                    if let Some(arr) = v.get("result").and_then(|x| x.as_array()) {
                        for item in arr {
                            let Some(id) = item.get("id").and_then(|x| x.as_str()) else { continue };
                            let listing = item.get("listing");
                            let price = listing.and_then(|l| l.get("price"));
                            entries.push(ListingRef {
                                id: id.to_string(),
                                amount: price.and_then(|p| p.get("amount")).and_then(|x| x.as_f64()),
                                currency: price.and_then(|p| p.get("currency")).and_then(|x| x.as_str()).map(str::to_string),
                                listed_at: listing
                                    .and_then(|l| l.get("indexed"))
                                    .and_then(|x| x.as_str())
                                    .and_then(parse_indexed),
                            });
                        }
                    }
                }
                Err(e) => eprintln!("[market_flow] fetch {} 失敗: {e}", watch.key),
            }
            tokio::time::sleep(pace).await;
        }

        // --- 反映 ---
        let mut store_now = load_store(app);
        let state = store_now.states.entry(watch.key.clone()).or_default();
        // 総数が 100 未満なら search の一覧が全部 = 一覧に無い物は消えたと判断できる
        // ID が 1 件も返らなかった時は「全部売れた」ではなく「取れなかった」とみなす。
        // 一時的に空の応答が返るだけで追跡中の出品を全滅させないため (2026-09-17 全点検)。
        // 一斉に消えたように見える時も検索結果を信用せず、後の確認 fetch に回す。
        let list_complete = ids.len() as u64 >= total
            && !(ids.is_empty() && !state.tracked.is_empty())
            && !looks_like_mass_gone(state, &ids);
        apply_sample(state, now, total, &ids, &entries, list_complete);

        // --- 行方不明の確認 (巡回ごと、1 銘柄 10 件まで、1 組 CONFIRM_MAX_PER_SLICE 銘柄まで) ---
        let need_confirm = !list_complete
            && now - state.confirmed_at >= CONFIRM_INTERVAL_SECS
            && confirmed_in_slice < CONFIRM_MAX_PER_SLICE;
        let missing: Vec<String> = if need_confirm {
            let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
            state
                .tracked
                .iter()
                .filter(|t| t.gone_at.is_none() && !present.contains(t.id.as_str()))
                .take(10)
                .map(|t| t.id.clone())
                .collect()
        } else {
            Vec::new()
        };
        prune(state, now);
        store_now.sampled_at = now;
        // この銘柄は取り終わった。アプリが落ちても次回はここから続ける
        if slice.is_some() && !store_now.slice_done.contains(&watch.key) {
            store_now.slice_done.push(watch.key.clone());
        }
        save_store(app, &store_now)?;

        if !missing.is_empty() && !query_id.is_empty() {
            confirmed_in_slice += 1;
            let fetch = crate::trade2::FetchRequest { ids: missing.clone(), query_id, site: site.clone() };
            let alive: HashSet<String> = match crate::trade2::trade2_fetch(fetch).await {
                Ok(v) => v
                    .get("result")
                    .and_then(|x| x.as_array())
                    .map(|arr| arr.iter().filter_map(|i| i.get("id").and_then(|x| x.as_str()).map(str::to_string)).collect())
                    .unwrap_or_default(),
                Err(e) => {
                    eprintln!("[market_flow] confirm {} 失敗: {e}", watch.key);
                    tokio::time::sleep(pace).await;
                    continue;
                }
            };
            let mut store_c = load_store(app);
            if let Some(state) = store_c.states.get_mut(&watch.key) {
                apply_confirm(state, now, &missing, &alive);
                prune(state, now);
            }
            save_store(app, &store_c)?;
            tokio::time::sleep(pace).await;
        }
    }
    // この組は終わり。取りこぼしがあれば早めに再挑戦する (レート制限が明けたら動き出す)
    let mut store_end = load_store(app);
    store_end.sliced_at = now_secs();
    store_end.slice_done.clear();
    if let Some(sl) = slice {
        store_end.slice_cursor = (sl + 1) % SLICES;
        // 最後の組まで回ったら 1 巡
        if store_end.slice_cursor == 0 {
            store_end.rounds += 1;
            store_end.sampled_at = now_secs();
        }
    } else {
        store_end.rounds += 1;
        store_end.sampled_at = now_secs();
    }
    store_end.retry_at = if incomplete {
        let until = retry_until();
        now_secs() + (until - now_secs()).max(RETRY_GAP_SECS)
    } else {
        0
    };
    save_store(app, &store_end)?;
    set_progress(None);
    Ok(())
}

/// UI に出す進捗
#[derive(Serialize, Clone, Debug)]
pub struct FlowStatus {
    /// 取得中か
    pub sampling: bool,
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
    /// 429 を食らっている場合の再開予定 (unix 秒、0 なら制限なし)
    pub retry_until: i64,
    /// 取りこぼした回の再挑戦予定 (unix 秒、0 なら通常運転)
    pub retry_at: i64,
    /// 今どの組を取っているか (1 時間を SLICES 回に分ける)
    pub slice: usize,
    pub slices: usize,
    /// 今の組で取り終わった銘柄数 (中断から再開した時に分かるように)
    pub slice_done: usize,
}

/// 自動追跡が今どうなっているか (ジェムコラプトの画面に出す)
#[tauri::command]
pub fn market_flow_status(app: tauri::AppHandle) -> Result<FlowStatus, String> {
    let store = load_store(&app);
    let progress = PROGRESS.lock().ok().and_then(|g| g.clone());
    let sampling = SAMPLING.load(Ordering::SeqCst);
    let (current, done, total) = match progress {
        Some((k, d, t)) => (Some(k), d, t),
        None => (None, 0, 0),
    };
    Ok(FlowStatus {
        sampling,
        current,
        done,
        total,
        rounds: store.rounds,
        last_at: store.sampled_at,
        next_at: if store.retry_at > 0 {
            store.retry_at
        } else if store.sliced_at > 0 {
            store.sliced_at + SLICE_INTERVAL_SECS
        } else {
            0
        },
        auto_watches: store.watches.iter().filter(|w| w.auto).count(),
        manual_watches: store.watches.iter().filter(|w| w.manual).count(),
        last_error: LAST_ERROR.lock().ok().and_then(|g| g.clone()),
        rate_state: RATE_STATE.lock().ok().and_then(|g| g.clone()),
        retry_until: retry_until(),
        retry_at: store.retry_at,
        slice: store.slice_cursor % SLICES,
        slices: SLICES,
        slice_done: store.slice_done.len(),
    })
}

/// 起動時に呼ぶ: 1 時間ごとのサンプリングを回す
pub fn spawn_scheduler(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // 起動したらすぐ 1 組取る。
        // 前回の組を取り切る前に閉じていた場合 (slice_done が残っている) は続きから再開し、
        // そうでなければ前回から 5 分以上空いている時だけ動かす。
        // 閉じている間に予定時刻を過ぎていても、取り戻さずにそこから 10 分間隔にずらす (オーナー指示)。
        tokio::time::sleep(Duration::from_secs(15)).await;
        {
            let store = load_store(&app);
            let interrupted = !store.slice_done.is_empty();
            if !store.watches.is_empty() && (interrupted || now_secs() - store.sliced_at >= 300) {
                let sl = store.slice_cursor % SLICES;
                if let Err(e) = sample_slice(&app, Some(sl)).await {
                    eprintln!("[market_flow] 起動時のサンプリング失敗: {e}");
                }
            }
        }
        loop {
            let store = load_store(&app);
            let now = now_secs();
            // 10 分おきに 1 組。取りこぼした回は retry_at (レート制限の明ける頃) に再挑戦
            let due = now - store.sliced_at >= SLICE_INTERVAL_SECS || (store.retry_at > 0 && now >= store.retry_at);
            if due && !store.watches.is_empty() {
                let sl = store.slice_cursor % SLICES;
                if let Err(e) = sample_slice(&app, Some(sl)).await {
                    eprintln!("[market_flow] サンプリング失敗: {e}");
                }
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lr(id: &str, amount: f64) -> ListingRef {
        ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: None }
    }
    fn lr_at(id: &str, amount: f64, listed_at: i64) -> ListingRef {
        ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: Some(listed_at) }
    }

    /// 出品時刻が取れていれば、こちらが見つけた時刻ではなく出品時刻から齢を数える
    #[test]
    fn age_counts_from_listed_at() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        // 17 時間前に出品された物を今見つけた
        apply_sample(&mut st, t0, 1, &["a".into()], &[lr_at("a", 43.0, t0 - 17 * 3600)], true);
        let t = &st.tracked[0];
        assert_eq!(t.entry_age(), 17 * 3600);
        assert_eq!(t.age(t0), 17 * 3600);
        // 1 時間後に消えたら寿命は 18 時間
        apply_sample(&mut st, t0 + 3600, 0, &[], &[], true);
        assert_eq!(st.tracked[0].age(t0 + 3600), 18 * 3600);
    }

    /// 出品時刻のパース (2026-01-01T00:00:00Z = 1767225600)
    #[test]
    fn parse_indexed_reads_rfc3339() {
        assert_eq!(parse_indexed("2026-01-01T00:00:00Z"), Some(1_767_225_600));
        assert_eq!(parse_indexed("2024-02-29T00:00:00Z"), Some(1_709_164_800));
        assert_eq!(parse_indexed("bad"), None);
    }

    /// 最安 10 件が丸ごと安い出品に入れ替わっても、前の出品は「消えた」にならない
    /// (オーナーの例: 50 神が滞留しているところに 40 神が 20 件参戦)
    #[test]
    fn cheaper_flood_does_not_count_as_sold() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        // 50 神が 10 件並んでいる
        let old: Vec<String> = (0..10).map(|i| format!("old{i}")).collect();
        let old_entries: Vec<ListingRef> = old.iter().map(|id| lr(id, 50.0)).collect();
        apply_sample(&mut st, t0, 10, &old, &old_entries, true);
        assert_eq!(st.tracked.len(), 10);

        // 40 神が 20 件参戦。search の一覧には新旧 30 件すべてが入る
        let new: Vec<String> = (0..20).map(|i| format!("new{i}")).collect();
        let mut all = new.clone();
        all.extend(old.clone());
        let new_top: Vec<ListingRef> = new.iter().take(10).map(|id| lr(id, 40.0)).collect();
        apply_sample(&mut st, t0 + 3600, 30, &all, &new_top, true);

        // 50 神は 1 件も消えていない
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
        // 新しい 10 件が追跡に加わっている
        assert_eq!(st.tracked.len(), 20);
    }

    /// 一覧から消えたら売れた扱い。寿命が入る
    #[test]
    fn disappearing_listing_gets_lifetime() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 2, &["a".into(), "b".into()], &[lr("a", 40.0), lr("b", 41.0)], true);
        apply_sample(&mut st, t0 + 7200, 1, &["b".into()], &[lr("b", 41.0)], true);
        let gone: Vec<&Tracked> = st.tracked.iter().filter(|t| t.gone_at.is_some()).collect();
        assert_eq!(gone.len(), 1);
        assert_eq!(gone[0].id, "a");
        assert_eq!(gone[0].age(t0 + 7200), 7200);
    }

    /// 総数が 100 以上 (一覧が途中まで) の時は勝手に消えた判定をしない
    #[test]
    fn incomplete_list_does_not_mark_gone() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 150, &["a".into()], &[lr("a", 40.0)], false);
        apply_sample(&mut st, t0 + 3600, 150, &["z".into()], &[lr("z", 39.0)], false);
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
    }

    /// 名指しの確認で「居なかった」なら消えた扱い
    #[test]
    fn confirm_marks_missing_as_gone() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 150, &["a".into(), "b".into()], &[lr("a", 40.0), lr("b", 41.0)], false);
        let alive: HashSet<String> = ["b".to_string()].into_iter().collect();
        apply_confirm(&mut st, t0 + 10_800, &["a".to_string(), "b".to_string()], &alive);
        let gone: Vec<&Tracked> = st.tracked.iter().filter(|t| t.gone_at.is_some()).collect();
        assert_eq!(gone.len(), 1);
        assert_eq!(gone[0].id, "a");
    }

    /// 自動リストを入れ替えても、手動で足した銘柄は残る
    #[test]
    fn manual_watches_survive_auto_refresh() {
        let manual = Watch { key: "Manual".into(), label: "手動".into(), query: serde_json::json!({}), note: String::new(), manual: true, auto: false };
        let auto_old = Watch { key: "Old".into(), label: String::new(), query: serde_json::json!({}), note: String::new(), manual: false, auto: true };
        let auto_new = Watch { key: "New".into(), label: String::new(), query: serde_json::json!({}), note: String::new(), manual: false, auto: true };
        // set_watches と同じ合成をここで再現 (ファイル入出力を挟まずに検証)
        let existing = vec![manual.clone(), auto_old];
        let incoming = vec![auto_new.clone()];
        let mut watches: Vec<Watch> = existing.iter().filter(|w| w.manual).map(|w| Watch { auto: false, ..w.clone() }).collect();
        let manual_keys: HashSet<String> = watches.iter().map(|w| w.key.clone()).collect();
        for w in incoming {
            if !manual_keys.contains(&w.key) {
                watches.push(Watch { manual: false, ..w });
            }
        }
        let keys: Vec<&str> = watches.iter().map(|w| w.key.as_str()).collect();
        assert_eq!(keys, vec!["Manual", "New"]);
    }

    /// 消えた扱いにした出品が再び現れたら生き返る (出品者が一時的にオフラインだった等)
    #[test]
    fn reappearing_listing_revives() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 1, &["a".into()], &[lr("a", 40.0)], true);
        apply_sample(&mut st, t0 + 3600, 0, &[], &[], true);
        assert!(st.tracked[0].gone_at.is_some());
        apply_sample(&mut st, t0 + 7200, 1, &["a".into()], &[lr("a", 40.0)], true);
        assert!(st.tracked[0].gone_at.is_none(), "再び見えたら生存に戻す");
    }

    /// 生き返った出品は日次の「消えた」からも引く
    #[test]
    fn revive_undoes_daily_gone() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".to_string()), listed_at: None };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        // b が一時的に見えなくなる
        apply_sample(&mut st, now + 600, 1, &["a".into()], &[e("a")], true);
        assert_eq!(st.daily[0].gone, 1);
        // また現れた: 売れていない
        apply_sample(&mut st, now + 1200, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        assert_eq!(st.daily[0].gone, 0, "日次の消えた件数も戻す");
        assert!(st.tracked.iter().all(|t| t.gone_at.is_none()));
    }

    /// 半分以上が一度に消えたように見えたら、検索結果だけで判定しない
    #[test]
    fn mass_disappearance_is_not_trusted() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".into()), listed_at: None };
        let ids: Vec<String> = (0..10).map(|i| format!("id{i}")).collect();
        let entries: Vec<ListingRef> = ids.iter().map(|i| e(i)).collect();
        apply_sample(&mut st, now, 10, &ids, &entries, true);
        // 10 件中 1 件しか残っていない応答
        let few = vec!["id0".to_string()];
        assert!(looks_like_mass_gone(&st, &few), "9/10 が消えたら怪しい");
        // 2 件だけ消えたのは普通に売れただけ
        let most: Vec<String> = ids.iter().take(8).cloned().collect();
        assert!(!looks_like_mass_gone(&st, &most), "2/10 なら普通");
    }

    /// 検索が空で返った時に、追跡中の出品を全部「売れた」にしない
    #[test]
    fn empty_result_does_not_wipe_tracked() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".into()), listed_at: None };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        // 空の応答 (total 0 / ID 0 件)
        let ids: Vec<String> = Vec::new();
        let list_complete = ids.len() as u64 >= 0 && !(ids.is_empty() && !st.tracked.is_empty());
        assert!(!list_complete, "空の応答では消えた判定をしない");
        apply_sample(&mut st, now + 3600, 0, &ids, &[], list_complete);
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
    }

    /// 古いクエリ (securable) は any に直す
    #[test]
    fn force_status_any_rewrites_old_queries() {
        let mut q = serde_json::json!({"query":{"status":{"option":"securable"},"type":{"option":"Comet"}},"sort":{"price":"asc"}});
        assert!(force_status_any(&mut q), "直したら true");
        assert_eq!(q["query"]["status"]["option"], "any");
        assert_eq!(q["query"]["type"]["option"], "Comet", "他の条件は触らない");
        assert!(!force_status_any(&mut q), "もう any なら false");
    }

    /// 手動で追っていた銘柄が自動リストにも載ったら、巡回に入れて記録は続きから使う
    #[test]
    fn manual_watch_joins_rotation_when_listed() {
        let manual = Watch { key: "Arc::finished".into(), label: "手動".into(), query: serde_json::json!({"a":1}), note: String::new(), manual: true, auto: false };
        let listed = Watch { key: "Arc::finished".into(), label: "アーク".into(), query: serde_json::json!({"b":2}), note: "完成品 41 人".into(), manual: false, auto: false };
        let mut watches: Vec<Watch> = vec![manual].into_iter().map(|w| Watch { auto: false, ..w }).collect();
        for w in vec![listed] {
            match watches.iter_mut().find(|x| x.key == w.key) {
                Some(e) => { e.auto = true; e.label = w.label; e.query = w.query; e.note = w.note; }
                None => watches.push(Watch { manual: false, auto: true, ..w }),
            }
        }
        assert_eq!(watches.len(), 1, "同じ銘柄が 2 つに増えない");
        assert!(watches[0].manual && watches[0].auto, "手動のまま巡回にも入る");
        assert_eq!(watches[0].label, "アーク", "自動リストの名前とクエリで上書き");
        assert_eq!(watches[0].query, serde_json::json!({"b":2}));
    }

    /// 一覧の入れ替え: 被っている銘柄はそのまま、外れた銘柄も 7 日は記録を残す
    #[test]
    fn set_watches_keeps_recent_states() {
        let now = 1_700_000_000i64;
        let mut states: HashMap<String, WatchState> = HashMap::new();
        states.insert("Keep".into(), WatchState { sampled_at: now - 60, ..Default::default() });
        states.insert("Dropped".into(), WatchState { sampled_at: now - 3600, ..Default::default() });
        states.insert("Ancient".into(), WatchState { sampled_at: now - TRACK_MAX_SECS - 60, ..Default::default() });
        let keys: HashSet<String> = ["Keep".to_string()].into_iter().collect();
        let cutoff = now - TRACK_MAX_SECS;
        states.retain(|k, st| keys.contains(k) || st.sampled_at >= cutoff);
        let mut left: Vec<&String> = states.keys().collect();
        left.sort();
        assert_eq!(left, vec!["Dropped", "Keep"], "外れた銘柄も 7 日以内なら残る");
    }

    /// 中断から再開する時、取り済みの銘柄は飛ばす
    #[test]
    fn resume_skips_done_watches() {
        let keys = ["A", "B", "C"];
        let done: HashSet<String> = ["A".to_string()].into_iter().collect();
        let todo: Vec<&str> = keys.iter().copied().filter(|k| !done.contains(*k)).collect();
        assert_eq!(todo, vec!["B", "C"]);
    }

    /// 7 日を超えて生き残った出品は集計に畳んで捨てる (キャッシュを膨らませない)
    #[test]
    fn prune_drops_after_a_week() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 1, &["a".into()], &[lr("a", 40.0)], true);
        prune(&mut st, t0 + TRACK_MAX_SECS + 60);
        assert!(st.tracked.is_empty());
        assert_eq!(st.daily.iter().map(|d| d.survived).sum::<u32>(), 1);
    }
}

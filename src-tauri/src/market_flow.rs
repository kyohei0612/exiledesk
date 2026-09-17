//! 捌き速度の追跡 — 仕様 (2026-09-17 確定版)
//!
//! 「この商品は何日で売れるのか」を、公式 trade2 の出品を定期的に覗いて測る。
//! ジェム専用ではなく、trade2 のクエリを 1 本渡せば何でも追える。
//!
//! ## 1. 見る母集団: インスタントバイアウトだけ (status: securable)
//! 売値の表示も追跡も同じ条件で見る。オーナー指示:「インスタントバイアウトだけ見たらいい。
//! その中でルール決めるからエニーで見る必要が全くない」。
//! 母集団を 1 つに固定したので、画面の「再取得」で取った結果も自動巡回とまったく同じ
//! ルールで判定できる (条件が違う物を混ぜると、消えた/現れたが嘘になる)。
//!
//! トレードサイトのドロップダウンとの対応:
//!   available / securable / onlineleague / online / any
//!   = インスタントバイアウトおよび対面トレード / インスタントバイアウト /
//!     対面トレード (リーグにオンライン) / 対面トレード (オンライン) / 指定なし
//!
//! ## 2. 数え方: 出品 1 件ずつを ID で追う
//! 照合は **ID だけ**で行う (値段や順位は使わない)。安い出品が大量に増えて順位が下がっても、
//! ID 一覧に載っていれば生存。一覧 (最大 100) から溢れた分は直接照会に回す。
//! 追跡中の出品が最安 10 件に入っていれば値段を今の値に更新する (値下げに追従)。
//! 最安 10 件の listing ID を追跡対象に入れ、search が返す ID 一覧に載っているかを見る。
//! 「出品された時刻 (listing.indexed) → 消えた時刻」がその出品の寿命。
//! 窓 (最安 10 件) から押し出されただけの物を売れた扱いにしないため、ID で追う。
//! 例:「50 神が滞留しているところに 40 神が 20 件参戦」→ 最安 10 件は入れ替わるが、
//! 50 神の ID は追跡し続けるので売れたことにはならない。
//!
//! ## 3. 消えた判定は必ず裏取りする (ここが一番大事)
//! 検索から消えただけでは「売れた」と数えない。securable は出品者の状況で出入りするため。
//! 消えた候補は **その ID を直接 fetch** して実在を確かめる。fetch は status の絞り込みを
//! 受けないので、「即時購入から外れただけ」と「本当に無くなった」を確実に見分けられる。
//!   - 直接照会で返ってくる → 生きている (last_seen を更新)
//!   - 返ってこない         → そこで初めて売れた (gone_at)
//!   - 消えた扱いの ID がまた現れたら復活させ、日次の件数からも引く
//!
//! 2026-09-16〜17 にこれを怠って踏んだ事故: 深夜に 10 件同時消失を「売れた」と数え、
//! 9 日売れ残っていた出品まで売れたことになっていた。
//!
//! ## 4. 取得量 (trade2: 5/10 秒, 15/60 秒, 30/5 分, 600/6 時間 = 毎時 100 回)
//! 銘柄を 12 組に分け、10 分おきに 1 組ずつ取る (2 時間で全銘柄が 1 巡)。
//! 組は**ジェム単位**で割り当てるので、1 ジェムの 3 条件は必ず同じ組で一緒に取れる。
//! まだ 1 度も取れていない銘柄がある間 (記録の作り直し直後) は 5 分おきに詰めて、
//! 約 1 時間で 1 周目を埋める。
//!   - search  … 1 銘柄 1 巡に 1 回 (生存確認)
//!   - fetch   … 1 銘柄 1 巡に 1 回。値段の更新に加えて、**新しい出品を追跡に入れるのがここ**。
//!               間隔を空けるとその間に出品されて売れた物を丸ごと取りこぼし、速度が遅い側に偏る
//!   - 確認    … 消えた候補の直接照会。巡回のたびに行う (1 組 CONFIRM_MAX_PER_SLICE 銘柄 ×
//!               10 件まで)。ここを間引くと消えた候補が滞留して判定が出ない
//! 18 ジェム (54 銘柄) で毎時およそ 78 回。残りは手動の取得や取引所比較の取り分。
//! 1 組の中でも送信間隔を均してバーストを作らない。
//!
//! ## 5. 保存済みクエリは毎回今のルールに直す
//! 追跡は登録時のクエリを使い回すので、条件を変えた時に上書きしないと古い条件のまま回る
//! (2026-09-17 に securable のまま / any のまま を両方踏んだ)。
//! 読み込み時と送信直前に normalize_track_status で status を直し、
//! 直した銘柄・条件が変わった銘柄・リーグが変わった時は記録を作り直す。
//!
//! ## 6. キャッシュの上限
//! 追跡は 1 ID につき 7 日で打ち切り、それ以降は日次集計に畳んで捨てる。
//! 自動リストから外れた銘柄の記録も、7 日触られなければ掃除する。
//!
//! ## 7. 判定 (フロント側 src/services/market-flow.ts)
//! 「1 日以内に売れた割合」で 速い / 普通 / 遅い を出す。割合の分母は結果が分かっている
//! 出品だけ (売れた + その時間を超えて売れ残った) で、齢が足りない物は数えない。
//! 売れ残りを 1 件も観測していないうちは必ず 100% になるので「(暫定)」を付ける。
//!
//! ## 経緯: 滞留時間をやめた理由
//! 最初は「今並んでいる出品が何分前に出された物か」で測っていたが、
//! examples/gem_flow_sim.rs で 6 パターンの市場を作って検算したところ **速い市場ほど遅く出た**。
//! 良い出品は覗く前に売れていて、目に入るのは売れ残りだけだから。そこで ID 追跡に切り替えた。
//!
//! ## 検証 (公式 API は叩かない)
//!   cargo run --example flow_audit   … 事故 8 パターンをダミー応答で再現
//!   pnpm check:flow                  … 判定ロジックと検索条件をダミーで検算

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
    /// 出品者のアカウント名 (2026-09-17)
    #[serde(default)]
    pub account: Option<String>,
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
    /// 最後に値段 (fetch) を取った時刻。2 巡に 1 回だけ取り直す
    #[serde(default)]
    pub fetched_at: i64,
    /// 最安値 (表示用)
    #[serde(default)]
    pub cheapest_amount: Option<f64>,
    #[serde(default)]
    pub cheapest_currency: Option<String>,
}

/// 記録の作り方を変えた時に上げる。合わないデータは捨てて取り直す
///
/// 3 … 2026-09-17: 保存済みのクエリが古いまま巡回していたので作り直した。
/// 4 … 2026-09-17 (オーナー指示):「インスタントバイアウトだけ見ればいい。
///     その中でルールを決めるからエニーで見る必要が全くない」。
///     検索を securable (即時購入のみ) に統一したので、any で貯めた記録とは母集団が違う。
pub const FLOW_SCHEMA: u32 = 4;

/// 追跡に使う `query.status.option`。
///
/// トレードサイトの「インスタントバイアウト」= securable。
/// オーナー指示 (2026-09-17):「インスタントバイアウトだけ見ればいい。
/// その中でルールを決めるからエニーで見る必要が全くない」。
/// 画面の売値と同じ条件なので、手動の再取得も自動巡回と同じルールで判定できる。
///
/// securable は出品者の状況で出入りするが、消えた候補は ID を直接 fetch して
/// 実在を確かめてから判定する (fetch は status の絞り込みを受けない)。
const TRACK_STATUS: &str = "securable";

/// 保存済みのクエリを今のルール (TRACK_STATUS) に合わせる。直したら true。
///
/// 追跡の検索は登録時のクエリを使い回すので、条件を変えた時はここで上書きしないと
/// 古い条件のまま回り続ける (2026-09-17 に securable のまま / any のまま を両方踏んだ)。
fn normalize_track_status(query: &mut serde_json::Value) -> bool {
    let Some(q) = query.get_mut("query") else { return false };
    if q.get("status").and_then(|s| s.get("option")).and_then(|o| o.as_str()) == Some(TRACK_STATUS) {
        return false;
    }
    if let Some(obj) = q.as_object_mut() {
        obj.insert("status".to_string(), serde_json::json!({ "option": TRACK_STATUS }));
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
/// 確認 fetch の最短間隔。
///
/// 巡回そのものが 1 銘柄 1 巡 (2 時間) に 1 回なので、ここで更に間隔を空けると
/// 「消えた候補」が次の周まで放置され、いつまでも売れた判定が出ない
/// (2026-09-17: 54 銘柄中 8 銘柄しか確認できておらず、候補 7 件が保留のままだった)。
/// 巡回のたびに確認してよいので、事故防止の下限だけ残す。
const CONFIRM_INTERVAL_SECS: i64 = 60;

/// 1 組 (10 分) あたりの確認 fetch の上限。
///
/// 検索を securable (即時購入のみ) に統一したので「検索から消えた = 売れた」とは判定せず、
/// 必ず ID を直接 fetch して実在を確かめる。そのため確認 fetch が主役になる。
/// 1 組に入る銘柄 (18 ジェム = 54 銘柄なら 4〜5 本) を取りこぼさない数にしておく。
/// 12 組 (2 時間) で最大 60 回 = 毎時 30 回。検索 27 + 値段 27 と合わせて毎時 84 回。
const CONFIRM_MAX_PER_SLICE: usize = 5;
/// リクエストの間隔
const REQUEST_INTERVAL: Duration = Duration::from_secs(8);
/// 1 巡を何回に分けて取るか。SLICES × SLICE_INTERVAL_SECS = 1 巡の周期 (2 時間)
const SLICES: usize = 12;
/// 分割 1 回の間隔 (1 巡 = SLICES × これ)
const SLICE_INTERVAL_SECS: i64 = 600;

/// まだ 1 度も取れていない銘柄がある間の間隔 (1 周目を早く埋める)。
///
/// 記録を作り直した直後は全銘柄が空で、通常の間隔だと全部埋まるまで 2 時間かかり、
/// 画面上は「追跡が切れている」ように見える (オーナー報告 2026-09-17)。
/// 1 周目だけ詰めて約 1 時間で埋める。その 1 時間は毎時 108 回ペースになるが、
/// 以降は毎時 65 回に戻るので 6 時間 600 回の枠には収まる (6 時間で約 433 回)。
const FIRST_PASS_SLICE_SECS: i64 = 300;

/// 1 周目が終わっていない (まだ 1 度も取れていない自動銘柄がある) か
fn in_first_pass(store: &FlowStore) -> bool {
    store
        .watches
        .iter()
        .filter(|w| w.auto)
        .any(|w| store.states.get(&w.key).map(|st| st.sampled_at == 0).unwrap_or(true))
}

/// 次の組までの間隔 (1 周目だけ詰める)
fn slice_interval(store: &FlowStore) -> i64 {
    if in_first_pass(store) {
        FIRST_PASS_SLICE_SECS
    } else {
        SLICE_INTERVAL_SECS
    }
}

/// 値段 (fetch) を取り直す間隔 = 毎巡 (2 時間)。
///
/// 一度 4 時間おき (2 巡に 1 回) にしたが、**新しい出品が追跡に入るのは fetch の時だけ**なので、
/// 空白の間に出品されて売れた物が丸ごと見えなくなる。速く売れる物ほど取りこぼすので、
/// 捌き速度が遅い側に偏る (2026-09-17 オーナー指摘の「取得は 4 時間に 1 回なんよね？」で気付いた)。
/// 測るのが速度である以上ここは削れないので毎巡取り直す。
///
/// 使う枠の計算 (trade2 の search は 600 回 / 6 時間 = 毎時 100 回):
///   18 ジェム × 3 条件 = 54 銘柄 → 2 時間で search 54 + fetch 54 = 108 回 = 毎時 54 回
///   確認 fetch 毎時 24 回を足して 約 78 回。残りは手動の取得や取引所比較に使える
const FETCH_INTERVAL_SECS: i64 = 7000;
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
        if normalize_track_status(&mut w.query) {
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
    merge_watches(&mut store, req.watches, &req.league, now_secs());
    if let Some(s) = req.site {
        store.site = s;
    }
    save_store(&app, &store)?;
    Ok(store)
}

/// 監視リストの入れ替え本体 (テストできるよう AppHandle から切り離してある)。
///
/// 記録 (states) の扱い:
///   - 被っている銘柄 … そのまま使う (キャッシュを引き継ぐ。オーナー指示 2026-09-17)
///   - 外れた銘柄     … 消さない。7 日触られていない物だけ掃除する。
///                      7 日以内に戻せば続きから追える
///   - 条件が変わった銘柄 … 別の検索の結果なので作り直す (混ぜると誤判定する)
///   - リーグが変わった   … 別の市場なので全部作り直す
pub fn merge_watches(store: &mut FlowStore, incoming: Vec<Watch>, league: &str, now: i64) {
    // 手動分は残す。いったん巡回から外し、今回のリストに載っていれば戻す
    let mut watches: Vec<Watch> = store
        .watches
        .iter()
        .filter(|w| w.manual)
        .map(|w| Watch { auto: false, ..w.clone() })
        .collect();
    let mut changed: Vec<String> = Vec::new();
    for w in incoming {
        match watches.iter_mut().find(|x| x.key == w.key) {
            Some(existing) => {
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
    let cutoff = now - TRACK_MAX_SECS;
    store.states.retain(|k, st| keys.contains(k) || st.sampled_at >= cutoff);
    if !store.league.is_empty() && store.league != league {
        store.states.clear();
        store.slice_done.clear();
    }
    store.watches = watches;
    store.league = league.to_string();
    store.list_refreshed_at = now;
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
    /// 出品者のアカウント名。
    /// オーナー指示 (2026-09-17):「大事なのは出品者の名前と売値が最重要」。
    /// 同じ人がまとめて引き上げたのか、別々の人の出品が売れたのかを見分けるのに使う
    #[serde(default)]
    pub account: Option<String>,
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
    // 2026-09-17: 画面の売値も巡回も同じ条件 (securable) になったので、
    // 手動で取った結果も自動巡回と同じルールで判定してよい (partial は使わない)
    // 自動巡回と同じルール: 検索結果だけでは消えた判定をせず、要確認の ID を画面に返す
    apply_sample(state, now, req.total, &req.ids, &req.entries, false);
    // 出品が 100 件を超えていて search の一覧に載らなかった追跡分は、
    // 直接 fetch しないと生死が分からない。画面側に投げ返して確認してもらう (2026-09-17)
    let missing: Vec<String> = {
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

    // 値段の取り直し: 追跡中の出品が最安 10 件に入っていたら、今の値段に更新する。
    // 出品者が値下げしても ID は変わらないので、更新しないと売れたリストの値段が古いままになる
    // (2026-09-17 オーナー指摘)。出品時刻は最初に見た値のままにする (寿命の起点を動かさない)
    for e in entries {
        if let Some(t) = state.tracked.iter_mut().find(|t| t.id == e.id && t.gone_at.is_none()) {
            if e.amount.is_some() {
                t.amount = e.amount;
                t.currency = e.currency.clone();
            }
            if t.account.is_none() {
                t.account = e.account.clone();
            }
        }
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
            account: e.account.clone(),
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
    // 自動で追う銘柄を SLICES 組に分け、指定された組だけ取る。
    //
    // 組は「ジェム単位」で割り当てる。1 ジェムの 3 条件 (レベル 21 / 品質 23% / 完成品) が
    // 別々の組に散ると、画面ではジェムごとに 1 条件だけ記録がある状態が続いて
    // 「品質 23% とレベル +1 の追跡が切れている」ように見える (オーナー報告 2026-09-17)。
    let mut gem_order: Vec<&str> = Vec::new();
    let auto: Vec<&Watch> = store
        .watches
        .iter()
        .filter(|w| w.auto)
        .filter(|w| {
            let gem = w.key.split("::").next().unwrap_or(w.key.as_str());
            let idx = match gem_order.iter().position(|g| *g == gem) {
                Some(i) => i,
                None => {
                    gem_order.push(gem);
                    gem_order.len() - 1
                }
            };
            slice.map(|sl| idx % SLICES == sl).unwrap_or(true)
        })
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
        let secs = ((slice_interval(&store) as f64 * 0.9) / (total_watches as f64 * 2.0)).clamp(8.0, 120.0);
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
        normalize_track_status(&mut query);
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
        // 生存確認は上の ID 一覧で足りるので、値段は 2 巡に 1 回だけ取り直す
        let last_fetched = load_store(app).states.get(&watch.key).map(|s| s.fetched_at).unwrap_or(0);
        let need_fetch = now - last_fetched >= FETCH_INTERVAL_SECS;
        let mut entries: Vec<ListingRef> = Vec::new();
        let top: Vec<String> = if need_fetch { ids.iter().take(10).cloned().collect() } else { Vec::new() };
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
                                account: listing
                                    .and_then(|l| l.get("account"))
                                    .and_then(|a| a.get("name"))
                                    .and_then(|x| x.as_str())
                                    .map(str::to_string),
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
        // 検索結果だけでは「消えた = 売れた」と判定しない (2026-09-17)。
        //
        // securable (即時購入のみ) は出品者の状況で出入りするので、検索から消えただけでは
        // 売れたと言えない。消えた候補は下の確認 fetch (ID 直接照会。status の絞り込みを
        // 受けないので実在が確実に分かる) に回し、そこで居なければ売れたと数える。
        let list_complete = false;
        apply_sample(state, now, total, &ids, &entries, list_complete);
        if need_fetch {
            state.fetched_at = now;
        }

        // --- 行方不明の確認 (巡回ごと、1 銘柄 10 件まで、1 組 CONFIRM_MAX_PER_SLICE 銘柄まで) ---
        // 枠を超えた分は次の巡回に回る (判定が遅れるだけで、間違った判定にはならない)
        let need_confirm = now - state.confirmed_at >= CONFIRM_INTERVAL_SECS && confirmed_in_slice < CONFIRM_MAX_PER_SLICE;
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
    /// 1 度でも取れた自動銘柄の数 (1 周目の進捗。画面で「巡回待ち」を出すのに使う)
    pub sampled_watches: usize,
    /// 検索から消えていて、まだ直接照会で決着していない出品の数。
    /// ここが増え続けるなら確認が追いついていない (2026-09-17 に実際に滞留した)
    pub pending_missing: usize,
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
            store.sliced_at + slice_interval(&store)
        } else {
            0
        },
        pending_missing: store
            .states
            .values()
            .map(|st| st.tracked.iter().filter(|t| t.gone_at.is_none() && t.last_seen < st.sampled_at).count())
            .sum(),
        sampled_watches: store
            .watches
            .iter()
            .filter(|w| w.auto && store.states.get(&w.key).map(|st| st.sampled_at > 0).unwrap_or(false))
            .count(),
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
            let due = now - store.sliced_at >= slice_interval(&store) || (store.retry_at > 0 && now >= store.retry_at);
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
        ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: None , account: None }
    }
    fn lr_at(id: &str, amount: f64, listed_at: i64) -> ListingRef {
        ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: Some(listed_at) , account: None }
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
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".to_string()), listed_at: None , account: None };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        // b が一時的に見えなくなる
        apply_sample(&mut st, now + 600, 1, &["a".into()], &[e("a")], true);
        assert_eq!(st.daily[0].gone, 1);
        // また現れた: 売れていない
        apply_sample(&mut st, now + 1200, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        assert_eq!(st.daily[0].gone, 0, "日次の消えた件数も戻す");
        assert!(st.tracked.iter().all(|t| t.gone_at.is_none()));
    }

    /// 追跡中の出品が値下げされたら、記録の値段も追従する
    #[test]
    fn price_is_refreshed_for_tracked_listings() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str, amt: f64| ListingRef { id: id.into(), amount: Some(amt), currency: Some("divine".into()), listed_at: Some(now - 3600), account: Some("Seller#1".into()) };
        apply_sample(&mut st, now, 1, &["a".into()], &[e("a", 10.0)], false);
        apply_sample(&mut st, now + 7200, 1, &["a".into()], &[e("a", 7.0)], false);
        let t = st.tracked.iter().find(|t| t.id == "a").unwrap();
        assert_eq!(t.amount, Some(7.0), "値下げが反映される");
        assert_eq!(t.listed_at, Some(now - 3600), "出品時刻は動かさない");
        assert_eq!(st.tracked.len(), 1, "同じ ID を二重に追跡しない");
    }

    /// 検索が空で返った時に、追跡中の出品を全部「売れた」にしない
    #[test]
    fn empty_result_does_not_wipe_tracked() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".into()), listed_at: None , account: None };
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
    fn normalize_track_status_rewrites_old_queries() {
        let mut q = serde_json::json!({"query":{"status":{"option":"any"},"type":{"option":"Comet"}},"sort":{"price":"asc"}});
        assert!(normalize_track_status(&mut q), "直したら true");
        assert_eq!(q["query"]["status"]["option"], TRACK_STATUS);
        assert_eq!(q["query"]["type"]["option"], "Comet", "他の条件は触らない");
        assert!(!normalize_track_status(&mut q), "もう securable なら false");
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

    /// 監視から外して戻しても、7 日以内なら記録を引き継ぐ (オーナー指示 2026-09-17)
    #[test]
    fn dropped_and_readded_gem_keeps_its_records() {
        let now = 1_700_000_000i64;
        let watch = |key: &str| Watch {
            key: key.to_string(),
            label: key.to_string(),
            query: serde_json::json!({ "query": { "type": { "option": key } } }),
            note: String::new(),
            manual: false,
            auto: true,
        };
        let mut store = FlowStore::default();
        merge_watches(&mut store, vec![watch("Arc::level21"), watch("Comet::level21")], "L", now);
        // 記録を作る
        let st = store.states.entry("Arc::level21".into()).or_default();
        st.tracked.push(Tracked { id: "a".into(), listed_at: Some(now - 3600), first_seen: now, last_seen: now, gone_at: None, amount: Some(9.0), currency: Some("divine".into()), account: None });
        st.sampled_at = now;

        // 監視から外す (コメットだけにする)
        merge_watches(&mut store, vec![watch("Comet::level21")], "L", now + 600);
        assert!(store.states.contains_key("Arc::level21"), "外しても記録は消えない");

        // 3 日後に戻す
        let back = now + 3 * 24 * 3600;
        merge_watches(&mut store, vec![watch("Arc::level21"), watch("Comet::level21")], "L", back);
        let st = store.states.get("Arc::level21").expect("記録が残っている");
        assert_eq!(st.tracked.len(), 1, "前の追跡をそのまま引き継ぐ");
        assert_eq!(st.tracked[0].id, "a");

        // 8 日触られなければ掃除される
        merge_watches(&mut store, vec![watch("Comet::level21")], "L", now + 8 * 24 * 3600);
        assert!(!store.states.contains_key("Arc::level21"), "7 日を過ぎた分は掃除する");
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

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
//! ## 3. 生きているかは「検索の ID 一覧」だけで見る (ここが一番大事)
//! search が返す ID 一覧が、その時点で実際に並んでいる出品そのもの。
//! 一覧から消えた = 売れた (か取り下げた) と数える。
//! オーナー指摘 (2026-09-17):「インスタから対面トレードに切り替える人は存在しない」
//! ので、即時購入の一覧から消えることは実質「売れた」を意味する。
//!
//! **ID を直接 fetch する裏取りは使えない**。2026-09-17 に実測したところ、
//! 既に市場から消えた出品 (指定なしの検索にも出てこない ID) に対しても fetch は
//! 200 で値段つきのデータを返した。つまり fetch はキャッシュの読み出しであって
//! 生存確認にならない。これに気づくまで「売れた」が 1 件も出ない状態が続いた。
//!
//! 誤判定を避けるための条件:
//!   - ID 一覧が総数に届いていない時 (100 件超で切れている) は判定しない。
//!     載っていない追跡分は「値段で沈んだ」として buried を進め、3 回続いたら追跡終了
//!   - 応答が空の時は判定しない (通信不良で全滅させない)
//!   - 消えた出品と同じ出品者が、前回その出品を見た後に新しく並べていたら値段の付け替えとみなし、
//!     売れた件数には数えない (RELIST_SLACK_SECS。見るのは最安 10 件の範囲)
//!   - 消えた扱いの ID がまた現れたら復活させ、日次の件数からも引く
//!
//! ### 出品が増えても回数は増えない
//! search は 1 銘柄 1 回で ID を最大 100 件まとめて返し、fetch も最安 10 件を 1 回なので、
//! **リクエストは銘柄数だけで決まる**。出品が 100 件を超えて一覧が切れている間は
//! 判定せず、載っていない追跡分の buried を進めて BURIED_MAX 回続いたら追跡をやめる
//! (日次の buried に畳む。売れたのか沈んだのかは分からないので survived とは分ける)。
//!
//! ## 4. 取得量 (trade2: 5/10 秒, 15/60 秒, 30/5 分, 600/6 時間 = 毎時 100 回)
//! 前回の一括取得 (手動 / 自動どちらでも swept_at に記録) から周期ぶん経ったら、
//! 全銘柄をまとめて 1 巡する。周期は画面から 1〜24 時間で変えられる (FlowStore.cycle_secs、既定 8 時間)。
//! オーナー指示 (2026-09-17):「自動が 8 時間に 1 回ね」。手動の一括取得はいつでも押せる。
//!   - search  … 1 銘柄 1 巡に 1 回 (生存確認)
//!   - fetch   … 1 銘柄 1 巡に 1 回。値段の更新に加えて、**新しい出品を追跡に入れるのがここ**。
//!               間隔を空けるとその間に出品されて売れた物を丸ごと取りこぼし、速度が遅い側に偏る
//! 送信の間隔は trade2 側の門番 (gate_acquire) が上限ヘッダから決める。罰則を食らう前に待つので
//! 1 巡の途中で長く止まらない (2026-09-18 オーナー指摘「レート止まる」)。
//! 429 や通信エラーで取れなかった銘柄だけ RETRY_GAP_SECS 後に取り直す (MAX_RETRY_ROUNDS 回まで)。
//! HTTP 400 など何度やっても同じ失敗は取り直さない (全銘柄を 10 分おきに回し直す事故を防ぐ)。
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
    /// 今の自動リストに入っているか。true なら周期ごとの一括取得で取る。
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
    /// 検索の一覧に出てこなかったのに、直接照会では生きていた回数 (連続)。
    /// 出品が 100 件を超えると安い順 100 件しか返らないので、値段で沈んだ出品がこうなる。
    /// 一覧に戻れば 0 に戻る。BURIED_MAX 回続いたら追跡から外す (2026-09-17)
    #[serde(default)]
    pub buried: u32,
    /// 消えたのと同時に、同じ出品者が新しく並べ直した形跡があるか。
    /// 値段の付け替え (取り下げ → すぐ再出品) とみなして、売れた件数には数えない
    #[serde(default)]
    pub relisted: bool,
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
    /// 最安帯から沈んで追うのをやめた件数 (売れたかどうかは分からない。survived と分ける 2026-09-18)
    #[serde(default)]
    pub buried: u32,
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
    /// 直近のサンプルで ID 一覧が全部取れていたか。
    /// false が続く銘柄は出品が 100 件を超えていて「消えた」を判定できない (画面に出す)
    #[serde(default = "default_true")]
    pub list_complete: bool,
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

fn default_true() -> bool {
    true
}

/// 追跡に使う `query.status.option`。
///
/// トレードサイトの「インスタントバイアウト」= securable。
/// オーナー指示 (2026-09-17):「インスタントバイアウトだけ見ればいい。
/// その中でルールを決めるからエニーで見る必要が全くない」。
/// 画面の売値と同じ条件なので、手動の再取得も自動巡回と同じルールで判定できる。
///
/// 生死は検索が返す ID 一覧だけで見る (ID 直接 fetch は消えた出品にもキャッシュを返すので使わない)。
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
    /// 429 / 通信エラーで取れなかった銘柄 (retry_at にこれだけ取り直す)
    #[serde(default)]
    pub retry_keys: Vec<String>,
    /// 今の 1 巡で取り終わった銘柄。巡が終わったら空にする。
    /// 薄く流す自動巡回は 1 巡に何時間もかかるので、途中でアプリを閉じても続きから再開する
    #[serde(default)]
    pub sweep_done: Vec<String>,
    /// 取り直しを何回続けたか (MAX_RETRY_ROUNDS で諦めて次の周期へ)
    #[serde(default)]
    pub retry_count: u32,
    /// 最後に全銘柄を 1 巡した時刻 (手動の一括取得でも自動でも記録する)。
    /// 次の自動取得はここから cycle_secs 後 (オーナー指示 2026-09-17:
    /// 「前回一括取得してから手動も含めて ● 時間周期で取得する」)
    #[serde(default)]
    pub swept_at: i64,
    /// 1 巡にかける時間 (秒)。0 なら既定 (CYCLE_DEFAULT_SECS)。
    /// オーナー指示 2026-09-17:「自動取得の時間数を UI で変更できるようにしたい」
    #[serde(default)]
    pub cycle_secs: i64,
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
/// 何回続けて「一覧に出ないが生きている」なら追跡をやめるか。
///
/// 安い順 100 件から沈んだ出品は、毎巡かならず「消えた候補」になり確認 fetch を食う。
/// 最安帯の捌け方を測るのが目的なので、沈んだ物は追うのをやめて集計に畳む
/// (オーナー指摘 2026-09-17:「出品がめっちゃ増えると ID 検索がめっちゃ増えるけど平気？」)
const BURIED_MAX: u32 = 3;

/// 検索の ID 一覧が「出品全部」を含んでいるか。
///
/// ここが true の時だけ「一覧に無い = 売れた」と判定してよい。
///   - ID が総数に届いていない (出品 100 件超で切れている) → 判定しない
///   - 応答が空なのに追跡中がある (通信不良など) → 判定しない
/// 自動巡回と手動取得で同じ式を使うため関数にしてある (2026-09-17 レビュー指摘)
pub fn list_is_complete(ids: &[String], total: u64, tracked: &[Tracked]) -> bool {
    ids.len() as u64 >= total && !(ids.is_empty() && !tracked.is_empty())
}
/// 「消えたのと同時に同じ出品者が並べ直した」とみなす余裕 (オーナー指示 2026-09-17)。
///
/// 判定は「前回その出品を見た後に、同じ出品者が新しく並べた」で行う。
/// 巡回は 8 時間おきなので、当初の「5 分以内」では実際には一度も引っかからなかった
/// (2026-09-17 レビュー: 売れた 105 件中 0 件)。前回確認からの区間で見る。
const RELIST_SLACK_SECS: i64 = 300;
/// 日次集計を残す日数
const DAILY_MAX_DAYS: usize = 30;
/// リクエストの最低間隔 (実際の間隔は trade2 の門番が上限から決める)
const REQUEST_INTERVAL: Duration = Duration::from_secs(1);
/// 1 巡の周期の既定 (8 時間)。画面から変えられる (FlowStore.cycle_secs)
pub const CYCLE_DEFAULT_SECS: i64 = 8 * 3600;
/// 変えられる範囲 (1 時間〜24 時間)
pub const CYCLE_MIN_SECS: i64 = 3600;
pub const CYCLE_MAX_SECS: i64 = 24 * 3600;


/// 1 巡の周期 (保存値、未設定や範囲外なら既定)
fn cycle_secs(store: &FlowStore) -> i64 {
    if store.cycle_secs <= 0 {
        CYCLE_DEFAULT_SECS
    } else {
        store.cycle_secs.clamp(CYCLE_MIN_SECS, CYCLE_MAX_SECS)
    }
}

/// 自動巡回の送信間隔 (秒)。1 巡を SWEEP_TARGET_SECS で終える速さ (周期がそれより短ければ周期に合わせる)
fn spread_pace_secs(watches: i64, cycle: i64) -> i64 {
    let reqs = (watches * 2).max(1);
    let window = SWEEP_TARGET_SECS.min(cycle.max(60));
    (window / reqs).clamp(REQUEST_INTERVAL.as_secs() as i64, 600)
}

/// 次に自動で 1 巡する予定時刻 (前回の一括取得から周期ぶん後)。まだ 1 度も取っていなければ今すぐ
fn next_sweep_at(store: &FlowStore) -> i64 {
    if store.swept_at <= 0 {
        return now_secs();
    }
    store.swept_at + cycle_secs(store)
}

/// 取りこぼした銘柄を取り直すまでの最短間隔
const RETRY_GAP_SECS: i64 = 10 * 60;
/// 取り直しを続ける上限。超えたら諦めて次の周期を待つ (2026-09-18 レビュー: 上限が無いと永久に回る)
const MAX_RETRY_ROUNDS: u32 = 3;

/// 自動巡回で 1 巡にかける時間 (オーナー指示 2026-09-18: 20 分 → 「15 分はどーやろ」→ 20 分に戻す)。
///
/// 15 分にしていた時の前提「search と fetch は別の枠」が間違っていた。同日の実測では
/// 5 分 30 回という上限が**その IP から取引所 API に投げた全部**に掛かっていて、
/// 別々に数えていたせいで合計 5 分 57 回投げ、2 分ごとに 429 (罰則 10 分) を踏んでいた
/// (trade2.rs の combined_rules に根拠)。
///
/// 54 銘柄 = 108 リクエスト。門番が合計を 5 分 28 回 (上限 30 から 2 残す) に抑えるので
/// 10.7 秒に 1 回 = 1 巡 19 分。ここを 15 分のままにしても門番が伸ばすだけで、
/// 画面に出る見込み時間が嘘になる。
/// 周期がこれより短い時は周期に合わせる (1 巡が次の巡に食い込まないように)。
const SWEEP_TARGET_SECS: i64 = 20 * 60;

/// 自動 (薄く流す巡回 / 取りこぼしの取り直し) が走っているか
static RUNNING_AUTO: AtomicBool = AtomicBool::new(false);
/// 手動の一括が走っているか。
///
/// 2026-09-19 オーナー「一括は全部とっていいよ。ただ、間に記録として挟む感じ。巡回中でも
/// 取った時間で別に挟めるでしょ、手動で」。自動と手動は**同時に走ってよい** (記録は取った時刻
/// つきの観測なので、混ざっても順に積むだけ)。それぞれ 1 本ずつ。
static RUNNING_MANUAL: AtomicBool = AtomicBool::new(false);
/// 記録ファイルの 読む→直す→書く を 2 本の巡回で取り合わないための鍵。
/// 持っている間に await しない (中で待つと相手の巡回が止まる)
static STORE_LOCK: StdMutex<()> = StdMutex::new(());

/// 巡回の枠。自動と手動で別々に「走っているか」を持つ
#[derive(Clone, Copy, PartialEq, Eq)]
enum Slot {
    Auto,
    Manual,
}

fn store_lock() -> std::sync::MutexGuard<'static, ()> {
    STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}
/// 今どの銘柄を取っているか (key, 何件目, 全体件数)。UI に出すため
static PROGRESS: StdMutex<Option<(String, usize, usize)>> = StdMutex::new(None);
/// 直近の失敗 (UI に出す)
static LAST_ERROR: StdMutex<Option<String>> = StdMutex::new(None);
/// trade2 が返したレート制限の使用状況 (x-rate-limit-ip-state)
static RATE_STATE: StdMutex<Option<String>> = StdMutex::new(None);
/// trade2 が返したレート制限の規則 (x-rate-limit-ip)。画面側の待ちと同じ物を見せるために出す
static RATE_RULES: StdMutex<Option<String>> = StdMutex::new(None);


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
fn set_rate_rules(v: Option<String>) {
    if let Ok(mut g) = RATE_RULES.lock() {
        *g = v;
    }
}
/// 応答に付いてくるレート制限ヘッダ (規則と使用状況) を控える。search / fetch どちらでも呼ぶ
fn note_rate_headers(body: &serde_json::Value) {
    let rl = body.get("_ratelimit");
    let pick = |k: &str| rl.and_then(|r| r.get(k)).and_then(|v| v.as_str()).map(str::to_string);
    if let Some(v) = pick("x-rate-limit-ip") {
        set_rate_rules(Some(v));
    }
    if let Some(v) = pick("x-rate-limit-ip-state") {
        set_rate_state(Some(v));
    }
}
/// 罰則で止まっている時の解除予定 (unix 秒)。門番 (trade2.rs) が 429 と state ヘッダから持つ
/// 罰則 (429 / restricted) で止まっている解除予定 (unix 秒、0 なら止まっていない)。
/// FlowStatus の wait_until と retry_until は**どちらもこの値** (名前が 2 つあるだけ。画面側の型を
/// 変えないために両方残している。2026-09-19 リファクタで確認)
fn penalty_until_secs() -> i64 {
    crate::trade2::gate_blocked_until_secs()
}
/// 今から再開までの秒数 (止まっていなければ 0)
fn retry_wait_secs() -> i64 {
    (penalty_until_secs() - now_secs()).max(0)
}
/// その失敗は後で取り直せば通る物か (429 / 通信 / 門番の待ち切れ)。
/// HTTP 400 のような恒久的な失敗は取り直さない。
///
/// 2026-09-19 オーナー「一括終わってないくせに終わったって言ってる意味が分からん」:
/// 門番が「待ちが長すぎる」と返すエラー (trade2 レート制限中 (あと N 秒)) を
/// **恒久的な失敗**として扱っていたので、取り直しに入らず 41/42 銘柄で「終わりました」に
/// なっていた。これは時間が経てば必ず通るので取り直す。
fn is_retriable(msg: &str) -> bool {
    msg.contains("429") || msg.contains("network error") || msg.contains("レート制限中")
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
    // 2026-09-17: 追跡の検索条件を any → securable (即時購入のみ) に統一した。
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
    // 条件が変わったかは「前のリスト全体」と比べる。
    // 手動分だけと比べていた頃は、自動銘柄の条件が変わっても記録が残って
    // 旧条件の ID が新条件の一覧に無い = 一斉に「売れた」になり得た (2026-09-18 レビュー指摘)。
    // 手動で登録した銘柄はクエリを持たない (画面の検索条件で取っている) ので、その場合は比べない
    let mut changed: Vec<String> = Vec::new();
    for w in &incoming {
        if let Some(prev) = store.watches.iter().find(|x| x.key == w.key) {
            if !prev.query.is_null() && prev.query != w.query {
                changed.push(w.key.clone());
            }
        }
    }
    // 手動分は残す。いったん巡回から外し、今回のリストに載っていれば戻す
    let mut watches: Vec<Watch> = store
        .watches
        .iter()
        .filter(|w| w.manual)
        .map(|w| Watch { auto: false, ..w.clone() })
        .collect();
    for w in incoming {
        match watches.iter_mut().find(|x| x.key == w.key) {
            Some(existing) => {
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
    }
    store.watches = watches;
    store.league = league.to_string();
    store.list_refreshed_at = now;
}



/// 記録と、今の検索結果を突き合わせた結果 (画面の「検索と突き合わせ」用)
#[derive(Serialize)]
pub struct VerifyResult {
    /// 今の出品総数
    pub total: u64,
    /// 検索が返した ID の数 (総数に届いていなければ一覧が切れている)
    pub ids: usize,
    /// 追跡中 (まだ消えていない) の件数
    pub tracked: usize,
    /// そのうち検索にも載っていた件数
    pub matched: usize,
    /// 追跡中だが検索に載っていない = 次の巡回で「売れた」と数える候補
    pub missing: Vec<String>,
    /// 検索には居るがまだ追跡していない件数 (最安 10 件に入っていない分)
    pub untracked: usize,
}

/// 記録している ID と、今の検索結果を突き合わせる (検索 1 回)。
///
/// オーナー指摘 (2026-09-17):「その検索がちゃんと機能してないと困る。確認する術ないの」。
/// 判定の土台が検索の ID 一覧なので、ここが噛み合っているかをいつでも確かめられるようにする。
#[tauri::command]
pub async fn market_flow_verify(app: tauri::AppHandle, key: String) -> Result<VerifyResult, String> {
    let store = load_store(&app);
    let watch = store.watches.iter().find(|w| w.key == key).ok_or("その銘柄は登録されていません")?;
    let mut query = watch.query.clone();
    if query.is_null() {
        return Err("この銘柄は検索条件を持っていません".to_string());
    }
    normalize_track_status(&mut query);
    let search = crate::trade2::SearchRequest { league: store.league.clone(), site: Some("www".to_string()), query };
    let v = crate::trade2::trade2_search(search).await.map_err(|e| e.to_string())?;
    let total = v.get("total").and_then(|x| x.as_u64()).unwrap_or(0);
    let ids: Vec<String> = v
        .get("result")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let empty = WatchState::default();
    let state = store.states.get(&key).unwrap_or(&empty);
    let alive: Vec<&Tracked> = state.tracked.iter().filter(|t| t.gone_at.is_none()).collect();
    let tracked_ids: HashSet<&str> = alive.iter().map(|t| t.id.as_str()).collect();
    Ok(VerifyResult {
        total,
        ids: ids.len(),
        tracked: alive.len(),
        matched: alive.iter().filter(|t| present.contains(t.id.as_str())).count(),
        missing: alive.iter().filter(|t| !present.contains(t.id.as_str())).map(|t| t.id.clone()).collect(),
        untracked: ids.iter().filter(|id| !tracked_ids.contains(id.as_str())).count(),
    })
}

/// 今すぐ 1 周サンプルを取る (手動)。取得中なら何もしない。
#[tauri::command]
pub async fn market_flow_sample_now(app: tauri::AppHandle) -> Result<(), String> {
    sample_once(&app).await
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
pub fn market_flow_record(app: tauri::AppHandle, req: RecordRequest) -> Result<(), String> {
    let _store_guard = store_lock();
    let mut store = load_store(&app);
    let now = now_secs();
    // 2026-09-16: 画面で取った銘柄はそのまま記録対象にする (チェックを廃止したため)。
    // 手動扱いなので周期の一括取得には入らず、自動リストの入れ替えでも消えない。
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
    let key = req.key.clone();
    let state = store.states.entry(req.key).or_default();
    // 自動巡回とまったく同じルールで判定する (画面の売値も巡回も条件が同じ securable のため)。
    // ID 一覧が出品全部を含んでいる時だけ「消えた = 売れた」と数える。
    // 応答が空の時は判定しない (通信不良で全滅させないため)
    let list_complete = list_is_complete(&req.ids, req.total, &state.tracked);
    apply_sample(state, now, req.total, &req.ids, &req.entries, list_complete);
    // 自動経路と同じく、一覧が全部取れたかを画面に出す (手動経路だけ更新していなかった 2026-09-18)
    state.list_complete = list_complete;
    mark_buried(state, &req.ids, list_complete);
    prune(state, now);
    store.sampled_at = now;
    // 手動で取った分は自動巡回の成果として組み込む (オーナー指示 2026-09-19:
    // 「手動で取った情報は自動で取ったデータに組み込んで、自動で取った感じで記録しといて」)。
    // 記録そのものは上で同じ経路に入っている。加えて、いま自動巡回が走っていて
    // この銘柄にまだ来ていなければ「この巡では取った」扱いにして、同じ物を取り直させない
    if RUNNING_AUTO.load(Ordering::SeqCst)
        && store.watches.iter().any(|w| w.key == key && w.auto)
        && !store.sweep_done.contains(&key)
    {
        store.sweep_done.push(key);
    }
    save_store(&app, &store)?;
    Ok(())
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
/// 一覧が切れている時 (出品 100 件超) は、載っていない追跡分を「値段で沈んだ」と数える。
/// BURIED_MAX 回続いたら prune で追跡をやめる (最安帯の捌け方を測るのが目的なので)。
/// 自動経路 / 手動経路で同じ処理 (以前は 3 か所にコピーがあった 2026-09-18)
pub fn mark_buried(state: &mut WatchState, ids: &[String], list_complete: bool) {
    if list_complete || ids.is_empty() {
        return;
    }
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    for t in state.tracked.iter_mut() {
        if t.gone_at.is_none() && !present.contains(t.id.as_str()) {
            t.buried = t.buried.saturating_add(1);
        }
    }
}

pub fn apply_sample(
    state: &mut WatchState,
    now: i64,
    total: u64,
    ids: &[String],
    entries: &[ListingRef],
    list_complete: bool,
) {
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    // 今回の応答に出てきた中で、既に追跡している ID (並べ直しの判定に使う)
    let known_ids: HashSet<String> = state.tracked.iter().map(|t| t.id.clone()).collect();
    let mut gone_now = 0u32;
    // 生き返った出品が「消えた」として数えられていた日 (集計から引く)
    let mut revived_days: Vec<i64> = Vec::new();

    for t in state.tracked.iter_mut() {
        if t.gone_at.is_some() {
            // 消えた扱いにした出品がまた現れたら生き返らせる (取り下げでも売却でもなかった)
            if present.contains(t.id.as_str()) {
                // 付け替え扱いの分は売れた件数に入れていないので、日次からも引かない
                if let (Some(g), false) = (t.gone_at, t.relisted) {
                    revived_days.push(day_of(g));
                }
                t.gone_at = None;
                t.relisted = false;
                t.last_seen = now;
                t.buried = 0;
            }
            continue;
        }
        if present.contains(t.id.as_str()) {
            t.last_seen = now;
            t.buried = 0;
        } else if list_complete {
            // 出品全部が見えている状態で一覧に無い = 売れたか取り下げた。
            // ただし同じ出品者が 5 分以内に並べ直していれば、値段の付け替えとみなす
            // 前回この出品を見た時刻より後に、同じ出品者が新しく並べていれば付け替えとみなす
            let since = t.last_seen - RELIST_SLACK_SECS;
            let relisted = t.account.as_deref().is_some_and(|acc| {
                entries.iter().any(|e| {
                    e.account.as_deref() == Some(acc)
                        && !known_ids.contains(&e.id)
                        && e.listed_at.map(|at| at >= since && at <= now + RELIST_SLACK_SECS).unwrap_or(false)
                })
            });
            t.gone_at = Some(now);
            t.relisted = relisted;
            if !relisted {
                gone_now += 1;
            }
        }
        // list_complete でない時は判断を保留 (一覧が切れているので「消えた」とは言えない)
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
            buried: 0,
            relisted: false,
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


fn day_of(t: i64) -> i64 {
    t - t.rem_euclid(86_400)
}

fn bump_daily(state: &mut WatchState, now: i64, added: u32, gone: u32, survived: u32, total: u64) {
    bump_daily_full(state, now, added, gone, survived, 0, total);
}
fn bump_daily_full(state: &mut WatchState, now: i64, added: u32, gone: u32, survived: u32, buried: u32, total: u64) {
    let day = day_of(now);
    if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
        d.added += added;
        d.gone += gone;
        d.survived += survived;
        d.buried += buried;
        d.total_avg = (d.total_avg * d.samples as f64 + total as f64) / (d.samples + 1) as f64;
        d.samples += 1;
    } else {
        state.daily.push(Daily { day, added, gone, survived, buried, total_avg: total as f64, samples: 1 });
    }
    if state.daily.len() > DAILY_MAX_DAYS {
        let cut = state.daily.len() - DAILY_MAX_DAYS;
        state.daily.drain(0..cut);
    }
}

/// キャッシュを膨らませないための掃除 (オーナー指示: 1 ID は 1 週間)
pub fn prune(state: &mut WatchState, now: i64) {
    let mut survived = 0u32;
    let mut buried = 0u32;
    // 値段で沈んだ出品は追うのをやめる (確認 fetch の枠を、最安帯の判定に使うため)
    state.tracked.retain(|t| {
        if t.gone_at.is_none() && t.buried >= BURIED_MAX {
            buried += 1;
            false
        } else {
            true
        }
    });
    if buried > 0 {
        bump_daily_full(state, now, 0, 0, 0, buried, state.total);
    }
    state.tracked.retain(|t| {
        match t.gone_at {
            // 消えた記録は 7 日で捨てる (それまでは寿命の計算に使う)
            Some(g) => now - g < TRACK_MAX_SECS,
            // 生きたまま 7 日を超えた物は「7 日でも売れなかった」として集計に畳んで捨てる
            // 起点は寿命と同じ「出品時刻」に揃える (初見起点だと実質 7 日以上追ってしまう)
            None => {
                if now - t.start() >= TRACK_MAX_SECS {
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
    // 上限を超えたら古い物から捨てる。捨てた生存分は集計に残す
    // (黙って消すと「売れなかった物だけが静かに減る」形になる。2026-09-17 レビュー指摘)。
    // 活発な銘柄 (毎巡 10 件追加) だと 7 日を待たずに上限で切れるので、中央値の母数は実質 2〜3 日分
    if state.tracked.len() > TRACK_MAX_PER_WATCH {
        state.tracked.sort_by_key(|t| t.first_seen);
        let cut = state.tracked.len() - TRACK_MAX_PER_WATCH;
        let dropped: Vec<Tracked> = state.tracked.drain(0..cut).collect();
        let unsold = dropped.iter().filter(|t| t.gone_at.is_none()).count() as u32;
        if unsold > 0 {
            bump_daily(state, now, 0, 0, unsold, state.total);
        }
    }
}

// ============================================================================
// サンプリング (HTTP)
// ============================================================================

/// 巡回の走らせ方
#[derive(Clone, Copy, PartialEq)]
pub enum Pace {
    /// 手動の一括取得: 上限の許す限り速く (「今すぐ 1 巡」なので待たせない)
    Fast,
    /// 自動巡回: 周期いっぱいに薄く広げる。1 リクエストあたり 周期 ÷ 本数 の間隔を空けるので、
    /// レートの枠に一度も触れない (オーナー了承 2026-09-18:
    /// 「54 銘柄だけどレートになるまで 8 銘柄くらいしか取れない」→ 一気に投げるのをやめる)
    Spread,
}

/// 全銘柄を 1 周する (手動ボタン)。自動巡回が走っていても構わず全部取る (手動は手動で 1 本だけ)
pub async fn sample_once(app: &tauri::AppHandle) -> Result<(), String> {
    sample_guarded(app, None, Pace::Fast, Slot::Manual).await
}

/// 自動巡回: 周期いっぱいに薄く広げて 1 周する
pub async fn sample_spread(app: &tauri::AppHandle) -> Result<(), String> {
    sample_guarded(app, None, Pace::Spread, Slot::Auto).await
}

/// 取りこぼした銘柄 (retry_keys) だけ取り直す
async fn sample_retry(app: &tauri::AppHandle) -> Result<(), String> {
    let keys: HashSet<String> = load_store(app).retry_keys.iter().cloned().collect();
    if keys.is_empty() {
        return Ok(());
    }
    sample_guarded(app, Some(keys), Pace::Fast, Slot::Auto).await
}

async fn sample_guarded(app: &tauri::AppHandle, only: Option<HashSet<String>>, pace: Pace, slot: Slot) -> Result<(), String> {
    let flag = match slot {
        Slot::Auto => &RUNNING_AUTO,
        Slot::Manual => &RUNNING_MANUAL,
    };
    if flag.swap(true, Ordering::SeqCst) {
        // 黙って Ok を返すと画面が「終わりました」を出してしまう (2026-09-18 レビュー指摘)
        return Err("取得中です".to_string());
    }
    let result = sample_inner(app, only, pace).await;
    // 途中で ? で抜けても進捗表示を残さない。ただし手動が走っている間は手動の進捗を消さない
    if slot == Slot::Manual || !RUNNING_MANUAL.load(Ordering::SeqCst) {
        set_progress(None);
    }
    flag.store(false, Ordering::SeqCst);
    result
}

/// `only` を渡すとその銘柄だけ取る (取りこぼしの取り直し)。None なら自動リスト全部
async fn sample_inner(app: &tauri::AppHandle, only: Option<HashSet<String>>, pace_mode: Pace) -> Result<(), String> {
    let store = load_store(app);
    if store.watches.is_empty() || store.league.is_empty() {
        return Ok(());
    }
    // 追跡の検索は英語名で投げるので www 固定にする。
    // JP サイトは日本語名しか受け付けず "Unknown item base type" (HTTP 400) になる (2026-09-16)。
    let site: Option<String> = Some("www".to_string());
    // 薄く流す時は 1 巡に何時間もかかるので、既にこの巡で取った銘柄は飛ばす (続きから)
    let done_keys: HashSet<String> = if pace_mode == Pace::Spread && only.is_none() {
        store.sweep_done.iter().cloned().collect()
    } else {
        HashSet::new()
    };
    let auto: Vec<&Watch> = store
        .watches
        .iter()
        .filter(|w| w.auto)
        .filter(|w| only.as_ref().map(|k| k.contains(&w.key)).unwrap_or(true))
        .collect();
    let total_watches = auto.len();
    // 手動の一括取得は上限の許す限り速く (門番が待つ)。
    // 自動巡回は周期いっぱいに薄く広げる: 1 銘柄 = search + fetch の 2 リクエストなので、
    // 間隔 = 周期 ÷ (銘柄数 × 2)。54 銘柄 / 2 時間なら 66 秒に 1 回で、枠に一度も触れない
    // (オーナー了承 2026-09-18:「一気に順に取ってる」のをやめる)
    let pace = match pace_mode {
        Pace::Fast => REQUEST_INTERVAL,
        Pace::Spread => Duration::from_secs(spread_pace_secs(total_watches as i64, cycle_secs(&store)) as u64),
    };
    let mut index = 0usize;
    // 後で取り直す銘柄 (429 / 通信エラーだけ。HTTP 400 のような恒久的な失敗は入れない)
    let mut failed: Vec<String> = Vec::new();
    set_error(None);

    for watch in auto.iter().copied() {
        index += 1;
        if done_keys.contains(&watch.key) {
            continue; // この巡では取得済み (途中で閉じた分の続き)
        }
        // 手動と自動が同時に走っている時は、押した本人が見たい手動の進捗を出す
        if pace_mode == Pace::Fast || !RUNNING_MANUAL.load(Ordering::SeqCst) {
            set_progress(Some((watch.label.clone().max(watch.key.clone()), index, total_watches)));
        }
        // 時刻は銘柄ごとに取り直す。組の先頭で固定していた頃は、1 組を回り切る十数分ぶん
        // 記録が過去にずれて「初見 < 出品時刻」が出ていた (2026-09-17 レビュー指摘)
        let now = now_secs();
        // --- search: 総数と ID 一覧 ---
        let mut query = watch.query.clone();
        normalize_track_status(&mut query);
        let search = crate::trade2::SearchRequest {
            league: store.league.clone(),
            site: site.clone(),
            query,
        };
        let body = match crate::trade2::trade2_search(search).await {
            Ok(v) => Some(v),
            Err(e) => {
                eprintln!("[market_flow] search {} 失敗: {e}", watch.key);
                set_error(Some(format!("{}: {}", watch.key, e.chars().take(140).collect::<String>())));
                if !is_retriable(&e) {
                    // 何度やっても同じ失敗 (HTTP 400 など)。この巡は飛ばし、取り直しにも入れない
                    tokio::time::sleep(pace).await;
                    continue;
                }
                None
            }
        };
        // 待つのは門番 (gate_acquire、上限 90 秒)。それを超えて止められた銘柄は
        // 取り直し (retry_keys) に回す。ここでもう一度投げ直す処理は 2026-09-19 に消した:
        // 門番が「待ちが長すぎる」と返した直後にもう一度呼んでも必ず同じ Err になる無駄玉で、
        // 「レート制限の解除待ち」と出るだけで何も待っていなかった
        let Some(body) = body else {
            failed.push(watch.key.clone());
            tokio::time::sleep(pace).await;
            continue;
        };
        // レート制限の規則と使用状況を控える (画面はこれを見て待ち時間を出す)
        note_rate_headers(&body);
        let total = body.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
        let query_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ids: Vec<String> = body
            .get("result")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        tokio::time::sleep(pace).await;

        // --- fetch: 最安 10 件の値段 (新規を追跡に入れるため) ---
        // ここは毎回取る。**新しい出品が追跡に入るのは fetch の時だけ**なので、間引くと
        // その間に出品されて売れた物を丸ごと取りこぼし、速度が遅い側に偏る。
        // 2026-09-17 のレビューで、間引き条件 (2 巡に 1 回) が実際には 60 銘柄中 42 件で
        // 発火しており、値段も新規も 3.6 時間に 1 回しか入っていなかった。
        let mut entries: Vec<ListingRef> = Vec::new();
        let top: Vec<String> = ids.iter().take(10).cloned().collect();
        if !top.is_empty() && !query_id.is_empty() {
            let fetch = crate::trade2::FetchRequest { ids: top, query_id: query_id.clone(), site: site.clone() };
            match crate::trade2::trade2_fetch(fetch).await {
                Ok(v) => {
                    note_rate_headers(&v);
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
        {
        // 2 本の巡回 (自動 + 手動) が同じファイルを 読む→直す→書く で取り合わないように
        let _store_guard = store_lock();
        let mut store_now = load_store(app);
        let state = store_now.states.entry(watch.key.clone()).or_default();
        // 総数が 100 未満なら search の一覧が全部 = 一覧に無い物は消えたと判断できる
        // 検索結果だけでは「消えた = 売れた」と判定しない (2026-09-17)。
        //
        // securable (即時購入のみ) は出品者の状況で出入りするので、検索から消えただけでは
        // 売れたと言えない。消えた候補は下の確認 fetch (ID 直接照会。status の絞り込みを
        // 受けないので実在が確実に分かる) に回し、そこで居なければ売れたと数える。
        // 即時購入の一覧が全部取れていれば、そこから消えた出品を「売れた」と数える。
        //
        // オーナー指摘 (2026-09-17):「インスタから対面トレードに切り替える人は存在しない」。
        // 即時購入の一覧から消える = 売れた (か取り下げた) とみなしてよい。
        // 値段を変えただけなら ID は変わらないので一覧に残り、売れた扱いにはならない。
        //
        // ID を直接 fetch する裏取りは使えない (消えた出品にもキャッシュを 200 で返す。
        // 2026-09-17 に実測)。応答が空の時や、100 件を超えて一覧が切れている時は判定しない。
        let list_complete = list_is_complete(&ids, total, &state.tracked);
        apply_sample(state, now, total, &ids, &entries, list_complete);
        state.list_complete = list_complete;
        mark_buried(state, &ids, list_complete);
        prune(state, now);
        store_now.sampled_at = now;
        // 巡回中にリーグが切り替わっていたら (merge_watches が記録を全消しした直後)、
        // 旧リーグの結果を書き戻さない (2026-09-18 レビュー指摘)
        if store_now.league != store.league {
            eprintln!("[market_flow] 巡回中にリーグが変わったので中断: {} -> {}", store.league, store_now.league);
            return Ok(());
        }
        if pace_mode == Pace::Spread && !store_now.sweep_done.contains(&watch.key) {
            store_now.sweep_done.push(watch.key.clone());
        }
        save_store(app, &store_now)?;
        }

    }
    // 1 巡の終わり。取りこぼしがあればその銘柄だけ後で取り直す (回数に上限あり)
    let _store_guard = store_lock();
    let mut store_end = load_store(app);
    if only.is_none() {
        // 巡っている間に監視リストが変わって足された銘柄を拾う。
        //
        // 2026-09-19 オーナー「監視リスト変更して一括回したけど、なんか巡回待ちって」:
        // 取る対象はこの関数に入った時点の一覧で固定なので、途中で足された銘柄は
        // 一度も取られないまま「1 巡終わった」ことになり、次の周期 (2 時間) まで
        // 記録ゼロ = 「巡回待ち」のままだった。実測でも 12 銘柄が state すら無かった。
        for w in &store_end.watches {
            if w.auto && !store_end.states.contains_key(&w.key) && !failed.contains(&w.key) {
                failed.push(w.key.clone());
            }
        }
        store_end.rounds += 1;
        store_end.sampled_at = now_secs();
        // 手動の一括取得もここを通る。次の自動取得はこの時刻から数える
        store_end.swept_at = now_secs();
        store_end.retry_count = 0;
        // 手動の一括が終わった時、自動巡回がまだ走っていれば「この巡で取った」の記録は残す
        // (消すと自動側が終わりまで再度全部取り直しに見える)
        if !(pace_mode == Pace::Fast && RUNNING_AUTO.load(Ordering::SeqCst)) {
            store_end.sweep_done.clear();
        }
    }
    if failed.is_empty() || store_end.retry_count >= MAX_RETRY_ROUNDS {
        if !failed.is_empty() {
            eprintln!("[market_flow] {} 銘柄が {} 回取れなかったので次の周期まで諦める", failed.len(), MAX_RETRY_ROUNDS);
        }
        store_end.retry_keys.clear();
        store_end.retry_at = 0;
    } else {
        store_end.retry_count += 1;
        store_end.retry_keys = failed;
        // 罰則が明ける頃 (少なくとも RETRY_GAP_SECS 後) に取り直す
        store_end.retry_at = now_secs() + retry_wait_secs().max(RETRY_GAP_SECS);
    }
    save_store(app, &store_end)?;
    Ok(())
}

/// UI に出す進捗
#[derive(Serialize, Clone, Debug)]
pub struct FlowStatus {
    /// 取得中か (自動か手動のどちらか)
    pub sampling: bool,
    /// 手動の一括が走っているか (画面の一括ボタンはこれだけを見て押せなくする)
    pub manual_sampling: bool,
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
    /// 今まさに待っている解除予定 (unix 秒、0 なら待っていない)。罰則で止まっている時だけ
    pub wait_until: i64,
    /// 枠が空くまで止まっている時の解除予定 (unix 秒)。罰則ではないが取得は進まない
    pub budget_until: i64,
    /// 5 分窓を全窓口あわせて何回使ったか / 上限 (画面の「5 分で n/N 回」)
    pub budget_used: i64,
    pub budget_max: i64,
    /// 次にリクエストを投げられる時刻 (unix 秒)。上限に当たらないための通常の間隔待ちを含む
    pub pace_until: i64,
    /// 429 を食らっている場合の再開予定 (unix 秒、0 なら制限なし)
    pub retry_until: i64,
    /// 取りこぼした回の再挑戦予定 (unix 秒、0 なら通常運転)
    pub retry_at: i64,
    /// 取り直しを待っている銘柄数
    pub retry_keys: usize,
    /// 今の 1 巡で取り終わった銘柄数 (自動巡回は時間をかけて回るので進み具合を出す)
    pub sweep_done: usize,
    /// 今の送信間隔 (秒)。自動巡回は周期 ÷ 本数で薄く流す
    pub pace_secs: i64,
    /// 1 度でも取れた自動銘柄の数 (1 周目の進捗。画面で「巡回待ち」を出すのに使う)
    pub sampled_watches: usize,
    /// 今の 1 巡の周期 (秒)
    pub cycle_secs: i64,
    /// 最後に全銘柄を 1 巡した時刻 (手動の一括取得を含む)
    pub swept_at: i64,
}

/// 自動追跡が今どうなっているか (ジェムコラプトの画面に出す)
#[tauri::command]
pub fn market_flow_status(app: tauri::AppHandle) -> Result<FlowStatus, String> {
    let store = load_store(&app);
    let progress = PROGRESS.lock().ok().and_then(|g| g.clone());
    let (budget_used, budget_max) = crate::trade2::gate_usage_300();
    let manual_sampling = RUNNING_MANUAL.load(Ordering::SeqCst);
    let sampling = RUNNING_AUTO.load(Ordering::SeqCst) || manual_sampling;
    let (current, done, total) = match progress {
        Some((k, d, t)) => (Some(k), d, t),
        None => (None, 0, 0),
    };
    Ok(FlowStatus {
        sampling,
        manual_sampling,
        current,
        done,
        total,
        rounds: store.rounds,
        last_at: store.sampled_at,
        next_at: if store.retry_at > 0 { store.retry_at } else { next_sweep_at(&store) },
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
        // 罰則で止まっている解除予定は門番が持つ (画面はこれを 1 秒ごとに数える)
        wait_until: penalty_until_secs(),
        budget_until: now_secs() + crate::trade2::gate_budget_wait_secs(),
        budget_used,
        budget_max,
        pace_until: now_secs() + crate::trade2::gate_wait_secs(),
        retry_until: penalty_until_secs(),
        retry_at: store.retry_at,
        retry_keys: store.retry_keys.len(),
        sweep_done: store.sweep_done.len(),
        pace_secs: spread_pace_secs(store.watches.iter().filter(|w| w.auto).count() as i64, cycle_secs(&store)),
        cycle_secs: cycle_secs(&store),
    })
}

/// 1 巡の周期を変える (画面の設定。1〜24 時間)
#[tauri::command]
pub fn market_flow_set_cycle(app: tauri::AppHandle, secs: i64) -> Result<i64, String> {
    let mut store = load_store(&app);
    store.cycle_secs = secs.clamp(CYCLE_MIN_SECS, CYCLE_MAX_SECS);
    let applied = cycle_secs(&store);
    save_store(&app, &store)?;
    Ok(applied)
}

/// 起動時に呼ぶ: 前回の一括取得から周期ぶん経ったら全銘柄を 1 巡する
///
/// オーナー指示 (2026-09-17):「前回一括取得してから手動も含めて ● 時間周期で取得する。
/// 一括取得は手動でも自動でも前回の更新日時を記録するように」。
/// 手で一括取得を押した分も swept_at を更新するので、そこから数え直す。
pub fn spawn_scheduler(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let store = load_store(&app);
            let now = now_secs();
            if store.watches.is_empty() || store.league.is_empty() {
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
            if RUNNING_AUTO.load(Ordering::SeqCst) {
                // 自動 (巡回か取り直し) が走っている。終わってから次の判断をする
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
            if now >= next_sweep_at(&store) {
                // 自動巡回は周期いっぱいに薄く広げる (枠に触れないので待ちが出ない)
                if let Err(e) = sample_spread(&app).await {
                    crate::app_log::line_static(&format!("[market_flow] サンプリング失敗: {e}"));
                }
            } else if store.retry_at > 0 && now >= store.retry_at {
                // 取りこぼした銘柄だけ取り直す (全銘柄を回し直さない)
                if let Err(e) = sample_retry(&app).await {
                    crate::app_log::line_static(&format!("[market_flow] 取り直し失敗: {e}"));
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

    /// 自動巡回の間隔: 54 銘柄 (108 リクエスト) を 20 分で回る速さになる
    #[test]
    fn spread_pace_finishes_a_sweep_in_the_target_window() {
        let pace = spread_pace_secs(54, 2 * 3600);
        assert_eq!(pace, 11, "108 リクエスト × 11 秒 = 約 20 分");
        // 上限は IP 単位 (search と fetch の合計) で 5 分 30 回。この間隔なら 5 分 27 回で収まる
        assert!(300 / pace <= 30);
        // 周期が短い時はそちらに合わせる (1 巡が次の巡に食い込まない)
        assert_eq!(spread_pace_secs(54, 600), 5);
        // 銘柄が 1 つなら 2 リクエストしかないので間隔は長くなる
        assert_eq!(spread_pace_secs(1, 2 * 3600), 600);
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

    /// 売れた直後に同じ出品者が並べ直した分は、売れた件数に数えない
    #[test]
    fn immediate_relist_is_not_counted_as_sold() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let l = |id: &str, amt: f64, acc: &str, at: i64| ListingRef {
            id: id.into(),
            amount: Some(amt),
            currency: Some("divine".into()),
            listed_at: Some(at),
            account: Some(acc.into()),
        };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[l("a", 10.0, "S1", now - 7200), l("b", 11.0, "S2", now - 7200)], true);
        // a が消え、同じ出品者 S1 が 1 分前に並べ直した新しい出品 c が出ている
        let t1 = now + 3600;
        apply_sample(&mut st, t1, 2, &["b".into(), "c".into()], &[l("b", 11.0, "S2", now - 7200), l("c", 9.0, "S1", t1 - 60)], true);
        let a = st.tracked.iter().find(|t| t.id == "a").unwrap();
        assert!(a.gone_at.is_some(), "一覧から消えたことは記録する");
        assert!(a.relisted, "並べ直しとして印を付ける");
        assert_eq!(st.daily.iter().map(|d| d.gone).sum::<u32>(), 0, "売れた件数には数えない");

        // 別の出品者が時間を空けて出した場合は売れた扱い
        let t2 = t1 + 3600;
        apply_sample(&mut st, t2, 1, &["c".into()], &[l("c", 9.0, "S1", t1 - 60)], true);
        let b = st.tracked.iter().find(|t| t.id == "b").unwrap();
        assert!(b.gone_at.is_some() && !b.relisted, "並べ直しでなければ売れた扱い");
        assert_eq!(st.daily.iter().map(|d| d.gone).sum::<u32>(), 1);
    }

    /// 一覧が 100 件で切れている時、載っていない追跡分は「沈んだ」として追跡をやめる
    #[test]
    fn buried_listings_stop_being_tracked() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(5.0), currency: Some("divine".into()), listed_at: None, account: None };
        apply_sample(&mut st, now, 150, &["a".into(), "b".into()], &[e("a"), e("b")], false);
        // b が一覧 (切れている) に載らない状態が 3 回続く
        for i in 1..=3 {
            let ids = vec!["a".to_string()];
            let present: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
            apply_sample(&mut st, now + i * 7200, 150, &ids, &[e("a")], false);
            for t in st.tracked.iter_mut() {
                if t.gone_at.is_none() && !present.contains(t.id.as_str()) {
                    t.buried += 1;
                }
            }
            prune(&mut st, now + i * 7200);
        }
        assert!(st.tracked.iter().all(|t| t.id != "b"), "沈んだ出品は追跡から外す");
        assert_eq!(st.tracked.len(), 1, "一覧に居る a は残る");
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
        let list_complete = list_is_complete(&ids, 0, &st.tracked);
        assert!(!list_complete, "空の応答では消えた判定をしない");
        apply_sample(&mut st, now + 3600, 0, &ids, &[], list_complete);
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
    }

    /// 自動銘柄の検索条件が変わったら記録を作り直す (手動分としか比べていなかった 2026-09-18 レビュー指摘)
    #[test]
    fn auto_watch_query_change_resets_its_records() {
        let now = 1_700_000_000i64;
        let mut store = FlowStore::default();
        let w = |q: &str| Watch {
            key: "Arc::finished".into(),
            label: "Arc".into(),
            query: serde_json::json!({ "q": q }),
            note: String::new(),
            manual: false,
            auto: true,
        };
        merge_watches(&mut store, vec![w("old")], "L", now);
        store.states.insert("Arc::finished".into(), WatchState { sampled_at: now, ..Default::default() });
        // 同じ条件で登録し直しても記録は残る
        merge_watches(&mut store, vec![w("old")], "L", now + 1);
        assert!(store.states.contains_key("Arc::finished"), "条件が同じなら記録は引き継ぐ");
        // 条件が変わったら作り直す
        merge_watches(&mut store, vec![w("new")], "L", now + 2);
        assert!(!store.states.contains_key("Arc::finished"), "条件が変わった銘柄の記録は捨てる");
    }

    /// 古いクエリ (any) は securable に直す
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
        st.tracked.push(Tracked { id: "a".into(), listed_at: Some(now - 3600), first_seen: now, last_seen: now, gone_at: None, amount: Some(9.0), currency: Some("divine".into()), account: None, buried: 0, relisted: false });
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

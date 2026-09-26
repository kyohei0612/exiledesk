//! market_flow/types.rs — 記録の入れ物 (Watch / Tracked / Daily / WatchState / FlowStore) と定数
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。サブモジュールは private なので
//! pub にしてもクレートの外には出ない (親が pub use した分だけが見える)。
use super::*;

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
    /// 一覧が切れている (出品 100 件超) 巡で、安い順 100 件に載らなかった回数 (連続)。
    /// 値段で沈んだ出品がこうなる。一覧に戻れば 0 に戻る。BURIED_MAX 回続いたら追跡から外す
    /// (2026-09-17。直接照会は消えた出品にもキャッシュを返すので使っていない。2026-09-26 に説明を直した)
    #[serde(default)]
    pub buried: u32,
    /// 消えた時、同じ出品者がまだ同じ条件で並べていたか。
    /// 値段の付け替え (取り下げ → 再出品 / 何件か持っていて 1 件下げた) とみなして、売れた件数には数えない
    #[serde(default)]
    pub relisted: bool,
    /// 一覧から 1 回だけ消えている (確定待ち) 時の、最初に居なかった時刻 (2026-09-26 監査)。
    /// 次の判定できる巡でも居なければ gone_at = この時刻 で確定、戻ってくれば None に戻す
    #[serde(default)]
    pub missing_since: Option<i64>,
    /// 消えたが出品時刻か出品者が分からない (2026-09-26 監査)。
    /// 売れたとも付け替えとも言えないので、売れた件数・速さ・実売の値段には入れない
    #[serde(default)]
    pub unknown: bool,
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

pub fn default_true() -> bool {
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
pub const TRACK_STATUS: &str = "securable";

/// 保存済みのクエリを今のルール (TRACK_STATUS) に合わせる。直したら true。
///
/// 追跡の検索は登録時のクエリを使い回すので、条件を変えた時はここで上書きしないと
/// 古い条件のまま回り続ける (2026-09-17 に securable のまま / any のまま を両方踏んだ)。
pub fn normalize_track_status(query: &mut serde_json::Value) -> bool {
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
    /// 直前の 1 巡で取れなかった銘柄。取り直しを諦めた後も残す
    /// (2026-09-19 オーナー「制限中で止まったら完了出んの？」: 取り直しの上限に達すると
    ///  retry_keys が空になり、画面が「一括取得が終わりました」と言ってしまっていた)
    #[serde(default)]
    pub last_failed: Vec<String>,
    /// 取り直しを何回続けたか (MAX_RETRY_ROUNDS で諦めて次の周期へ)
    #[serde(default)]
    pub retry_count: u32,
    /// 最後に全銘柄を 1 巡した時刻 (手動の一括取得でも自動でも記録する)。
    /// 次の自動取得はここから cycle_secs 後 (オーナー指示 2026-09-17:
    /// 「前回一括取得してから手動も含めて ● 時間周期で取得する」)
    #[serde(default)]
    pub swept_at: i64,
    /// 1 巡にかける時間 (秒)。0 なら既定 (CYCLE_DEFAULT_SECS)、
    /// **負なら自動取得しない** (オーナー指示 2026-09-19:「自動取得の間隔だけど無効も追加しといて」
    /// =「自動取得させないって奴」)。手動の一括取得はいつでも押せる。
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
pub const TRACK_MAX_SECS: i64 = 7 * 24 * 3600;
/// 1 銘柄で追跡する上限件数
pub const TRACK_MAX_PER_WATCH: usize = 60;
/// 一覧が切れている巡で何回続けて安い順 100 件に載らなければ追跡をやめるか。
///
/// 沈んだ出品は売れたかどうかを判定できない (一覧に無くても生きているかもしれない)。
/// 最安帯の捌け方を測るのが目的なので、沈んだ物は追うのをやめて集計に畳む
/// (オーナー指摘 2026-09-17:「出品がめっちゃ増えると ID 検索がめっちゃ増えるけど平気？」)
pub const BURIED_MAX: u32 = 3;

/// 日次集計を残す日数
pub const DAILY_MAX_DAYS: usize = 30;
/// リクエストの最低間隔 (実際の間隔は trade2 の門番が上限から決める)
pub const REQUEST_INTERVAL: Duration = Duration::from_secs(1);
/// 1 巡の周期の既定 (8 時間)。画面から変えられる (FlowStore.cycle_secs)
pub const CYCLE_DEFAULT_SECS: i64 = 8 * 3600;
/// 変えられる範囲 (1 時間〜24 時間)
pub const CYCLE_MIN_SECS: i64 = 3600;
pub const CYCLE_MAX_SECS: i64 = 24 * 3600;


/// 自動取得をしない設定の印 (画面から -1 が来る)
pub const CYCLE_OFF: i64 = -1;


#[cfg(test)]
mod tests {
    use super::*;


    /// 古いクエリ (any) は securable に直す
    #[test]
    fn normalize_track_status_rewrites_old_queries() {
        let mut q = serde_json::json!({"query":{"status":{"option":"any"},"type":{"option":"Comet"}},"sort":{"price":"asc"}});
        assert!(normalize_track_status(&mut q), "直したら true");
        assert_eq!(q["query"]["status"]["option"], TRACK_STATUS);
        assert_eq!(q["query"]["type"]["option"], "Comet", "他の条件は触らない");
        assert!(!normalize_track_status(&mut q), "もう securable なら false");
    }
}

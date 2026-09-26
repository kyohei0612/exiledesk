//! market_flow/commands.rs — trade2 を叩くコマンド (verify / sample_now / record) と、見えていた出品 1 件 (ListingRef)
//!
//! market_flow.rs から分割 (2026-09-26)。
use super::*;

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
    let search = crate::trade2::SearchRequest { patient: true, league: store.league.clone(), site: Some("www".to_string()), query };
    let v = crate::trade2::trade2_search_with(crate::trade_history::session_value(&app), search)
        .await
        .map_err(|e| e.to_string())?;
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
    // 画面は最安 10 件の詳細しか取ってこない。出品者が 1 人も取れていない時と、消えた出品があって
    // 11 件目以降の出品者も見ないと付け替えか分からない時は、消えた判定をしない (次の巡回で確定させる。2026-09-26)
    let details_ok = fetch_details_ok(req.ids.len().min(10), &req.entries)
        && extra_detail_ids(state, &req.ids, list_complete).is_empty();
    let details: Option<&[ListingRef]> = if details_ok { Some(&[]) } else { None };
    apply_sample(state, now, req.total, &req.ids, &req.entries, list_complete, details);
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

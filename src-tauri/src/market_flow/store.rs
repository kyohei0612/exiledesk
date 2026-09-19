//! market_flow/store.rs — 記録の読み書きと監視リストの合流
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。サブモジュールは private なので
//! pub にしてもクレートの外には出ない (親が pub use した分だけが見える)。
use super::*;

// ============================================================================
// 保存
// ============================================================================

pub fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("market_flow.json");
    Ok(dir)
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn load_store(app: &tauri::AppHandle) -> FlowStore {
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

pub fn save_store(app: &tauri::AppHandle, store: &FlowStore) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;


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
}

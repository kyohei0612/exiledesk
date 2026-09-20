//! gem_break/store.rs — 取った結果の保存と読み直し
//!
//! 2026-09-19 に gem_break.rs (584 行) から切り出した。
use super::*;

/// 集計結果を app_data に残す場所 (画面の localStorage とは別に、同梱データにできる形で持つ)
pub fn result_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("gem_break_result.json"))
}

/// 集計結果を app_data に残す (通信経路とキャッシュ経路で共通)
pub fn save_result(app: &tauri::AppHandle, out: &GemBreakResult) {
    let Some(p) = result_path(app) else { return };
    match serde_json::to_string(out) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&p, json) {
                eprintln!("[gem_break] 集計結果を保存できません: {e}");
            }
        }
        Err(e) => eprintln!("[gem_break] 集計結果を JSON 化できません: {e}"),
    }
}

/// 最後に取れた集計結果 (無ければ null)。
///
/// 新しい PC では同梱データ (seed_data) がここに入るので、画面は poe.ninja を叩かずに
/// 監視ジェムを決められる (オーナー指示 2026-09-18「自動ジェム周りのデータだけ内蔵して」)。
/// そのアセンダンシーを **1 リクエストも投げずに** 出せるか。出せるなら結果を返す。
///
/// 2026-09-19 オーナー指示:「監視で個別アセを選んでも画面が変わらない。選んだ時、取得されて
/// なかったら取得を促して、取得済みなら変えてくれ」。画面はこれを呼んで、返れば表示を差し替え、
/// null なら「まだ取得していません」と出す。
#[tauri::command]
pub fn gem_break_cached(app: tauri::AppHandle, req: GemBreakRequest) -> Option<GemBreakResult> {
    let top_n = req.top_n.unwrap_or(100).clamp(5, 100);
    // 画面に出すだけなので古くても出す (取り直しは取得ボタンか 3 日周期の自動取得で)
    try_offline(None, &app, req.class.unwrap_or_default(), top_n, now_ts(), i64::MAX)
}

#[tauri::command]
pub fn gem_break_stored_result(app: tauri::AppHandle) -> Option<serde_json::Value> {
    let p = result_path(&app)?;
    let raw = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 選べるアセンダンシー (使用率降順)。UI のプルダウン用。
#[tauri::command]
pub async fn gem_break_ascendancies() -> Result<Vec<ninja::AscendancyMeta>, String> {
    let client = ninja::build_client()?;
    let gate = ninja::global_gate();
    let snap = ninja::fetch_index_state(&client, &gate, None).await?;
    ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await
}


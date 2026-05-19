//! クラフト発見君の累積データを app_data_dir に JSON で永続化。
//!
//! オーナー指示 (2026-05-19): 「JSON ファイルに自動保存」。
//! 取得サイクル完了ごとに上書き保存、アプリ起動時に自動復元。
//!
//! ファイルパス: `<app_data_dir>/discovery-<category>-<league>.json`
//! 例: `discovery-ring-Fate_of_the_Vaal.json`

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// app_data_dir/discovery-<category>-<league>.json の絶対パスを返す。
/// 同時に親ディレクトリも作成する。
fn storage_path(
    app: &tauri::AppHandle,
    category: &str,
    league: &str,
) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;

    // ファイル名に使えない文字を sanitize (英数 / _ / - のみ許可)
    let safe = |s: &str| -> String {
        s.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    };

    let file = format!("discovery-{}-{}.json", safe(category), safe(league));
    dir.push(file);
    Ok(dir)
}

/// snapshot ファイルの prev 版パス（取得前に現在 snapshot を退避する先）
fn prev_storage_path(
    app: &tauri::AppHandle,
    category: &str,
    league: &str,
) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;

    let safe = |s: &str| -> String {
        s.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    };

    let file = format!("discovery-prev-{}-{}.json", safe(category), safe(league));
    dir.push(file);
    Ok(dir)
}

/// 現データを保存。**既存ファイルがあれば prev-xxx.json に自動退避** してから上書きする。
/// Phase 2 売れ筋検出のための snapshot 履歴管理。
#[tauri::command]
pub async fn discovery_save(
    app: tauri::AppHandle,
    category: String,
    league: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    let path = storage_path(&app, &category, &league)?;
    let prev_path = prev_storage_path(&app, &category, &league)?;

    // 既存 snapshot を prev に退避（rename で原子的）。失敗してもサイレント続行
    // （初回保存時はファイル無し、これは正常）
    if path.exists() {
        // prev が既存ならいったん消す（rename の上書きは Windows で失敗する場合あり）
        if prev_path.exists() {
            let _ = fs::remove_file(&prev_path);
        }
        let _ = fs::rename(&path, &prev_path);
    }

    let text = serde_json::to_string(&payload).map_err(|e| format!("serialize: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("write {path:?}: {e}"))?;
    Ok(())
}

/// 前回 snapshot を読込（取得時の差分計算用）。ファイル無しは Ok(None)。
#[tauri::command]
pub async fn discovery_load_prev(
    app: tauri::AppHandle,
    category: String,
    league: String,
) -> Result<Option<serde_json::Value>, String> {
    let path = prev_storage_path(&app, &category, &league)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))?;
    Ok(Some(value))
}

/// 累積データを読込。ファイルが無ければ Ok(None)。
#[tauri::command]
pub async fn discovery_load(
    app: tauri::AppHandle,
    category: String,
    league: String,
) -> Result<Option<serde_json::Value>, String> {
    let path = storage_path(&app, &category, &league)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read {path:?}: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("parse: {e}"))?;
    Ok(Some(value))
}

/// 現データと prev 両方を削除（リセット用）。
#[tauri::command]
pub async fn discovery_clear(
    app: tauri::AppHandle,
    category: String,
    league: String,
) -> Result<(), String> {
    let path = storage_path(&app, &category, &league)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("remove {path:?}: {e}"))?;
    }
    let prev_path = prev_storage_path(&app, &category, &league)?;
    if prev_path.exists() {
        let _ = fs::remove_file(&prev_path);
    }
    Ok(())
}

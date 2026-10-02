//! build_planner.rs — ゲームのビルドプランナー (.build) への書き出し (2026-10-03 火力チェック)
//!
//! オーナー「相手のビルドのビルドプランナーもそのまま使えるようにしたい」。ゲームは
//! `Documents/My Games/Path of Exile 2/BuildPlanner/*.build` (JSON) を起動時に読んで一覧に出す。
//! JSON の中身は PoB の中 (src/services/pob-check/pck.lua の PCK.plan) で作り、ここはファイルに書くだけ。
//!   - ファイル名は安全な文字だけ (日本語は残す)、同じ名前があれば ` (2)` ` (3)` を付けて上書きしない
//!   - 書けない時は日本語の理由を返す (画面の上の帯に出る)
//!   - 開発ビルドだけ、環境変数 EXILEDESK_BUILD_PLANNER_DIR で書き出し先を変えられる (確かめの時にオーナーのフォルダに試しの
//!     ファイルを増やさないため)
use std::path::PathBuf;
use tauri::Manager;

/// ゲームが読むフォルダ。Documents は OS に聞く (OneDrive などで動かしている人がいる)
fn planner_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Ok(d) = std::env::var("EXILEDESK_BUILD_PLANNER_DIR") {
            if !d.trim().is_empty() {
                return Ok(PathBuf::from(d));
            }
        }
    }
    let docs = match app.path().document_dir() {
        Ok(p) => p,
        Err(_) => std::env::var("USERPROFILE")
            .map(|p| PathBuf::from(p).join("Documents"))
            .map_err(|_| "Documents フォルダが見つかりません".to_string())?,
    };
    Ok(docs.join("My Games").join("Path of Exile 2").join("BuildPlanner"))
}

/// ファイル名に使えない文字 (\ / : * ? " < > | と制御文字) を _ に。空なら ExileDesk。長すぎる物は切る
fn safe_file_name(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| if c.is_control() || matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '_' } else { c })
        .collect::<String>()
        .trim()
        .trim_end_matches(['.', ' '])
        .to_string();
    if s.chars().count() > 80 {
        s = s.chars().take(80).collect();
    }
    if s.is_empty() {
        s = "ExileDesk".into();
    }
    s
}

/// name = ファイル名 (拡張子なし)、json = .build の中身 (JSON の文字列)。返り値は書いたパス
#[tauri::command(async)]
pub fn build_planner_write(app: tauri::AppHandle, name: String, json: String) -> Result<String, String> {
    // 壊れた JSON を書くとゲームの一覧が崩れるので、ここで 1 回読めることを確かめる
    let v: serde_json::Value = serde_json::from_str(&json).map_err(|e| format!("ビルドプランナーの中身が JSON になっていません: {e}"))?;
    if !v.is_object() || v.get("passives").is_none() || v.get("skills").is_none() {
        return Err("ビルドプランナーの中身に passives / skills がありません".into());
    }
    let dir = planner_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("ビルドプランナーのフォルダを作れません ({}): {e}", dir.display()))?;
    let base = safe_file_name(&name);
    let mut path = dir.join(format!("{base}.build"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base} ({n}).build"));
        n += 1;
        if n > 999 {
            return Err("同じ名前のファイルが多すぎます".into());
        }
    }
    std::fs::write(&path, json.as_bytes()).map_err(|e| format!("ビルドプランナーに書けません ({}): {e}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_name_keeps_japanese_and_replaces_bad_chars() {
        assert_eq!(safe_file_name("Stormweaver Lv97 (ExileDesk)"), "Stormweaver Lv97 (ExileDesk)");
        assert_eq!(safe_file_name("a/b:c*d?e\"f<g>h|i"), "a_b_c_d_e_f_g_h_i");
        assert_eq!(safe_file_name("  嵐の人 ..."), "嵐の人");
        assert_eq!(safe_file_name(""), "ExileDesk");
        assert_eq!(safe_file_name(&"x".repeat(100)).chars().count(), 80);
    }
}

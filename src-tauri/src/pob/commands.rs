//! Tauri command (pob_*): PobWorker への薄いラッパ
//!
//! __tmp_src.rs (812 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn pob_load_build_code(
    state: tauri::State<'_, PobWorker>,
    code: String,
) -> Result<(), String> {
    let xml = decode_pob_code(&code).map_err(|e| format!("decode failed: {:#}", e))?;
    state.load_build_xml(xml)
}

#[tauri::command]
pub fn pob_load_build_xml(
    state: tauri::State<'_, PobWorker>,
    xml: String,
) -> Result<(), String> {
    state.load_build_xml(xml)
}

#[tauri::command]
pub fn pob_get_stat(
    state: tauri::State<'_, PobWorker>,
    key: String,
) -> Result<f64, String> {
    state.get_stat(key)
}

#[tauri::command]
pub fn pob_get_stats_all(
    state: tauri::State<'_, PobWorker>,
) -> Result<HashMap<String, f64>, String> {
    state.get_stats_all()
}

#[tauri::command]
pub fn pob_set_item_in_slot(
    state: tauri::State<'_, PobWorker>,
    slot: Option<String>,
    raw: String,
) -> Result<String, String> {
    state.set_item_in_slot(slot, raw)
}

#[tauri::command]
pub fn pob_clear_slot(
    state: tauri::State<'_, PobWorker>,
    slot: String,
) -> Result<(), String> {
    state.clear_slot(slot)
}

#[tauri::command]
pub fn pob_snapshot(state: tauri::State<'_, PobWorker>) -> Result<String, String> {
    state.snapshot()
}

#[tauri::command]
pub fn pob_restore_snapshot(
    state: tauri::State<'_, PobWorker>,
    xml: String,
) -> Result<(), String> {
    state.restore_snapshot(xml)
}

#[tauri::command]
pub fn pob_get_equipped_items(
    state: tauri::State<'_, PobWorker>,
) -> Result<Vec<EquippedItemInfo>, String> {
    state.get_equipped_items()
}

#[tauri::command]
pub fn pob_get_skill_groups(
    state: tauri::State<'_, PobWorker>,
) -> Result<Vec<SkillGroupInfo>, String> {
    state.get_skill_groups()
}

#[tauri::command]
pub fn pob_set_main_socket_group(
    state: tauri::State<'_, PobWorker>,
    index: u32,
) -> Result<(), String> {
    state.set_main_socket_group(index)
}

/// PoB の中で Lua を 1 本走らせて、返した文字 (JSON) を返す (2026-10-02 火力チェックの画面)。
/// 画面側 (src/services/pob-check/) が「スキルごとの数字」「ジェムを変える」などの小さな Lua を送る。
/// PoB の計算そのものには手を入れず、PoB の関数を呼ぶだけにする (オーナーの方針: 計算エンジンは触らない)
#[tauri::command]
pub fn pob_eval(state: tauri::State<'_, PobWorker>, script: String) -> Result<String, String> {
    state.eval_string(script)
}

// ---------------------------------------------------------------------------
// 火力チェックの読み込み / 共有 (2026-10-02 オーナー「人の読み込む時と自分の読み込む時とシェアするときあるやん」)
// ---------------------------------------------------------------------------

/// 同梱 (公式と共通) の PoB が保存したビルド 1 つ
#[derive(Debug, serde::Serialize)]
pub struct SavedBuild {
    /// Builds フォルダからの相対パス (フォルダ分けも込み)
    pub name: String,
    pub path: String,
    /// 更新時刻 (unix 秒)
    pub modified: u64,
    /// <Build> の className / ascendClassName / level
    pub class_name: String,
    pub ascendancy: String,
    pub level: u32,
}

/// PoB のビルドの保存先。PoB の Settings.xml に buildPath があればそれ、無ければ ドキュメント\Path of Building (PoE2)\Builds
fn pob_builds_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    let user = app.path().document_dir().ok()?.join("Path of Building (PoE2)");
    if let Ok(settings) = std::fs::read_to_string(user.join("Settings.xml")) {
        if let Some(i) = settings.find("buildPath=\"") {
            let rest = &settings[i + 11..];
            if let Some(j) = rest.find('"') {
                let p = std::path::PathBuf::from(&rest[..j]);
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
    }
    Some(user.join("Builds"))
}

fn xml_attr(head: &str, key: &str) -> String {
    let pat = format!(" {key}=\"");
    head.find(&pat)
        .and_then(|i| head[i + pat.len()..].split('"').next().map(|s| s.to_string()))
        .unwrap_or_default()
}

/// 保存したビルドの一覧 (新しい順)。フォルダが無ければ空
#[tauri::command]
pub fn pob_saved_builds(app: tauri::AppHandle) -> Result<Vec<SavedBuild>, String> {
    let Some(root) = pob_builds_dir(&app) else { return Ok(vec![]) };
    let mut out = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            if p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("xml")) != Some(true) {
                continue;
            }
            let modified = e.metadata().and_then(|m| m.modified()).ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
            // 頭の <Build ...> だけ読む
            let head: String = std::fs::read_to_string(&p).unwrap_or_default().chars().take(4000).collect();
            let build_tag = head.find("<Build ").map(|i| &head[i..]).unwrap_or("");
            let build_tag = &build_tag[..build_tag.find('>').unwrap_or(build_tag.len())];
            let name = p.strip_prefix(&root).unwrap_or(&p).with_extension("").to_string_lossy().replace(std::path::MAIN_SEPARATOR, "/");
            out.push(SavedBuild {
                name,
                path: p.to_string_lossy().to_string(),
                modified,
                class_name: xml_attr(build_tag, "className"),
                ascendancy: xml_attr(build_tag, "ascendClassName"),
                level: xml_attr(build_tag, "level").parse().unwrap_or(0),
            });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// 保存したビルドを読み込む (Builds フォルダの中の物だけ)
#[tauri::command]
pub fn pob_load_saved_build(app: tauri::AppHandle, state: tauri::State<'_, PobWorker>, path: String) -> Result<(), String> {
    let root = pob_builds_dir(&app).ok_or("PoB の保存先が分かりません")?;
    let p = std::path::PathBuf::from(&path);
    let canon = p.canonicalize().map_err(|e| e.to_string())?;
    let root_c = root.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(&root_c) {
        return Err("PoB の Builds フォルダの外は読めません".into());
    }
    let xml = std::fs::read_to_string(&canon).map_err(|e| e.to_string())?;
    state.load_build_xml(xml)
}

/// 今のビルド (変えた所も込み) を PoB のコードにする。PoB の「共有」と同じ: SaveDB → zlib → base64 (url-safe)
#[tauri::command]
pub fn pob_export_code(state: tauri::State<'_, PobWorker>) -> Result<String, String> {
    use std::io::Write;
    let xml = state.eval_string("return build:SaveDB(\"code\")".into())?;
    if !xml.contains("<PathOfBuilding") {
        return Err(format!("PoB が書き出せませんでした: {}", xml.chars().take(200).collect::<String>()));
    }
    let mut enc = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(xml.as_bytes()).map_err(|e| e.to_string())?;
    let bytes = enc.finish().map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::URL_SAFE.encode(bytes))
}

//! Tauri command (pob_*): PobWorker への薄いラッパ
//!
//! __tmp_src.rs (812 行) から機械分割 (2026-09-07 R3)。
//!
//! 2026-10-02: 全部 `#[tauri::command(async)]` にした。Tauri 2 は同期コマンドを**メインスレッド**で走らせるので、
//! worker の返事を `recv` で待つ間 (ノードの寄与は 1 スキル 2 秒、読み込みは数秒) ウィンドウが固まっていた。
//! `async` を付けると同期の関数でもスレッドプール側で走る (State<'_, PobWorker> は Mutex だけなので Send + Sync)

use super::*;

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command(async)]
pub fn pob_load_build_code(
    state: tauri::State<'_, PobWorker>,
    code: String,
) -> Result<(), String> {
    let xml = decode_pob_code(&code).map_err(|e| format!("decode failed: {:#}", e))?;
    // PoE1 のコードや PoB でない XML は PoB の中で黙って空のビルドになるので、ここで止める
    check_pob2_xml(&xml)?;
    state.load_build_xml(xml)
}

#[tauri::command(async)]
pub fn pob_load_build_xml(
    state: tauri::State<'_, PobWorker>,
    xml: String,
) -> Result<(), String> {
    check_pob2_xml(&xml)?;
    state.load_build_xml(xml)
}

#[tauri::command(async)]
pub fn pob_get_stat(
    state: tauri::State<'_, PobWorker>,
    key: String,
) -> Result<f64, String> {
    state.get_stat(key)
}

#[tauri::command(async)]
pub fn pob_get_stats_all(
    state: tauri::State<'_, PobWorker>,
) -> Result<HashMap<String, f64>, String> {
    state.get_stats_all()
}

#[tauri::command(async)]
pub fn pob_set_item_in_slot(
    state: tauri::State<'_, PobWorker>,
    slot: Option<String>,
    raw: String,
) -> Result<String, String> {
    state.set_item_in_slot(slot, raw)
}

#[tauri::command(async)]
pub fn pob_clear_slot(
    state: tauri::State<'_, PobWorker>,
    slot: String,
) -> Result<(), String> {
    state.clear_slot(slot)
}

#[tauri::command(async)]
pub fn pob_snapshot(state: tauri::State<'_, PobWorker>) -> Result<String, String> {
    state.snapshot()
}

#[tauri::command(async)]
pub fn pob_restore_snapshot(
    state: tauri::State<'_, PobWorker>,
    xml: String,
) -> Result<(), String> {
    state.restore_snapshot(xml)
}

#[tauri::command(async)]
pub fn pob_get_equipped_items(
    state: tauri::State<'_, PobWorker>,
) -> Result<Vec<EquippedItemInfo>, String> {
    state.get_equipped_items()
}

#[tauri::command(async)]
pub fn pob_get_skill_groups(
    state: tauri::State<'_, PobWorker>,
) -> Result<Vec<SkillGroupInfo>, String> {
    state.get_skill_groups()
}

#[tauri::command(async)]
pub fn pob_set_main_socket_group(
    state: tauri::State<'_, PobWorker>,
    index: u32,
) -> Result<(), String> {
    state.set_main_socket_group(index)
}

/// PoB の中で Lua を 1 本走らせて、返した文字 (JSON) を返す (2026-10-02 火力チェックの画面)。
/// 画面側 (src/services/pob-check/) が「スキルごとの数字」「ジェムを変える」などの小さな Lua を送る。
/// PoB の計算そのものには手を入れず、PoB の関数を呼ぶだけにする (オーナーの方針: 計算エンジンは触らない)
#[tauri::command(async)]
pub fn pob_eval(state: tauri::State<'_, PobWorker>, script: String) -> Result<String, String> {
    state.eval_string(script)
}

// ---------------------------------------------------------------------------
// 火力チェックの共有 (2026-10-02)。自分のキャラの読み込みは PoB の Import/Export のコードを貼る (2026-10-02 オーナー決定:
// Web サイト側に PoE2 の装備・パッシブの口が無く、公式 API は OAuth の登録が要るので、アプリのログインでは読めない)
// ---------------------------------------------------------------------------

/// 今のビルド (変えた所も込み) を PoB のコードにする。PoB の「共有」と同じ: SaveDB → zlib → base64 (url-safe)
#[tauri::command(async)]
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

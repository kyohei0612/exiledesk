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

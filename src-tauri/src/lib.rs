// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// OAuth は方針として実装なし（オーナー判断 2026-05-09: 申請が面倒、PoB share code で十分）
pub mod pob;  // PoB-PoE2 ヘッドレス連携（Phase 2、PobWorker thread + 4 commands）— example からも参照される
pub mod claude_code;  // Claude Code (claude CLI) spawn → MAX プラン OAuth 経由のトークン消費
pub mod trade2;  // POE2 公式 trade2 API client (CORS 制約 + rate limit のため Rust 経由)
pub mod craft_discovery_storage;  // クラフト発見君の累積データ JSON 永続化 (app_data_dir)

use std::path::PathBuf;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// PoB submodule の src/ ディレクトリを返す。
/// 開発時は `<project>/vendor/PathOfBuilding-PoE2/src` を指す。
fn pob_src_dir() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .expect("src-tauri parent")
        .join("vendor")
        .join("PathOfBuilding-PoE2")
        .join("src")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pob_worker = pob::PobWorker::spawn(pob_src_dir());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(pob_worker)
        .invoke_handler(tauri::generate_handler![
            greet,
            pob::pob_load_build_code,
            pob::pob_load_build_xml,
            pob::pob_get_stat,
            pob::pob_get_stats_all,
            pob::pob_set_item_in_slot,
            pob::pob_clear_slot,
            pob::pob_snapshot,
            pob::pob_restore_snapshot,
            pob::pob_get_equipped_items,
            pob::pob_get_skill_groups,
            pob::pob_set_main_socket_group,
            claude_code::ask_claude_code,
            trade2::trade2_search,
            trade2::trade2_search_count,
            trade2::trade2_fetch,
            craft_discovery_storage::discovery_save,
            craft_discovery_storage::discovery_load,
            craft_discovery_storage::discovery_load_prev,
            craft_discovery_storage::discovery_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

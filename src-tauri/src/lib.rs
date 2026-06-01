// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// OAuth は方針として実装なし（オーナー判断 2026-05-09: 申請が面倒、PoB share code で十分）
pub mod pob;  // PoB-PoE2 ヘッドレス連携（Phase 2、PobWorker thread + 4 commands）— example からも参照される
pub mod trade2;  // POE2 公式 trade2 API client (CORS 制約 + rate limit のため Rust 経由)
pub mod craft_discovery_storage;  // クラフト発見君の累積データ JSON 永続化 (app_data_dir)
pub mod craft_v2_storage;  // Phase ζ: クラフト発見 V2 のディスクキャッシュ (差分更新用)
pub mod poe_ninja_client;  // Phase β: poe.ninja クライアント (search protobuf decode + character endpoint)
pub mod health_check;  // Phase ο-A: 起動時の外部 API / HTML / trade2 健全性チェック
pub mod settings;  // 設定画面 (2026-05-23): autostart / close_to_tray / auto-refetch 永続化

use std::path::PathBuf;
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};

/// テンプレ由来 (`tauri create-app` の hello world example)。
/// Low-L9 (2026-05-22): 実プロダクトでは未使用。削除可能だが、
/// invoke_handler 登録から外すと UI 側の dev サンプルが壊れる懸念があるため残置。
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        // ----------------------------------------------------------------
        // Phase 設定画面 (2026-05-23): スタートアップ ON/OFF
        //
        // ログイン時に `exiledesk.exe --tray-only` で起動させ、ウィンドウは
        // 隠したままタスクトレイのみ常駐する (Discord 風)。
        // 引数 `--tray-only` は setup 内で `std::env::args` を見て分岐する。
        // ----------------------------------------------------------------
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--tray-only"]),
        ))
        .manage(pob_worker)
        // Phase 設定画面: 設定 state (× ボタン / autostart / auto-refetch 周期)
        .manage(settings::AppSettingsState::default())
        .setup(|app| {
            // ----------------------------------------------------------------
            // 設定の disk → in-memory state ロード (起動時 1 回だけ)
            //
            // ファイル無 / 破損時は Default に倒れる (load_from_disk 内で握りつぶし)。
            // 以降は `settings_save` コマンドが呼ばれるたびに state が更新される。
            // ----------------------------------------------------------------
            let loaded = settings::load_from_disk(&app.handle());
            if let Some(state) = app.try_state::<settings::AppSettingsState>() {
                state.set(loaded.clone());
            }

            // ----------------------------------------------------------------
            // --tray-only フラグ判定 (Discord 風バックグラウンド起動)
            //
            // Windows ログイン時の自動起動では `--tray-only` 付きで exec される。
            // この時はメインウィンドウを表示しない (= タスクトレイのみ常駐)。
            // ----------------------------------------------------------------
            let tray_only = std::env::args().any(|a| a == "--tray-only");
            // ----------------------------------------------------------------
            // タスクトレイ常駐 (Phase 1.6)
            //
            // 設計意図:
            //   × ボタンでアプリを完全終了させると、ユーザーが背景で続いている
            //   poe.ninja fetch を意図せず中断してしまうことがある。
            //   そこで × ボタン = hide、タスクトレイ = 唯一の終了導線 とする。
            //
            // 注意点 (Tauri v2 API, 2.11.x 系で確認):
            //   - `tauri = { features = ["tray-icon"] }` 必須 (Cargo.toml)。
            //   - `MenuItem` / `Menu` は `tauri::menu` 配下。
            //   - `TrayIconBuilder` は `tauri::tray` 配下。
            //   - クリック検出は `TrayIconEvent::Click { button, button_state, .. }`
            //     のマッチパターン。v1 系の `SystemTrayEvent` とは別物。
            //   - icon は `app.default_window_icon()` (tauri.conf.json の bundle.icon
            //     から取り込まれる) を流用 → 別 png を持つ必要なし。
            // ----------------------------------------------------------------
            let show_item =
                MenuItem::with_id(app, "show", "ExileDesk を表示", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .expect("default window icon must be configured in tauri.conf.json")
                        .clone(),
                )
                .tooltip("ExileDesk — POE2 Secretary")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // 左クリックの「離した瞬間」だけ反応 (押した瞬間や右クリックは無視)。
                    // 右クリックはメニュー (.menu(&menu)) が自動で開く。
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ----------------------------------------------------------------
            // --tray-only 起動時はメインウィンドウを hide (Discord 風)
            //
            // visible=false 構成にせず「起動 → hide」にしているのは、ユーザーが
            // タスクトレイから「表示」を選んだ時に同じ window インスタンスを再
            // 利用するため。tauri.conf.json の visible キーを false にすると、
            // 一部 OS で初期化順序の都合で WebView が遅延起動になる事例がある。
            // ----------------------------------------------------------------
            if tray_only {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // ----------------------------------------------------------------
            // 自動再取得スケジューラ (Phase 設定画面)
            //
            // tokio タスクで `auto_refetch_interval_secs` ごとに
            // `craft-v2-auto-refetch` イベントをフロントに emit する。
            // 受信側 (craft-v2-store.ts) は `refreshCraftV2()` を呼んで差分更新。
            //
            // ループ毎に state から最新 interval を読み直すので、設定 UI で間隔を
            // 変えても、次の sleep 終了タイミングから新しい値が反映される。
            // interval == 0 (無効) の時は 1 時間スリープして再判定 → 設定が戻れば復活。
            // ----------------------------------------------------------------
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    let interval_secs = app_handle
                        .try_state::<settings::AppSettingsState>()
                        .map(|s| s.get().auto_refetch_interval_secs)
                        .unwrap_or(6 * 3600);

                    if interval_secs == 0 {
                        // 無効化中: 1 時間ごとに復活判定
                        tokio::time::sleep(Duration::from_secs(3600)).await;
                        continue;
                    }

                    tokio::time::sleep(Duration::from_secs(interval_secs)).await;

                    // フロントへ通知 (window が hide でも emit は届く)
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("craft-v2-auto-refetch", ());
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // × ボタン押下時の挙動は設定 `close_to_tray` で切替。
            //
            //   true  (デフォ / Discord 風): hide してタスクトレイに最小化。
            //                                ユーザーは右クリックメニュー「終了」で完全終了。
            //   false (通常アプリ風):       prevent_close せず、そのまま終了させる。
            //
            // state は起動時 + settings_save 後に同期されているので、disk I/O は発生しない。
            if let WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = window
                    .app_handle()
                    .try_state::<settings::AppSettingsState>()
                    .map(|s| s.get().close_to_tray)
                    .unwrap_or(true);
                if close_to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
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
            trade2::trade2_search,
            trade2::trade2_search_count,
            trade2::trade2_fetch,
            craft_discovery_storage::discovery_save,
            craft_discovery_storage::discovery_load,
            craft_discovery_storage::discovery_load_prev,
            craft_discovery_storage::discovery_clear,
            craft_v2_storage::craft_v2_cache_load,
            craft_v2_storage::craft_v2_cache_save,
            craft_v2_storage::craft_v2_cache_clear,
            poe_ninja_client::craft_v2_fetch_all,
            poe_ninja_client::craft_v2_cancel,
            poe_ninja_client::get_network_status,
            poe_ninja_client::fetch_economy_leagues,
            health_check::health_check_all,
            settings::settings_load,
            settings::settings_save,
            settings::is_debug_build,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

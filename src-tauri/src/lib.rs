// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// OAuth は方針として実装なし（オーナー判断 2026-05-09: 申請が面倒、PoB share code で十分）
pub mod pob;  // PoB-PoE2 ヘッドレス連携（Phase 2、PobWorker thread + 4 commands）— example からも参照される
pub mod trade2;  // POE2 公式 trade2 API client (CORS 制約 + rate limit のため Rust 経由)
pub mod craft_discovery_storage;  // クラフト発見君の累積データ JSON 永続化 (app_data_dir)
pub mod craft_v2_storage;  // Phase ζ: クラフト発見 V2 のディスクキャッシュ (差分更新用)
pub mod poe_ninja_client;  // Phase β: poe.ninja クライアント (search protobuf decode + character endpoint)
pub mod health_check;  // Phase ο-A: 起動時の外部 API / HTML / trade2 健全性チェック
pub mod settings;  // 設定画面 (2026-05-23): autostart / close_to_tray / auto-refetch 永続化
pub mod pob_launcher;  // 同梱 PoB の起動 (2026-09-07): resources/pob を外部プロセスで開く
pub mod pob_bundle;  // PoB 同梱物の別配布 (2026-09-08): GitHub Release pob-bundle から app_local_data_dir/pob に展開
pub mod client_log;  // ゲームログ (Client.txt) 診断 (2026-09-10): 既知パターンで実害あり / 無害を仕分け
pub mod instance_guard;  // 2 重起動の防止とスタートアップ登録の自己修復 (2026-09-15)
pub mod app_log;
pub mod gem_break_cache;  // 使用率ランキングのキャラ別キャッシュ (2026-09-18)
pub mod seed_data;        // 同梱データ (自動ジェム監視まわり) の取り込み (2026-09-18)         // app_data_dir/exiledesk.log (2026-09-18 オーナー「エラーログ見て欲しい」)
pub mod market_flow;  // 捌き速度の追跡 (2026-09-16): trade2 のクエリ単位で 周期ごとに出品の消失率を記録
pub mod gem_break;  // クラフト前提ジェム (2026-09-16): 1 アセンダンシー分のレベル 21 / 品質 23% 使用人数
pub mod trade_history;  // 取引履歴 (マーチャント履歴) の連動 (2026-09-16): アプリ内ログイン + 履歴 API
mod startup;  // 起動時の setup (ワーカー / 巡回 / 設定 / トレイ / 自動再取得)。2026-09-26 に run() から分割

use tauri::{Manager, WindowEvent};

/// テンプレ由来 (`tauri create-app` の hello world example)。
/// Low-L9 (2026-05-22): 実プロダクトでは未使用。削除可能だが、
/// invoke_handler 登録から外すと UI 側の dev サンプルが壊れる懸念があるため残置。
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// メインウィンドウを現在のモニタの可視領域(work area)内へクランプ＆再配置する。
///
/// Tauri 2.11 は `Monitor::work_area() -> &PhysicalRect<i32, u32>` で
/// タスクバーを除外した可視領域を直接取得できる。`PhysicalRect` の
/// `.position` がタスクバー除外の原点、`.size` がタスクバー除外サイズ。
/// 下端・上端・左右どのエッジにタスクバーがあっても OS が算出済みの値を返すため、
/// 経験的な reserve マージンに頼らず正確に「画面外はみ出し」を防げる。
///
/// 内寸/外寸セマンティクス:
///   - `outer_size()` は装飾込みの外寸、`inner_size()` はコンテンツ領域の内寸。
///   - `set_size()` は内寸を設定するため、外寸を work area に収めるには
///     内寸ターゲット = work area寸 - 装飾差 とする。装飾差(タイトルバー/枠)は
///     `outer_size() - inner_size()` から実測して使う。
///
/// 全ての操作は `let _ =` 等でエラーを握りつぶし、起動を止めない。
fn clamp_into_visible_area(window: &tauri::WebviewWindow) {
    use tauri::{PhysicalPosition, PhysicalSize};

    // 1. 現在モニタ取得。失敗 / None なら何もしない (早期 return)。
    let monitor = match window.current_monitor() {
        Ok(Some(m)) => m,
        _ => return,
    };

    // work area (タスクバー除外の可視領域) を取得。
    let wa = monitor.work_area();
    let wa_x = wa.position.x; // 可視領域原点 X (マルチモニタ絶対座標)
    let wa_y = wa.position.y; // 可視領域原点 Y
    let wa_w = wa.size.width as i32; // 可視領域幅
    let wa_h = wa.size.height as i32; // 可視領域高さ

    // work area が異常値 (0 以下) なら何もしない。
    if wa_w <= 0 || wa_h <= 0 {
        return;
    }

    // tauri.conf.json の minWidth 1280 / minHeight 600 (論理px) を物理px へ換算した下限ガード。
    let scale = monitor.scale_factor();
    let min_w_phys = (1280.0 * scale).round() as i32;
    let min_h_phys = (600.0 * scale).round() as i32;

    // 2. 外寸(装飾込み) と 内寸(コンテンツ領域) を取得し、装飾差を実測する。
    let outer = match window.outer_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let inner = match window.inner_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    // 装飾差 (タイトルバー/枠分)。負値防止で 0 下限。
    let deco_w = (outer.width as i32 - inner.width as i32).max(0);
    let deco_h = (outer.height as i32 - inner.height as i32).max(0);

    // 3. 外寸が work area を超えるなら内寸を縮小。
    //    内寸ターゲット = work area寸 - 装飾差 (min 未満には縮めない)。
    let mut new_inner_w = inner.width as i32;
    let mut new_inner_h = inner.height as i32;
    let mut need_resize = false;

    if outer.width as i32 > wa_w {
        new_inner_w = (wa_w - deco_w).max(min_w_phys);
        need_resize = true;
    }
    if outer.height as i32 > wa_h {
        new_inner_h = (wa_h - deco_h).max(min_h_phys);
        need_resize = true;
    }

    if need_resize {
        let _ = window.set_size(PhysicalSize::new(
            new_inner_w.max(1) as u32,
            new_inner_h.max(1) as u32,
        ));
    }

    // 4. 再配置に使う最終外寸 (縮小後の想定値 = 内寸 + 装飾差)。
    let final_outer_w = new_inner_w + deco_w;
    let final_outer_h = new_inner_h + deco_h;

    // 5. work area 原点を基準に水平中央＋可視領域内中央寄せで再配置。
    //    work area が既にタスクバーを除外しているため、下端/上端どちらの
    //    タスクバーでも食い込まない。マルチモニタ絶対座標。
    let x = wa_x + (wa_w - final_outer_w).max(0) / 2;
    let y = wa_y + (wa_h - final_outer_h).max(0) / 2;

    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// ウィンドウをもう出したか (画面からの合図と保険のタイマーで二重に出さない)
static WINDOW_SHOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// 画面 (App.vue) の準備ができたら呼ばれる。ここで初めてウィンドウを出す。
///
/// 2026-09-18 オーナー報告「白い画面のアプリが立ち上がって即終了する」:
/// 2 つ目の起動でも tauri.conf.json のウィンドウは作られるので、single-instance が
/// プロセスを終わらせるまでの一瞬だけ**中身が空の白い窓**が見えていた。
/// 起動時は隠して (visible: false)、中身が描けてから出せば白い窓は出ない。
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    show_main_window_now(&app, "画面の準備ができた");
}

fn show_main_window_now(app: &tauri::AppHandle, why: &str) {
    use std::sync::atomic::Ordering as AtomicOrdering;
    if WINDOW_SHOWN.swap(true, AtomicOrdering::SeqCst) {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        clamp_into_visible_area(&window);
        let _ = window.show();
        let _ = window.set_focus();
    }
    app_log::line(app, &format!("[起動] ウィンドウを表示 ({why})"));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // 2 つ目の起動は既存のウィンドウを前面に出して終わる (single-instance は最初に登録する)。
    // 開発ビルドはインストール版と並べて動かせるよう対象外 (instance_guard.rs)。
    if !instance_guard::is_dev_exe() {
        builder = builder.plugin(tauri_plugin_single_instance::init(instance_guard::on_second_instance));
    }
    builder
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
            Some(vec![instance_guard::TRAY_ONLY_ARG]),
        ))
        // Phase 設定画面: 設定 state (× ボタン / autostart / auto-refetch 周期)
        .manage(settings::AppSettingsState::default())
        // 起動時の処理は startup.rs (2026-09-26 に 300 行ルールで分割)
        .setup(|app| startup::setup(app))
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
            instance_guard::mark_show_on_restart,
            show_main_window,
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
            poe_ninja_client::ninja_economy_overview,
            poe_ninja_client::ninja_economy_history,
            health_check::health_check_all,
            settings::settings_load,
            settings::settings_save,
            settings::is_debug_build,
            trade_history::trade_history_session,
            trade_history::trade_history_login,
            trade_history::trade_history_logout,
            trade_history::trade_history_leagues,
            trade_history::trade_history_fetch,
            gem_break::gem_break_fetch,
            gem_break::gem_break_stored_result,
            gem_break::gem_break_cached,
            gem_break::gem_break_ascendancies,
            gem_break::gem_break_cancel,
            market_flow::market_flow_load,
            market_flow::market_flow_set_watches,
            market_flow::market_flow_status,
            market_flow::market_flow_set_cycle,
            market_flow::market_flow_export_seed,
            market_flow::market_flow_import_seed,
            market_flow::market_flow_sample_now,
            market_flow::market_flow_cancel,
            market_flow::market_flow_record,
            market_flow::market_flow_verify,
            pob_launcher::pob_launcher_status,
            pob_launcher::pob_launcher_open,
            pob_bundle::pob_bundle_status,
            pob_bundle::pob_bundle_check,
            pob_bundle::pob_bundle_install,
            client_log::client_log_status,
            client_log::client_log_diagnose,
            client_log::client_log_clear,
            client_log::client_log_history,
            client_log::client_log_auto_rotate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

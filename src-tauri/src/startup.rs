//! startup.rs — 起動時の setup (PoB ワーカー / 捌き速度の巡回 / 設定の読み込み / トレイ常駐 / 自動再取得)
//!
//! lib.rs から分割 (2026-09-26)。中身は `run()` の `.setup(|app| { ... })` をそのまま移した物。

use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

use crate::{
    app_log, instance_guard, market_flow, pob, pob_launcher, seed_data, settings, show_main_window_now, trade2,
    WINDOW_SHOWN,
};

pub(crate) fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // 2026-09-07: ヘッドレス PoB のスクリプト元は同梱版 (resources/pob) を優先。
    // 旧実装は CARGO_MANIFEST_DIR 固定で、リリースビルドでは存在しないパスを指していた。
    app.manage(pob::PobWorker::spawn(pob_launcher::headless_src_dir(
        &app.handle(),
    )));

    // 2026-09-16: ジェムの売れ行きを 周期ごとに記録する (追跡リストが空なら何もしない)
    market_flow::spawn_scheduler(app.handle().clone());

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

    app_log::init(app.handle());
    // trade2 の送信記録を読み直す (再起動のたびにバーストしないように 2026-09-18)
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        trade2::load_gates(dir.join("trade2_rate.json"));
    }
    app_log::line(
        app.handle(),
        &format!(
            "[起動] v{} args={:?}",
            app.package_info().version,
            std::env::args().skip(1).collect::<Vec<_>>()
        ),
    );
    // 同梱した自動ジェム監視のデータ (捌き速度の記録 / 使用率ランキング) を、
    // まだ無い時だけ入れる (オーナー指示 2026-09-18「ビルドに食い込んで」)
    seed_data::install_if_missing(app.handle());
    // 自動起動の登録先が別の exe (古い開発ビルドなど) を指していたら今の exe に直す
    instance_guard::repair_autostart(&app.package_info().name);

    // ----------------------------------------------------------------
    // --tray-only フラグ判定 (Discord 風バックグラウンド起動)
    //
    // Windows ログイン時の自動起動では `--tray-only` 付きで exec される。
    // この時はメインウィンドウを表示しない (= タスクトレイのみ常駐)。
    // ----------------------------------------------------------------
    // 自動更新からの再起動 (印あり) は `--tray-only` を引き継いでいてもウィンドウを出す
    let tray_only = std::env::args().any(|a| a == instance_guard::TRAY_ONLY_ARG)
        && !instance_guard::take_show_marker(app.handle());
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
            "show" => instance_guard::bring_to_front(app),
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
                instance_guard::bring_to_front(tray.app_handle());
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
        // 起動時点で既に隠れている (visible: false)。そのままトレイ常駐
        app_log::line(app.handle(), "[起動] --tray-only なのでウィンドウは出さずトレイ常駐");
        WINDOW_SHOWN.store(true, std::sync::atomic::Ordering::SeqCst);
    } else {
        // ------------------------------------------------------------
        // 起動時の画面外はみ出し防止 (2026-06-28)
        //
        // 症状: OS 任せの初期配置だと、低解像度/小型モニタや
        //       タスクバー位置の都合でウィンドウ下端が画面外へ
        //       はみ出すことがある。tauri.conf.json の "center": true
        //       で中央寄せはされるが、ウィンドウ高さ(900)がモニタ
        //       可視高さを超える環境では下端が切れてしまう。
        //
        // 対策: 現在モニタの work area(タスクバー除外の可視領域)へ
        //       ウィンドウをクランプ＆再配置する (clamp_into_visible_area)。
        //
        // tray-only 起動時は window を hide するので再配置しない
        // (隠すので不要・副作用回避)。
        // ------------------------------------------------------------
        // 画面から合図が来たら出す。来なければ 5 秒後に保険で出す
        // (フロントが壊れていてもウィンドウが出ないまま常駐しないように)
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            show_main_window_now(&handle, "保険のタイマー (画面からの合図が来なかった)");
        });
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
                // 無効化中: 周期ごとに復活判定
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
}

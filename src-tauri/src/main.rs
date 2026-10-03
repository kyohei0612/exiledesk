// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 2026-10-03 オーナー「更新したらジェムやら監視の奴もリセットされた」の原因: 開発ビルド (target\debug) を
    // WEBVIEW2_USER_DATA_FOLDER=…ExileDesk-dev / --remote-debugging-port 付きで動かすと、その開発ビルドの自動更新が
    // インストーラーを走らせ、インストーラーが**開発ビルドの環境変数を引き継いだまま**インストール版を起動していた。
    // インストール版が開発用の WebView2 プロファイルで立ち上がり、localStorage (監視・帳簿) が別物に見えた。
    // リリース版は誰に起動されても自分の既定のプロファイルを使う (環境変数を見ない)。開発ビルドは今まで通り (確認で使う)
    #[cfg(not(debug_assertions))]
    {
        std::env::remove_var("WEBVIEW2_USER_DATA_FOLDER");
        std::env::remove_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
    }
    exiledesk_lib::run()
}

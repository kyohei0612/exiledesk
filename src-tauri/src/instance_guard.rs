//! 2 重起動の防止とスタートアップ登録の自己修復 (2026-09-15)
//!
//! 開発中に `target\release\exiledesk.exe` で設定画面を開くと、自動起動の同期で HKCU\Run が
//! 開発ビルドのパスに書き換わり、ログインのたびに古い開発ビルドがインストール版と並んで常駐していた
//! (同じ WebView2 データフォルダを使うのでブラウザプロセスまで共有していた)。
//!   - 開発ビルド (cargo の target\debug / target\release の exe) は自動起動を登録しない
//!   - インストール版は起動時に Run の登録先を確かめ、別の exe を指していれば自分に書き直す
//!   - インストール版は 2 つ目を起動しない (既存のウィンドウを前面に出す)

use std::path::Path;

use tauri::Manager;

/// ログイン時の自動起動に付ける引数 (ウィンドウを出さずにタスクトレイだけ常駐)
pub const TRAY_ONLY_ARG: &str = "--tray-only";

/// cargo の target ディレクトリで動いている (= 開発ビルド) か
pub fn is_dev_exe() -> bool {
    std::env::current_exe().map(|p| is_cargo_target_exe(&p)).unwrap_or(false)
}

fn is_cargo_target_exe(exe: &Path) -> bool {
    let Some(profile_dir) = exe.parent() else { return false };
    let is_profile = profile_dir
        .file_name()
        .is_some_and(|n| n.eq_ignore_ascii_case("release") || n.eq_ignore_ascii_case("debug"));
    let under_target = profile_dir
        .parent()
        .and_then(|p| p.file_name())
        .is_some_and(|n| n.eq_ignore_ascii_case("target"));
    is_profile && under_target
}

/// Run の値 (`"C:\...\exiledesk.exe" --tray-only` または引用符なし) から exe のパスを取り出す
fn exe_in_run_value(value: &str) -> &str {
    let v = value.trim();
    if let Some(rest) = v.strip_prefix('"') {
        return rest.split('"').next().unwrap_or(rest);
    }
    match v.to_ascii_lowercase().find(".exe") {
        Some(i) => &v[..i + 4],
        None => v,
    }
}

/// 2 つ目が起動されたとき (single-instance のコールバック)。既存のウィンドウを前面に出す。
pub fn on_second_instance<R: tauri::Runtime>(app: &tauri::AppHandle<R>, args: Vec<String>, _cwd: String) {
    // 2 つ目がログイン時の自動起動なら、既に動いている方をそのままにする
    if args.iter().any(|a| a == TRAY_ONLY_ARG) {
        return;
    }
    bring_to_front(app);
}

/// メインウィンドウを確実に前面へ出す (2 つ目の起動 / トレイの左クリック / メニューの「表示」で共通)。
///
/// 2026-09-18 オーナー報告「更新後、起動しても強制終了する」: 実際は 2 つ目の起動が single-instance で
/// 即終了し、既存のウィンドウは show() で「表示」にはなるが Windows が裏のプロセスの
/// SetForegroundWindow を拒むので他のウィンドウの後ろに残っていた (ユーザーからは一瞬出て消えたように見える)。
/// 一度「常に手前」にしてから戻すと Z 順が上がるので、フォーカスを取れなくても見える位置に来る。
pub fn bring_to_front<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        let _ = window.set_always_on_top(false);
    }
}

#[cfg(windows)]
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

/// Run に登録済みで、登録先が今の exe と違えば今の exe に書き直す。
/// 未登録 (自動起動オフ) とタスクマネージャー側の有効 / 無効 (StartupApproved) には触らない。
#[cfg(windows)]
pub fn repair_autostart(app_name: &str) {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::RegKey;

    if is_dev_exe() {
        return;
    }
    let Ok(exe) = std::env::current_exe() else { return };
    let Ok(run) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(RUN_KEY, KEY_READ | KEY_SET_VALUE)
    else {
        return;
    };
    let Ok(current) = run.get_value::<String, _>(app_name) else { return };
    let exe_str = exe.display().to_string();
    if exe_in_run_value(&current).eq_ignore_ascii_case(&exe_str) {
        return;
    }
    let fixed = format!("\"{exe_str}\" {TRAY_ONLY_ARG}");
    match run.set_value(app_name, &fixed) {
        Ok(()) => eprintln!("[instance_guard] 自動起動の登録先を修正: {current} -> {fixed}"),
        Err(e) => eprintln!("[instance_guard] 自動起動の登録先を修正できません: {e}"),
    }
}

#[cfg(not(windows))]
pub fn repair_autostart(_app_name: &str) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn cargo_target_exe_is_dev() {
        assert!(is_cargo_target_exe(&PathBuf::from(r"C:\Users\k\ExileDesk\src-tauri\target\release\exiledesk.exe")));
        assert!(is_cargo_target_exe(&PathBuf::from(r"C:\Users\k\ExileDesk\src-tauri\target\debug\exiledesk.exe")));
        assert!(!is_cargo_target_exe(&PathBuf::from(r"C:\Users\k\AppData\Local\ExileDesk\exiledesk.exe")));
        assert!(!is_cargo_target_exe(&PathBuf::from(r"C:\release\exiledesk.exe")));
    }

    #[test]
    fn run_value_exe_path() {
        assert_eq!(
            exe_in_run_value(r#""C:\Users\k\AppData\Local\ExileDesk\exiledesk.exe" --tray-only"#),
            r"C:\Users\k\AppData\Local\ExileDesk\exiledesk.exe"
        );
        assert_eq!(
            exe_in_run_value(r"C:\Users\k\ExileDesk\src-tauri\target\release\exiledesk.exe --tray-only"),
            r"C:\Users\k\ExileDesk\src-tauri\target\release\exiledesk.exe"
        );
    }
}

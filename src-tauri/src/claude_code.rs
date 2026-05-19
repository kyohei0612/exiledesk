//! Claude Code (`claude` CLI) を spawn して prompt を投げる Tauri command。
//!
//! オーナー判断 (2026-05-10): API キー直叩き (BYOK) はやめて、Claude MAX プラン契約者の
//! Claude Code OAuth 経由でトークン消費する。フロントエンドからは API キーを持たず、
//! Tauri Rust 側で `claude -p <prompt>` を spawn → stdout を返すだけ。
//!
//! 前提: ユーザーの環境に `claude` コマンドが install 済 + `claude /login` 済。
//! Windows では `claude` shim が `claude.cmd` を呼ぶので、PowerShell 経由で起動する。

use std::io::Write;
use std::process::{Command, Stdio};

#[cfg(windows)]
const CLAUDE_BIN: &str = "claude.cmd";
#[cfg(not(windows))]
const CLAUDE_BIN: &str = "claude";

/// `claude -p` で prompt を実行し、stdout (= モデルの応答テキスト) を返す。
///
/// stdin に prompt を流すことで、コマンドライン引数長制限 (Windows ~32K) を回避。
/// max 5 分のタイムアウト想定（POE2 craft 推論で長文返答を想定）。
#[tauri::command]
pub async fn ask_claude_code(prompt: String) -> Result<String, String> {
    // blocking spawn を別スレッドで動かして async 化
    // tauri 内蔵の async_runtime を使えば tokio 直接 depend 不要
    tauri::async_runtime::spawn_blocking(move || run_claude_blocking(&prompt))
        .await
        .map_err(|e| format!("blocking task join error: {e}"))?
}

fn run_claude_blocking(prompt: &str) -> Result<String, String> {
    // -p (--print): 非対話モードで応答を stdout に出力
    // --output-format text (default): 余計な json wrapping なし
    // 標準入力で prompt を渡す（"-" or stdin で受け取れる仕様）
    let mut cmd = Command::new(CLAUDE_BIN);
    cmd.arg("-p")
        .arg("--output-format")
        .arg("text")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows: コンソールウィンドウのチラつき (黒画面 flash) を抑止する。
    // CREATE_NO_WINDOW = 0x08000000。GUI アプリから CLI を裏で叩く時の定番フラグ。
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Claude Code を起動できません ({CLAUDE_BIN}): {e}\nClaude Code (https://claude.com/code) をインストールして `claude /login` 済か確認してください。"
        )
    })?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|e| format!("stdin write 失敗: {e}"))?;
    }
    // stdin 閉じる（drop）→ child が EOF 検知して処理開始
    drop(child.stdin.take());

    let output = child
        .wait_with_output()
        .map_err(|e| format!("claude プロセス wait 失敗: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Claude Code exit {}: {}",
            output.status.code().unwrap_or(-1),
            stderr.trim()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Claude Code から空応答 (stderr: {})",
            stderr.trim()
        ));
    }
    Ok(stdout)
}

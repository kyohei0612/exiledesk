//! 取引履歴 (マーチャント履歴) の連動 (2026-09-16)
//!
//! オーナー指示「PoE2 オーバーレイみたく取引履歴を連動したい」。GGG の OAuth には取引履歴を読むスコープが無いので、
//! XileHUD と同じく「アプリ内のウィンドウで pathofexile.com に本人がログイン → そのログイン状態 (POESESSID) で
//! サイトと同じ履歴 API を読む」方式にする。取引サイトの API は非公式 (公式ドキュメントに載っていない)。
//!   - POESESSID は WebView2 のプロファイル (アプリ内ブラウザ) にだけあり、ExileDesk はファイルに保存しない
//!   - 読むのは GET /api/{trade2|trade}/history/{league} とリーグ一覧だけ。連打しないようフロント側で間隔を空ける
//!   - WebView2 の cookie 取得は同期コマンドやイベントハンドラから呼ぶとデッドロックするので、
//!     async コマンド + spawn_blocking で読む (tauri の Webview::cookies_for_url の注意書き)
//!   - ログイン用ウィンドウは外部ページなので capabilities に入れない (IPC は使えない)

use reqwest::header::COOKIE;
use serde::{Deserialize, Serialize};
use tauri::webview::Cookie;
use tauri::{Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const LOGIN_LABEL: &str = "poe-login";
const SITE: &str = "https://www.pathofexile.com/";
const SESSION_COOKIE: &str = "POESESSID";

/// ログイン状態の cookie をメインウィンドウの WebView2 から探す (ログイン用ウィンドウとプロファイルは共通)
fn find_session(app: &tauri::AppHandle) -> Result<Option<Cookie<'static>>, String> {
    let win = app.get_webview_window("main").ok_or("メインウィンドウがありません")?;
    let url = Url::parse(SITE).map_err(|e| e.to_string())?;
    let cookies = win
        .cookies_for_url(url)
        .map_err(|e| format!("ログイン状態を読めません: {e}"))?;
    Ok(cookies
        .into_iter()
        .find(|c| c.name() == SESSION_COOKIE && !c.value().is_empty()))
}

async fn read_session(app: tauri::AppHandle) -> Result<Option<Cookie<'static>>, String> {
    tauri::async_runtime::spawn_blocking(move || find_session(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn trade_root(game: &str) -> &'static str {
    if game == "poe1" {
        "trade"
    } else {
        "trade2"
    }
}

#[derive(Serialize)]
pub struct HistorySession {
    pub logged_in: bool,
}

/// pathofexile.com にログイン済みか
#[tauri::command]
pub async fn trade_history_session(app: tauri::AppHandle) -> Result<HistorySession, String> {
    Ok(HistorySession { logged_in: read_session(app).await?.is_some() })
}

/// ログイン用ウィンドウを開く。閉じたらメインに `trade-history-login-closed` を送る
#[tauri::command]
pub async fn trade_history_login(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LOGIN_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let url = Url::parse("https://www.pathofexile.com/login").map_err(|e| e.to_string())?;
    let win = WebviewWindowBuilder::new(&app, LOGIN_LABEL, WebviewUrl::External(url))
        .title("pathofexile.com にログイン (ログインしたら閉じてください)")
        .inner_size(900.0, 860.0)
        .build()
        .map_err(|e| format!("ログイン画面を開けません: {e}"))?;
    let handle = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = handle.emit_to("main", "trade-history-login-closed", ());
        }
    });
    Ok(())
}

/// ExileDesk 内のログイン状態 (POESESSID) を消す
#[tauri::command]
pub async fn trade_history_logout(app: tauri::AppHandle) -> Result<(), String> {
    let Some(cookie) = read_session(app.clone()).await? else { return Ok(()) };
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let win = app.get_webview_window("main").ok_or("メインウィンドウがありません")?;
        win.delete_cookie(cookie).map_err(|e| format!("ログアウトできません: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 取引サイトのリーグ一覧 (ログイン不要)
#[tauri::command]
pub async fn trade_history_leagues(game: String) -> Result<Vec<String>, String> {
    let url = format!("{SITE}api/{}/data/leagues", trade_root(&game));
    let body: serde_json::Value = crate::trade2::build_client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("通信エラー: {e}"))?
        .json()
        .await
        .map_err(|e| format!("リーグ一覧を読めません: {e}"))?;
    Ok(body["result"]
        .as_array()
        .map(|a| a.iter().filter_map(|l| l["id"].as_str().map(str::to_string)).collect())
        .unwrap_or_default())
}

#[derive(Deserialize)]
pub struct HistoryRequest {
    /// "poe2" (既定) か "poe1"
    pub game: String,
    pub league: String,
}

/// マーチャント履歴を読む。HTTP の状態は判定せずにそのまま返す (401 = ログイン切れ、429 = 制限中 はフロントで扱う)
#[tauri::command]
pub async fn trade_history_fetch(app: tauri::AppHandle, req: HistoryRequest) -> Result<serde_json::Value, String> {
    let cookie = read_session(app)
        .await?
        .ok_or("pathofexile.com にログインしていません")?;
    let url = format!(
        "{SITE}api/{}/history/{}",
        trade_root(&req.game),
        crate::trade2::urlencode(&req.league)
    );
    let res = crate::trade2::build_client()?
        .get(&url)
        .header(COOKIE, format!("{SESSION_COOKIE}={}", cookie.value()))
        .send()
        .await
        .map_err(|e| format!("通信エラー: {e}"))?;
    let status = res.status().as_u16();
    let ratelimit = crate::trade2::rate_limit_headers(res.headers());
    let retry_after = res
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());
    let text = res.text().await.map_err(|e| format!("応答を読めません: {e}"))?;
    let body = serde_json::from_str::<serde_json::Value>(&text)
        .unwrap_or_else(|_| serde_json::Value::String(text.chars().take(300).collect()));
    Ok(serde_json::json!({ "status": status, "retry_after": retry_after, "ratelimit": ratelimit, "body": body }))
}

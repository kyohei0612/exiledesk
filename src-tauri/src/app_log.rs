//! アプリのログファイル (2026-09-18)
//!
//! オーナー「エラーログ見て欲しい」→ 見るべきファイルが無かった。GUI アプリなので eprintln! は
//! どこにも残らない。ここで app_data_dir/exiledesk.log に追記する。
//!   - 起動 / 2 つ目の起動 / ウィンドウの前面化 / 更新の再起動 / 巡回の失敗 / panic
//!   - 1 MB を超えたら exiledesk.log.1 に回して新しく始める (2 世代)
//!
//! 使い方: `app_log::line(&app, "...")`。app が無い所 (panic hook) は `line_at(path, ..)`。

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex as StdMutex;

use tauri::Manager;

const FILE_NAME: &str = "exiledesk.log";
const ROTATE_BYTES: u64 = 1024 * 1024;

/// panic hook から使うために、起動時に決めたパスを持っておく
static LOG_PATH: StdMutex<Option<PathBuf>> = StdMutex::new(None);

fn now_text() -> String {
    // chrono を足さずに "YYYY-MM-DD HH:MM:SS" (ローカル時刻ではなく UTC+9 固定。オーナー環境は日本)
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
        + 9 * 3600;
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // 1970-01-01 からの日数 → 暦日 (civil_from_days)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mo <= 2 { y + 1 } else { y };
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{m:02}:{s:02}")
}

/// 起動時に 1 回。パスを覚えて panic hook を仕込む
pub fn init<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(FILE_NAME);
    if let Ok(mut g) = LOG_PATH.lock() {
        *g = Some(path.clone());
    }
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        line_at(&path, &format!("PANIC {info}"));
        prev(info);
    }));
}

pub fn path() -> Option<PathBuf> {
    LOG_PATH.lock().ok().and_then(|g| g.clone())
}

/// 1 行追記 (失敗しても何もしない)
pub fn line<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, msg: &str) {
    if let Some(p) = path() {
        line_at(&p, msg);
    }
}

/// 画面から 1 行 (2026-09-28 オーナー「今どこで止まってどこで動いてるのかもっと細かく見た方が良い」:
/// 取引所の使用権 (trade-lock.ts) の出入りを残す。長すぎる行は切る)
#[tauri::command]
pub fn app_log_write(msg: String) {
    let short: String = msg.chars().take(400).collect();
    line_static(&format!("[画面] {short}"));
}

/// app が手元に無い所 (panic hook、スケジューラ) 用
pub fn line_static(msg: &str) {
    if let Some(p) = path() {
        line_at(&p, msg);
    }
}

pub fn line_at(path: &std::path::Path, msg: &str) {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > ROTATE_BYTES {
            let _ = std::fs::rename(path, path.with_extension("log.1"));
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{} {}", now_text(), msg);
    }
    eprintln!("{msg}");
}

// ============================================================================
// 画面ごとの履歴 (2026-09-30 オーナー「全てにおいて履歴、ログはあとからおかしいってなった時に即見れるような作りにすべき」)
// ============================================================================
//
// app_data_dir/history/<画面>.jsonl に 1 行 1 件 (JSON) で追記する。行の頭に at (日本時間の文字) を足す。
// 2 MB を超えたら <画面>.jsonl.1 に回す (2 世代)。1 件は 200 KB で切る (巨大なツリーで膨らませない)。
// 何を残すかは画面側 (src/services/history.ts の recordHistory)。
//   読み方: 開発側は app_data_dir/history/ を開けばその時の入力と結果が並んでいる

const HISTORY_ROTATE_BYTES: u64 = 2 * 1024 * 1024;
const HISTORY_ENTRY_MAX: usize = 200 * 1024;

/// 画面の名前 → ファイル名 (英小文字・数字・-_ だけ。他は _)
fn history_file(feature: &str) -> Option<PathBuf> {
    let dir = path()?.parent()?.join("history");
    let _ = std::fs::create_dir_all(&dir);
    let name: String = feature.chars().take(40).map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c.to_ascii_lowercase() } else { '_' }).collect();
    Some(dir.join(format!("{}.jsonl", if name.is_empty() { "misc".into() } else { name })))
}

#[tauri::command]
pub fn history_write(feature: String, entry: serde_json::Value) {
    let Some(p) = history_file(&feature) else { return };
    let mut obj = serde_json::Map::new();
    obj.insert("at".into(), serde_json::Value::String(now_text()));
    match entry {
        serde_json::Value::Object(m) => obj.extend(m),
        other => {
            obj.insert("data".into(), other);
        }
    }
    let mut text = serde_json::Value::Object(obj).to_string();
    if text.len() > HISTORY_ENTRY_MAX {
        let head: String = text.chars().take(HISTORY_ENTRY_MAX / 2).collect();
        text = serde_json::json!({ "at": now_text(), "truncated": true, "head": head }).to_string();
    }
    if let Ok(meta) = std::fs::metadata(&p) {
        if meta.len() > HISTORY_ROTATE_BYTES {
            let _ = std::fs::rename(&p, p.with_extension("jsonl.1"));
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&p) {
        let _ = writeln!(f, "{text}");
    }
}

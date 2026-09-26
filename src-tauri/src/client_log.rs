//! ゲームログ (Client.txt) の診断 (2026-09-10)
//!
//! PoE2 は `logs/Client.txt` にエリア移動・システムメッセージ・内部エラーを全部書き出す。
//! ただし GGG のエンジンは無害な CRIT を大量に吐くので (実測で 26 万件中ほぼ全部が無害)、
//! 件数をそのまま見せても意味がない。ここでは既知パターン表で「実害あり / 既知の無害」に
//! 仕分けし、実害ありだけ日別推移と対処法を付けて返す。
//!
//! 公開 API (Tauri command):
//!   - `client_log_status`   … ログの所在・サイズ・更新時刻 (走査なし、軽い)
//!   - `client_log_diagnose` … 末尾 N MB を走査して仕分け結果を返す
//!
//! ログは 200 MB 近くまで育つので、常に末尾から一定バイトだけ読む (既定 64 MB)。
//!
//! 2026-09-26 に 300 行ルールで分割: 走査 (diagnose) は scan.rs。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

mod scan;
mod rules;
mod find;
mod history;
pub use rules::*;
pub use find::*;
pub use history::*;
pub use scan::*;

/// 既定の走査量。末尾 64 MB で概ね 1〜2 週間分。
const DEFAULT_SCAN_MB: u64 = 64;
/// 日別推移を返す日数
const DAILY_DAYS: usize = 14;
/// 未分類メッセージを返す上限
const UNKNOWN_TOP: usize = 12;


// ============================================================================
// 結果構造体
// ============================================================================

#[derive(Serialize, Clone, Debug)]
pub struct DayCount {
    pub date: String,
    pub count: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Finding {
    pub id: String,
    pub severity: Severity,
    pub title: String,
    pub advice: Option<String>,
    pub count: u64,
    /// 直近 DAILY_DAYS 日の件数 (昇順)。無害なものは空
    pub daily: Vec<DayCount>,
    /// 実際の行 (先頭 1 件、200 文字まで)
    pub sample: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct UnknownGroup {
    /// 数値を N に潰した代表文
    pub text: String,
    pub count: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct LogStatus {
    pub found: bool,
    pub path: Option<String>,
    pub size_bytes: u64,
    /// 最終更新 (epoch 秒)
    pub modified_at: Option<u64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct LogDiagnosis {
    pub path: String,
    pub size_bytes: u64,
    pub scanned_bytes: u64,
    pub lines: u64,
    pub first_ts: Option<String>,
    pub last_ts: Option<String>,
    pub crit: u64,
    pub warn: u64,
    pub info: u64,
    pub debug: u64,
    /// 実害あり / 気に留める程度 (件数降順)
    pub findings: Vec<Finding>,
    /// 既知の無害 (件数降順)
    pub noise: Vec<Finding>,
    /// どのルールにも当たらなかった CRIT/WARN/ERROR
    pub unknown: Vec<UnknownGroup>,
}

// ============================================================================
// Tauri commands
// ============================================================================

/// ログの所在だけ返す (走査しないので即返る)
#[tauri::command]
pub fn client_log_status() -> LogStatus {
    let Some(path) = find_client_log() else {
        return LogStatus::default();
    };
    let meta = std::fs::metadata(&path).ok();
    LogStatus {
        found: true,
        path: Some(path.display().to_string()),
        size_bytes: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        modified_at: meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs()),
    }
}

/// 末尾 `scan_mb` MB (既定 64) を走査して診断結果を返す
#[tauri::command]
pub async fn client_log_diagnose(scan_mb: Option<u64>) -> Result<LogDiagnosis, String> {
    let path = find_client_log().ok_or_else(|| {
        "Client.txt が見つかりません (環境変数 EXILEDESK_CLIENT_LOG でパスを指定できます)".to_string()
    })?;
    let mb = scan_mb.unwrap_or(DEFAULT_SCAN_MB);
    tokio::task::spawn_blocking(move || diagnose(&path, mb))
        .await
        .map_err(|e| e.to_string())?
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

// ============================================================================
// 消し込み (処理済みログの削除) と履歴

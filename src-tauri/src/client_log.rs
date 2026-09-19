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

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

mod rules;
mod find;
mod history;
pub use rules::*;
pub use find::*;
pub use history::*;

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
// 走査
// ============================================================================

/// `[CRIT Client 123]` の中身から重大度を判定する
fn level_of(tag: &str) -> Option<&'static str> {
    for lv in ["CRIT", "WARN", "ERROR", "INFO", "DEBUG"] {
        if tag.starts_with(lv) {
            return Some(lv);
        }
    }
    None
}

/// 数値を N に潰して未分類メッセージをまとめる
fn normalize(msg: &str) -> String {
    let mut out = String::with_capacity(msg.len());
    let mut in_digits = false;
    for ch in msg.chars() {
        if ch.is_ascii_digit() {
            if !in_digits {
                out.push('N');
                in_digits = true;
            }
        } else {
            in_digits = false;
            out.push(ch);
        }
        if out.chars().count() >= 80 {
            break;
        }
    }
    out.trim().to_string()
}

struct Acc {
    count: u64,
    daily: HashMap<String, u64>,
    sample: String,
}

/// 末尾 `scan_mb` MB を走査して仕分ける
pub fn diagnose(path: &PathBuf, scan_mb: u64) -> Result<LogDiagnosis, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("ログを開けません: {e}"))?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let want = scan_mb.max(1) * 1024 * 1024;
    let start = size.saturating_sub(want);

    let mut reader = BufReader::with_capacity(1 << 20, file);
    reader
        .seek(SeekFrom::Start(start))
        .map_err(|e| format!("ログを読めません: {e}"))?;
    let mut scrap = Vec::new();
    if start > 0 {
        // 途中から読み始めたので、最初の不完全な行は捨てる
        let _ = reader.read_until(b'\n', &mut scrap);
    }

    let mut lines = 0u64;
    let (mut crit, mut warn, mut info, mut debug) = (0u64, 0u64, 0u64, 0u64);
    let mut first_ts: Option<String> = None;
    let mut last_ts: Option<String> = None;
    let mut per_rule: HashMap<&'static str, Acc> = HashMap::new();
    let mut unknown: HashMap<String, u64> = HashMap::new();

    let mut buf = Vec::with_capacity(512);
    loop {
        buf.clear();
        let n = reader.read_until(b'\n', &mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let line = String::from_utf8_lossy(&buf);
        let line = line.trim_end();
        if line.is_empty() {
            continue;
        }
        lines += 1;

        // 先頭 19 文字が "YYYY/MM/DD HH:MM:SS" ならタイムスタンプ
        let ts = if line.len() >= 19 && line.as_bytes()[4] == b'/' {
            Some(&line[..19])
        } else {
            None
        };
        if let Some(t) = ts {
            if first_ts.is_none() {
                first_ts = Some(t.to_string());
            }
            last_ts = Some(t.to_string());
        }

        // "[LEVEL Client PID] メッセージ"
        let Some(lb) = line.find('[') else { continue };
        let Some(rel) = line[lb..].find(']') else { continue };
        let rb = lb + rel;
        let Some(level) = level_of(&line[lb + 1..rb]) else { continue };
        match level {
            "CRIT" => crit += 1,
            "WARN" | "ERROR" => warn += 1,
            "INFO" => info += 1,
            _ => debug += 1,
        }
        let msg = line[rb + 1..].trim_start_matches([' ', ':']).trim();

        // 既知パターン (レベルを問わず判定: 破損検知などは INFO で出ることがある)
        let hit = RULES.iter().find(|r| line.contains(r.needle));
        match hit {
            Some(rule) => {
                let e = per_rule.entry(rule.id).or_insert_with(|| Acc {
                    count: 0,
                    daily: HashMap::new(),
                    sample: line.chars().take(200).collect(),
                });
                e.count += 1;
                if rule.severity != Severity::Noise {
                    if let Some(t) = ts {
                        *e.daily.entry(t[..10].to_string()).or_insert(0) += 1;
                    }
                }
            }
            None => {
                // 未分類は CRIT/WARN/ERROR だけ集める (INFO はチャット等で量が多い)
                if matches!(level, "CRIT" | "WARN" | "ERROR") && !msg.is_empty() {
                    *unknown.entry(normalize(msg)).or_insert(0) += 1;
                }
            }
        }
    }

    // ルール結果を組み立て
    let mut findings = Vec::new();
    let mut noise = Vec::new();
    for rule in RULES {
        let Some(acc) = per_rule.get(rule.id) else { continue };
        // 同じ title を持つルールが複数あるが、id 単位で出す (bink / video-open)
        let mut daily: Vec<DayCount> = acc
            .daily
            .iter()
            .map(|(d, c)| DayCount { date: d.clone(), count: *c })
            .collect();
        daily.sort_by(|a, b| a.date.cmp(&b.date));
        if daily.len() > DAILY_DAYS {
            daily = daily.split_off(daily.len() - DAILY_DAYS);
        }
        let f = Finding {
            id: rule.id.to_string(),
            severity: rule.severity,
            title: rule.title.to_string(),
            advice: rule.advice.map(str::to_string),
            count: acc.count,
            daily,
            sample: acc.sample.clone(),
        };
        if rule.severity == Severity::Noise {
            noise.push(f);
        } else {
            findings.push(f);
        }
    }
    findings.sort_by(|a, b| {
        (a.severity == Severity::Notice)
            .cmp(&(b.severity == Severity::Notice))
            .then(b.count.cmp(&a.count))
    });
    noise.sort_by(|a, b| b.count.cmp(&a.count));

    let mut unknown: Vec<UnknownGroup> = unknown
        .into_iter()
        .map(|(text, count)| UnknownGroup { text, count })
        .collect();
    unknown.sort_by(|a, b| b.count.cmp(&a.count));
    unknown.truncate(UNKNOWN_TOP);

    Ok(LogDiagnosis {
        path: path.display().to_string(),
        size_bytes: size,
        scanned_bytes: size - start,
        lines,
        first_ts,
        last_ts,
        crit,
        warn,
        info,
        debug,
        findings,
        noise,
        unknown,
    })
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

//! client_log/history.rs — 消し込みの履歴とログの自動ローテート
//!
//! 2026-09-19 に client_log.rs (732 行) から切り出した。
//! サブモジュールは private なので pub にしてもクレートの外には出ない。
use super::*;

// ============================================================================
//
// Client.txt は消さないと 200 MB 近くまで育ち続け、走査も遅くなる。診断が済んだ分は
// 「消し込み」で本体を空にする。ただし件数の推移まで失うと VRAM 警告のような
// 「いつから増えたか」が追えなくなるので、消す前に要約だけ履歴 JSON に残す。

/// 履歴 1 件に残す集計 (フロントが診断結果から詰めて渡す)
#[derive(serde::Deserialize, Serialize, Clone, Debug)]
pub struct HistoryFinding {
    pub id: String,
    pub title: String,
    pub severity: String,
    pub count: u64,
}

#[derive(serde::Deserialize, Serialize, Clone, Debug)]
pub struct HistoryEntry {
    /// 消し込んだ時刻 (epoch 秒)。フロントからは省略可 (サーバー側で埋める)
    #[serde(default)]
    pub cleared_at: u64,
    pub first_ts: Option<String>,
    pub last_ts: Option<String>,
    pub lines: u64,
    pub size_bytes: u64,
    pub findings: Vec<HistoryFinding>,
}

/// 履歴の保存上限 (古いものから捨てる)
pub const HISTORY_MAX: usize = 100;

pub fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("app_local_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("client-log-history.json"))
}

/// 消し込み履歴を古い順に返す
#[tauri::command]
pub fn client_log_history(app: tauri::AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let p = history_path(&app)?;
    let Ok(text) = std::fs::read_to_string(&p) else {
        return Ok(Vec::new());
    };
    Ok(serde_json::from_str(&text).unwrap_or_default())
}

/// 診断結果を履歴に残してから Client.txt を空にする。
///
/// ゲーム起動中はファイルが掴まれていて空にできない (Windows の共有違反) ので、
/// その場合は「ゲームを閉じてください」と返す。ログ自体はゲームが次の起動で作り直す。
#[tauri::command]
pub fn client_log_clear(app: tauri::AppHandle, summary: HistoryEntry) -> Result<LogStatus, String> {
    let path = find_client_log().ok_or_else(|| "Client.txt が見つかりません".to_string())?;

    // 1) 先に履歴を残す (ここで失敗したらログは消さない)
    let mut entries = client_log_history(app.clone())?;
    let mut entry = summary;
    entry.cleared_at = now_secs();
    entries.push(entry);
    if entries.len() > HISTORY_MAX {
        let cut = entries.len() - HISTORY_MAX;
        entries.drain(..cut);
    }
    let hp = history_path(&app)?;
    std::fs::write(&hp, serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?)
        .map_err(|e| format!("履歴を保存できません: {e}"))?;

    // 2) 本体を空にする (削除ではなく 0 バイト化。ゲームはそのまま追記を続けられる)
    let f = std::fs::OpenOptions::new().write(true).open(&path).map_err(|e| {
        if e.raw_os_error() == Some(32) {
            "ゲームがログを使用中のため消せません。PoE2 を閉じてからもう一度実行してください (診断結果は履歴に保存済みです)".to_string()
        } else {
            format!("ログを開けません: {e}")
        }
    })?;
    f.set_len(0).map_err(|e| format!("ログを空にできません: {e}"))?;
    drop(f);

    Ok(client_log_status())
}

/// 自動消し込みの間隔 (既定 7 日)
pub const ROTATE_INTERVAL_DAYS: u64 = 7;

#[derive(Serialize, Clone, Debug)]
pub struct RotateResult {
    /// 実際に消し込んだか
    pub cleared: bool,
    /// 表示用の理由 (未到来 / 実行済み / ゲーム起動中 など)
    pub reason: String,
    /// 次に自動実行される時刻 (epoch 秒)
    pub next_due_at: Option<u64>,
}

/// 起動時に呼ぶ自動消し込み。前回から `days` 日経っていれば、診断 → 履歴保存 → ログを空にする。
///
/// ゲーム起動中は空にできないので、その回は諦めて次の起動でやり直す (履歴は残る)。
#[tauri::command]
pub async fn client_log_auto_rotate(
    app: tauri::AppHandle,
    days: Option<u64>,
) -> Result<RotateResult, String> {
    let interval = days.unwrap_or(ROTATE_INTERVAL_DAYS) * 86400;
    let history = client_log_history(app.clone())?;
    let last = history.last().map(|h| h.cleared_at).unwrap_or(0);
    let now = now_secs();
    let next_due_at = Some(last + interval);

    if last > 0 && now < last + interval {
        return Ok(RotateResult { cleared: false, reason: "not-due".into(), next_due_at });
    }
    let Some(path) = find_client_log() else {
        return Ok(RotateResult { cleared: false, reason: "no-log".into(), next_due_at: None });
    };
    // 初回 (履歴なし) は、まだ小さいログを消さないよう 32 MB 未満なら見送る
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if last == 0 && size < 32 * 1024 * 1024 {
        return Ok(RotateResult { cleared: false, reason: "too-small".into(), next_due_at: None });
    }

    let d = tokio::task::spawn_blocking(move || diagnose(&path, 256))
        .await
        .map_err(|e| e.to_string())??;
    let entry = HistoryEntry {
        cleared_at: 0,
        first_ts: d.first_ts.clone(),
        last_ts: d.last_ts.clone(),
        lines: d.lines,
        size_bytes: d.size_bytes,
        findings: d
            .findings
            .iter()
            .chain(d.noise.iter())
            .map(|f| HistoryFinding {
                id: f.id.clone(),
                title: f.title.clone(),
                severity: format!("{:?}", f.severity).to_lowercase(),
                count: f.count,
            })
            .collect(),
    };
    match client_log_clear(app, entry) {
        Ok(_) => Ok(RotateResult {
            cleared: true,
            reason: "cleared".into(),
            next_due_at: Some(now + interval),
        }),
        // ゲーム起動中: 履歴は保存済みなので、次回起動でまた試す
        Err(e) => Ok(RotateResult { cleared: false, reason: e, next_due_at }),
    }
}

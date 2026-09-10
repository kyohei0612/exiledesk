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

/// 既定の走査量。末尾 64 MB で概ね 1〜2 週間分。
const DEFAULT_SCAN_MB: u64 = 64;
/// 日別推移を返す日数
const DAILY_DAYS: usize = 14;
/// 未分類メッセージを返す上限
const UNKNOWN_TOP: usize = 12;

// ============================================================================
// 既知パターン表
// ============================================================================

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// 実害あり (対処を促す)
    Warn,
    /// 気に留める程度
    Notice,
    /// 既知の無害 (GGG エンジンが常時吐くもの)
    Noise,
}

struct Rule {
    id: &'static str,
    /// 行に含まれていれば一致 (先に書いたものが優先)
    needle: &'static str,
    severity: Severity,
    title: &'static str,
    advice: Option<&'static str>,
}

/// 上から順に判定する。実害ありを先に置くこと。
const RULES: &[Rule] = &[
    // ── 実害あり ────────────────────────────────────────────────
    Rule {
        id: "vram",
        needle: "[TEXTURE] Insufficient VRAM",
        severity: Severity::Warn,
        title: "VRAM 不足でテクスチャを読み込めなかった",
        advice: Some(
            "テクスチャ品質を 1 段下げてください。専用 VRAM を使い切ると共有メモリ (システムメモリ) に溢れ、PC 全体のメモリ逼迫やカクつきの原因になります。",
        ),
    },
    Rule {
        id: "content-corrupt",
        needle: "Marking steam content as corrupt",
        severity: Severity::Warn,
        title: "ゲームファイルの破損を検知",
        advice: Some("Steam の「ゲームファイルの整合性を確認」を実行してください。"),
    },
    Rule {
        id: "device-removed",
        needle: "device removed",
        severity: Severity::Warn,
        title: "GPU デバイスが切り離された",
        advice: Some("グラフィックドライバを更新するか、GPU のオーバークロックを解除してください。"),
    },
    Rule {
        id: "disconnect",
        needle: "Abnormal disconnect",
        severity: Severity::Notice,
        title: "予期しない切断",
        advice: Some("理由はメッセージ末尾に出ます。コントローラーの取り外しでも切断されます。"),
    },
    Rule {
        id: "shader-cache-wipe",
        needle: "Wiping cache ShaderCache",
        severity: Severity::Notice,
        title: "シェーダーキャッシュの再構築",
        advice: Some(
            "ドライバ更新や描画設定の変更直後は正常です。頻発する場合はキャッシュが毎回壊れています。",
        ),
    },
    // ── 既知の無害 (対処不要な理由も書く) ──────────────────────────
    Rule {
        id: "geal",
        needle: "Error executing GEAL",
        severity: Severity::Noise,
        title: "アニメーション / エフェクト層の内部エラー",
        advice: Some(
            "対処不要です。スキルやモンスターの演出スクリプトが実行できなかった記録で、見た目にも性能にも影響しません。全 CRIT の半分近くを占める最多のノイズです。",
        ),
    },
    Rule {
        id: "position-height",
        needle: "Tried to get position height",
        severity: Severity::Noise,
        title: "高さ情報が未確定のまま座標を参照",
        advice: Some("対処不要です。地形の高さがまだ確定していないタイミングで座標を取ろうとしただけで、エンジンが既定値で処理を続けます。"),
    },
    Rule {
        id: "moveto-nan",
        // NaN / infinite の両方を拾う
        needle: "issue a MoveTo with",
        severity: Severity::Noise,
        title: "モンスターの移動速度が未確定",
        advice: Some(
            "対処不要です。スタンや凍結、リチュアルの復活直後など速度が未確定の瞬間に出ます。リチュアルやブリーチを多く回すと増えます。",
        ),
    },
    Rule {
        id: "bone-mapping",
        needle: "in manual mapping when morphing",
        severity: Severity::Noise,
        title: "モデル変形時のボーン対応漏れ",
        advice: Some("対処不要です。装備の見た目を切り替えるときに、対応する骨が無かったという記録です。"),
    },
    Rule {
        id: "mapping-size",
        needle: "Manual mapping size mismatch",
        severity: Severity::Noise,
        title: "モデル変形時のボーン数不一致",
        advice: Some("対処不要です。上と同じくモデル差し替え時の記録です。"),
    },
    Rule {
        id: "anim-timeline",
        needle: "Negative value on timeline for animation",
        severity: Severity::Noise,
        title: "アニメーションの時間指定が負",
        advice: Some("対処不要です。攻撃モーションの再生位置が一瞬マイナスになっただけです。"),
    },
    Rule {
        id: "anim-loop",
        needle: "animation cannot be a looping animation",
        severity: Severity::Noise,
        title: "被弾モーションのループ指定",
        advice: Some("対処不要です。モンスター側のアニメーション定義の不備で、GGG のデータ側の問題です。"),
    },
    Rule {
        id: "effect-pack",
        needle: "Attempted to remove an effect pack",
        severity: Severity::Noise,
        title: "状態異常エフェクトの二重解除",
        advice: Some("対処不要です。着火などの状態異常が消えるときに、既に消えていたという記録です。"),
    },
    Rule {
        id: "controller-ui",
        needle: "SetControllerUIContextLayer",
        severity: Severity::Noise,
        title: "コントローラー UI の階層切り替え",
        advice: Some("対処不要です。コントローラー用 UI の状態遷移の記録です。"),
    },
    Rule {
        id: "atlas-input",
        needle: "Atlas input suspension",
        severity: Severity::Noise,
        title: "アトラス操作の一時停止",
        advice: Some("対処不要です。アトラス画面を開閉するたびに出ます。"),
    },
    Rule {
        id: "maven-table",
        needle: "MavenJewelRadiusKeystones",
        severity: Severity::Noise,
        title: "アトラス用テーブルの引き当て失敗",
        advice: Some("対処不要です。アトラスのノードを表示するたびに出る、GGG 側のデータ定義漏れです。プレイには影響しません。"),
    },
    Rule {
        id: "instance-sync",
        needle: "InstanceClientActionUpdate",
        severity: Severity::Noise,
        title: "サーバーとのオブジェクト同期のズレ",
        advice: Some(
            "基本は対処不要です。サーバーが送ってきた対象がクライアント側にまだ無かっただけで、通常は次の更新で揃います。極端に多い日はラグが出ていた可能性があります。",
        ),
    },
    Rule {
        id: "popup",
        needle: "SetPopupsVisibility",
        severity: Severity::Noise,
        title: "UI ポップアップの表示要求",
        advice: Some("対処不要です。表示条件が揃う前にポップアップを出そうとした UI 側の記録です。"),
    },
    Rule {
        id: "art-variation",
        needle: "GetArtVariationItemInternal",
        severity: Severity::Noise,
        title: "アート差分の読み込み失敗",
        advice: Some("対処不要です。アイテムや装備の見た目バリエーションが見つからず既定の絵で描画された、という記録です。"),
    },
    Rule {
        id: "activation-range",
        needle: "SetExtraActivationRangeAroundTile",
        severity: Severity::Noise,
        title: "レベル生成後の範囲設定",
        advice: Some("対処不要です。マップ生成が終わった後に範囲指定を追加しようとしたときに出ます。"),
    },
    Rule {
        id: "bink",
        needle: "Bink file",
        severity: Severity::Noise,
        title: "演出動画ファイルが見つからない",
        advice: Some(
            "ほぼ対処不要です。カットイン動画が未収録なだけで進行に影響しません。大量に出る場合だけ Steam の整合性確認を試してください。",
        ),
    },
    Rule {
        id: "video-open",
        needle: "[VIDEO] Failed to open file",
        severity: Severity::Noise,
        title: "演出動画ファイルが見つからない",
        advice: Some("ほぼ対処不要です。上と同じで、動画ファイルが無いか読めなかった記録です。"),
    },
    Rule {
        id: "instant-action",
        needle: "Instant/Triggered action",
        severity: Severity::Noise,
        title: "即時発動スキルの同期",
        advice: Some("対処不要です。トリガー系スキルの発動をクライアントが再現できなかった記録で、実際のダメージはサーバー側で処理されています。"),
    },
    Rule {
        id: "vertex-layout",
        needle: "incorrect vertex layout",
        severity: Severity::Noise,
        title: "シェーダーの頂点レイアウト不一致",
        advice: Some("対処不要です。描画側で想定と違う形式を渡しただけで、エンジンが吸収します。"),
    },
];

// ============================================================================
// ログの所在
// ============================================================================

/// Steam の libraryfolders.vdf から追加ライブラリのパスを拾う (サブ PC で D: に入れている場合用)
fn steam_library_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for base in [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
    ] {
        let vdf = PathBuf::from(base).join("steamapps").join("libraryfolders.vdf");
        let Ok(text) = std::fs::read_to_string(&vdf) else { continue };
        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("\"path\"") {
                continue;
            }
            // "path"		"D:\\SteamLibrary"
            if let Some(v) = line.split('"').nth(3) {
                out.push(PathBuf::from(v.replace("\\\\", "\\")));
            }
        }
        out.push(PathBuf::from(base));
    }
    out
}

/// Client.txt の候補を順に探す。環境変数 `EXILEDESK_CLIENT_LOG` が最優先。
pub fn find_client_log() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("EXILEDESK_CLIENT_LOG") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    for root in steam_library_roots() {
        candidates.push(root.join("steamapps/common/Path of Exile 2/logs/Client.txt"));
    }
    for base in [
        r"C:\Program Files (x86)\Grinding Gear Games\Path of Exile 2",
        r"C:\Program Files\Grinding Gear Games\Path of Exile 2",
    ] {
        candidates.push(PathBuf::from(base).join("logs").join("Client.txt"));
    }
    candidates.into_iter().find(|p| p.is_file())
}

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
const HISTORY_MAX: usize = 100;

fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

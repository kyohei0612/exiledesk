//! client_log/scan.rs — Client.txt の末尾を走査して既知パターンで仕分ける (diagnose)
//!
//! client_log.rs から分割 (2026-09-26)。
use super::*;

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

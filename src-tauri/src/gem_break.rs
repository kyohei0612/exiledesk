//! クラフト選定ジェムの集計 (2026-09-16)
//!
//! 「レベル 21 / 品質 23% / 両方 (完成品) のジェムを使っている人数」を数える。
//! poe.ninja の全体集計 (search の dimension) にはレベル / 品質の軸が無いので、
//! アセンダンシー 1 つ分の上位キャラだけ character を取って直接数える
//! (オーナー判断: 「一旦ジェムリングのみで試してもええ」= 1 アセなら 40 リクエスト程度)。
//!
//! 進捗は `gem-break-progress` event で emit する (取得はレート制限で数分かかりうる)。

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::Emitter;

use crate::poe_ninja_client as ninja;

/// 集計 1 行 (ジェム 1 種)
#[derive(Serialize, Clone, Debug, Default)]
pub struct GemBreakRow {
    /// 英語名 (表示時に TS 側で日本語化)
    pub name: String,
    /// そのジェムを使っていた人数
    pub users: u32,
    /// レベル 21 以上で使っていた人数
    pub lvl21: u32,
    /// 品質 23% 以上で使っていた人数
    pub q23: u32,
    /// 両方 (完成品) で使っていた人数
    pub both: u32,
    /// 見えた中で一番高いレベル / 品質
    pub max_level: i64,
    pub max_quality: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct GemBreakResult {
    /// 集計に使ったアセンダンシー
    pub class: String,
    /// そのアセンダンシーの使用率 (%)
    pub percentage: f64,
    /// 実際に取れたキャラ数 (= 母数)
    pub characters: usize,
    pub league: String,
    pub snapshot: String,
    /// 取得時刻 (unix 秒)
    pub fetched_at: i64,
    pub rows: Vec<GemBreakRow>,
}

#[derive(Deserialize)]
pub struct GemBreakRequest {
    /// 省略時は使用率トップのアセンダンシー
    pub class: Option<String>,
    /// 取るキャラ数 (既定 40、上限 100)。JS からは topN で来る
    #[serde(alias = "topN")]
    pub top_n: Option<usize>,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    done: usize,
    total: usize,
    class: String,
}

fn emit(window: &tauri::Window, phase: &'static str, done: usize, total: usize, class: &str) {
    let _ = window.emit("gem-break-progress", Progress { phase, done, total, class: class.to_string() });
}

/// poe.ninja のジェム properties から数値を 1 つ ("Level" → 21、"[Quality]" → "+23%" の 23)
fn prop_num(props: Option<&serde_json::Value>, key: &str) -> Option<i64> {
    for p in props?.as_array()? {
        if p.get("name").and_then(|v| v.as_str()) != Some(key) {
            continue;
        }
        let raw = p
            .get("values")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())?;
        let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
        return digits.parse::<i64>().ok();
    }
    None
}

/// 1 アセンダンシー分を取って集計する。
#[tauri::command]
pub async fn gem_break_fetch(window: tauri::Window, req: GemBreakRequest) -> Result<GemBreakResult, String> {
    let top_n = req.top_n.unwrap_or(40).clamp(5, 100);
    let client = ninja::build_client()?;
    // MOD 一覧の一括取得より緩め (1 アセだけなので急がない。429 を食らうと数分待たされる)
    let gate = ninja::RateGate::new(1500);

    emit(&window, "search", 0, top_n, "");
    let snap = ninja::fetch_index_state(&client, &gate, None).await?;
    let ascs = ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await?;
    let asc = match &req.class {
        Some(c) => ascs.iter().find(|a| &a.class == c).cloned(),
        None => ascs.first().cloned(),
    }
    .ok_or_else(|| "そのアセンダンシーが poe.ninja に見つかりません".to_string())?;

    emit(&window, "search", 0, top_n, &asc.class);
    let refs = ninja::fetch_search_top_n(&client, &gate, &snap, &asc.class, top_n).await?;
    let total = refs.len();

    let mut table: HashMap<String, GemBreakRow> = HashMap::new();
    let mut done = 0usize;
    for r in refs {
        emit(&window, "fetching", done, total, &asc.class);
        let ci = match ninja::fetch_character(&client, &gate, &snap, &r).await {
            Ok(c) => c,
            Err(_) => continue, // 1 人取れなくても集計は続ける
        };
        done += 1;
        // 同じキャラで同じジェムは 1 回だけ数える
        let mut seen: HashSet<&str> = HashSet::new();
        let mut seen_l: HashSet<&str> = HashSet::new();
        let mut seen_q: HashSet<&str> = HashSet::new();
        let mut seen_b: HashSet<&str> = HashSet::new();
        for g in &ci.skills {
            let Some(gems) = g.get("allGems").and_then(|v| v.as_array()) else {
                continue;
            };
            for gem in gems {
                let Some(name) = gem.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
                    continue;
                };
                let item = gem.get("itemData");
                if item.and_then(|d| d.get("support")).and_then(|v| v.as_bool()).unwrap_or(false) {
                    continue; // サポートはレベル / 品質を持たない
                }
                let props = item.and_then(|d| d.get("properties"));
                let lvl = prop_num(props, "Level").unwrap_or(0);
                let q = prop_num(props, "[Quality]").unwrap_or(0);
                let row = table.entry(name.to_string()).or_insert_with(|| GemBreakRow {
                    name: name.to_string(),
                    ..Default::default()
                });
                if seen.insert(name) {
                    row.users += 1;
                }
                if lvl >= 21 && seen_l.insert(name) {
                    row.lvl21 += 1;
                }
                if q >= 23 && seen_q.insert(name) {
                    row.q23 += 1;
                }
                if lvl >= 21 && q >= 23 && seen_b.insert(name) {
                    row.both += 1;
                }
                row.max_level = row.max_level.max(lvl);
                row.max_quality = row.max_quality.max(q);
            }
        }
    }
    emit(&window, "completed", done, total, &asc.class);

    if done == 0 {
        return Err("キャラを 1 人も取れませんでした (poe.ninja のレート制限の可能性)".to_string());
    }
    let mut rows: Vec<GemBreakRow> = table.into_values().collect();
    rows.sort_by(|a, b| b.users.cmp(&a.users).then_with(|| a.name.cmp(&b.name)));
    Ok(GemBreakResult {
        class: asc.class,
        percentage: asc.percentage,
        characters: done,
        league: snap.league_url.clone(),
        snapshot: snap.snapshot_name.clone(),
        fetched_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
        rows,
    })
}

/// 選べるアセンダンシー (使用率降順)。UI のプルダウン用。
#[tauri::command]
pub async fn gem_break_ascendancies() -> Result<Vec<ninja::AscendancyMeta>, String> {
    let client = ninja::build_client()?;
    let gate = ninja::RateGate::new(1500);
    let snap = ninja::fetch_index_state(&client, &gate, None).await?;
    ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await
}

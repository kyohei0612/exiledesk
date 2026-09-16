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
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

/// 取得中に「中止」が押されたか (レート制限待ちが長い時の逃げ道)
static CANCEL: AtomicBool = AtomicBool::new(false);

/// 取得を中止する。走っているループが次のキャラに移る時に見て抜ける。
#[tauri::command]
pub fn gem_break_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

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
    /// コラプト済みで使っていた人数
    pub corrupted: u32,
    /// レベルの分布 (レベル, 人数) レベル昇順。同じキャラの同じレベルは 1 回
    pub level_dist: Vec<(i64, u32)>,
    /// 品質の分布 (品質, 人数) 昇順
    pub quality_dist: Vec<(i64, u32)>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GemBreakResult {
    /// 集計に使ったアセンダンシー (複数なら "上位 N アセ合算")
    pub class: String,
    /// 実際に見たアセンダンシー名
    pub classes: Vec<String>,
    /// そのアセンダンシーの使用率 (%)
    pub percentage: f64,
    /// 実際に取れたキャラ数 (= 母数)
    pub characters: usize,
    /// 取ろうとしたキャラ数 (これより少なければレート制限や中止で打ち切られている)
    pub requested: usize,
    /// 中止ボタンで打ち切ったか
    pub cancelled: bool,
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
    /// 何アセンダンシーに散らすか (既定 1 = class だけ)。2 以上なら使用率上位から均等に取る
    #[serde(alias = "spread")]
    pub spread: Option<usize>,
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


/// 1 キャラの中の 1 ジェム (サポート以外)
struct GemView {
    name: String,
    /// poe.ninja の表示値 (装備やアセの「+X to Level of Skills」込み)
    level: i64,
    quality: i64,
    corrupted: bool,
}

/// キャラの skills[] から、サポート以外のジェムを平たく取り出す。
fn gems_of(ci: &ninja::CharacterItems) -> Vec<GemView> {
    let mut out = Vec::new();
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
            out.push(GemView {
                name: name.to_string(),
                level: prop_num(props, "Level").unwrap_or(0),
                quality: prop_num(props, "[Quality]").unwrap_or(0),
                corrupted: item.and_then(|d| d.get("corrupted")).and_then(|v| v.as_bool()).unwrap_or(false),
            });
        }
    }
    out
}

/// 装備 / アセンダンシー由来の底上げ量を推定する (2026-09-16)。
///
/// poe.ninja の `Level` は「+1 to Level of all Skills」などを **足した表示値** なので、
/// そのまま 21 以上を数えるとコラプトしていないジェムまで数えてしまう
/// (実例: Herald of Plague が corrupted=false で Level 21)。
/// コラプトしていないジェムは素の上限が 20 (品質は 20%) なので、
/// 「コラプトしていないジェムのうち上限付近の値の最頻値 − 20」を底上げ量とみなす。
/// 最頻値を使うのは、タグ限定の +レベル (例: 冷気スキルだけ +2) に引っ張られないようにするため。
fn gear_bonus(gems: &[GemView], pick_level: bool) -> i64 {
    let near_max = if pick_level { 18 } else { 15 };
    let mut counts: HashMap<i64, u32> = HashMap::new();
    for g in gems {
        if g.corrupted {
            continue;
        }
        let v = if pick_level { g.level } else { g.quality };
        if v >= near_max {
            *counts.entry(v).or_insert(0) += 1;
        }
    }
    let best = counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)))
        .map(|(v, _)| v)
        .unwrap_or(20);
    (best - 20).max(0)
}

/// 1 つ (または使用率上位いくつか) のアセンダンシーの上位キャラを取って集計する。
#[tauri::command]
pub async fn gem_break_fetch(window: tauri::Window, req: GemBreakRequest) -> Result<GemBreakResult, String> {
    let top_n = req.top_n.unwrap_or(40).clamp(5, 100);
    let spread = req.spread.unwrap_or(1).clamp(1, 10);
    CANCEL.store(false, Ordering::Relaxed);
    let client = ninja::build_client()?;
    // MOD 一覧の一括取得より緩め (1 アセだけなので急がない。429 を食らうと数分待たされる)
    let gate = ninja::RateGate::new(1500);

    emit(&window, "search", 0, top_n, "");
    let snap = ninja::fetch_index_state(&client, &gate, None).await?;
    let ascs = ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await?;

    // 対象アセンダンシー: spread=1 なら指定 1 つ、2 以上なら使用率上位から spread 個
    let targets: Vec<ninja::AscendancyMeta> = if spread <= 1 {
        let a = match &req.class {
            Some(c) => ascs.iter().find(|a| &a.class == c).cloned(),
            None => ascs.first().cloned(),
        }
        .ok_or_else(|| "そのアセンダンシーが poe.ninja に見つかりません".to_string())?;
        vec![a]
    } else {
        ascs.iter().take(spread).cloned().collect()
    };
    if targets.is_empty() {
        return Err("アセンダンシーが取れませんでした".to_string());
    }
    // 散らす時は 1 アセあたりの人数を割る (合計はだいたい top_n)
    let per_asc = ((top_n as f64) / targets.len() as f64).ceil() as usize;

    let mut table: HashMap<String, GemBreakRow> = HashMap::new();
    // ジェムごとの分布 (レベル / 品質 → 人数)。同じキャラの同じ値は 1 回
    let mut level_dist: HashMap<String, HashMap<i64, u32>> = HashMap::new();
    let mut quality_dist: HashMap<String, HashMap<i64, u32>> = HashMap::new();
    let mut done = 0usize;
    let mut planned = 0usize;

    'outer: for asc in &targets {
        if CANCEL.load(Ordering::Relaxed) {
            break;
        }
        emit(&window, "search", done, planned.max(top_n), &asc.class);
        let refs = match ninja::fetch_search_top_n(&client, &gate, &snap, &asc.class, per_asc).await {
            Ok(r) => r,
            Err(_) => continue, // 1 アセ取れなくても他は続ける
        };
        planned += refs.len();
        for r in refs {
            if CANCEL.load(Ordering::Relaxed) {
                break 'outer;
            }
            emit(&window, "fetching", done, planned.max(top_n), &asc.class);
            let ci = match ninja::fetch_character(&client, &gate, &snap, &r).await {
                Ok(c) => c,
                Err(_) => continue, // 1 人取れなくても集計は続ける
            };
            done += 1;
            let gems = gems_of(&ci);
            // 装備 / アセの底上げを引いて、ジェム自身のレベル / 品質に戻す
            let lvl_bonus = gear_bonus(&gems, true);
            let q_bonus = gear_bonus(&gems, false);
            // 同じキャラで同じジェムは 1 回だけ数える
            let mut seen: HashSet<String> = HashSet::new();
            let mut seen_l: HashSet<String> = HashSet::new();
            let mut seen_q: HashSet<String> = HashSet::new();
            let mut seen_b: HashSet<String> = HashSet::new();
            let mut seen_c: HashSet<String> = HashSet::new();
            // 分布は (ジェム, 値) 単位で 1 回
            let mut seen_ld: HashSet<(String, i64)> = HashSet::new();
            let mut seen_qd: HashSet<(String, i64)> = HashSet::new();
            for gem in &gems {
                let name = gem.name.clone();
                // ジェム自身の値 (コラプトで上がった分だけが 20 / 20% を超える)
                let lvl = (gem.level - lvl_bonus).max(0);
                let q = (gem.quality - q_bonus).max(0);
                let row = table.entry(name.clone()).or_insert_with(|| GemBreakRow {
                    name: name.clone(),
                    ..Default::default()
                });
                if seen.insert(name.clone()) {
                    row.users += 1;
                }
                // コラプト済みでなければ 21 / 23% にはならない (推定を外した時の保険)
                let lvl_ok = gem.corrupted && lvl >= 21;
                let q_ok = gem.corrupted && q >= 23;
                if lvl_ok && seen_l.insert(name.clone()) {
                    row.lvl21 += 1;
                }
                if q_ok && seen_q.insert(name.clone()) {
                    row.q23 += 1;
                }
                if lvl_ok && q_ok && seen_b.insert(name.clone()) {
                    row.both += 1;
                }
                if gem.corrupted && seen_c.insert(name.clone()) {
                    row.corrupted += 1;
                }
                row.max_level = row.max_level.max(lvl);
                row.max_quality = row.max_quality.max(q);
                if lvl > 0 && seen_ld.insert((name.clone(), lvl)) {
                    *level_dist.entry(name.clone()).or_default().entry(lvl).or_insert(0) += 1;
                }
                if seen_qd.insert((name.clone(), q)) {
                    *quality_dist.entry(name.clone()).or_default().entry(q).or_insert(0) += 1;
                }
            }
        }
    }
    let label = if targets.len() == 1 {
        targets[0].class.clone()
    } else {
        format!("上位 {} アセ合算", targets.len())
    };
    emit(&window, "completed", done, planned.max(done), &label);

    if done == 0 {
        return Err(if CANCEL.load(Ordering::Relaxed) {
            "中止しました (1 人も取れていません)".to_string()
        } else {
            "キャラを 1 人も取れませんでした (poe.ninja のレート制限の可能性)".to_string()
        });
    }
    let mut rows: Vec<GemBreakRow> = table.into_values().collect();
    for row in &mut rows {
        if let Some(m) = level_dist.remove(&row.name) {
            let mut v: Vec<(i64, u32)> = m.into_iter().collect();
            v.sort_by_key(|(k, _)| *k);
            row.level_dist = v;
        }
        if let Some(m) = quality_dist.remove(&row.name) {
            let mut v: Vec<(i64, u32)> = m.into_iter().collect();
            v.sort_by_key(|(k, _)| *k);
            row.quality_dist = v;
        }
    }
    rows.sort_by(|a, b| b.users.cmp(&a.users).then_with(|| a.name.cmp(&b.name)));
    Ok(GemBreakResult {
        class: label,
        classes: targets.iter().map(|a| a.class.clone()).collect(),
        percentage: targets.iter().map(|a| a.percentage).sum(),
        characters: done,
        requested: top_n,
        cancelled: CANCEL.load(Ordering::Relaxed),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn g(name: &str, level: i64, quality: i64, corrupted: bool) -> GemView {
        GemView { name: name.to_string(), level, quality, corrupted }
    }

    /// 底上げ無し: コラプトしていない最大レベルが 20 なら 0
    #[test]
    fn gear_bonus_is_zero_without_plus_levels() {
        let gems = vec![g("A", 20, 20, false), g("B", 20, 0, false), g("C", 21, 20, true)];
        assert_eq!(gear_bonus(&gems, true), 0);
    }

    /// 「+1 to Level of all Skills」: コラプトしていないジェムが軒並み 21 なら 1
    #[test]
    fn gear_bonus_detects_global_plus_one() {
        let gems = vec![g("A", 21, 20, false), g("B", 21, 20, false), g("C", 22, 20, true)];
        assert_eq!(gear_bonus(&gems, true), 1);
    }

    /// タグ限定の +2 (少数派) には引っ張られない
    #[test]
    fn gear_bonus_ignores_minority_tag_bonus() {
        let gems = vec![
            g("A", 21, 20, false),
            g("B", 21, 20, false),
            g("C", 21, 20, false),
            g("D", 23, 20, false), // 冷気スキルだけ +2 のような例外
        ];
        assert_eq!(gear_bonus(&gems, true), 1);
    }

    /// 上限付近のジェムが無ければ底上げ 0 とみなす (低レベルの補助ジェムだけの時)
    #[test]
    fn gear_bonus_falls_back_to_zero() {
        let gems = vec![g("A", 10, 0, false), g("B", 1, 0, false)];
        assert_eq!(gear_bonus(&gems, true), 0);
    }

    /// 品質も同じ扱い (素の上限 20%)
    #[test]
    fn gear_bonus_handles_quality() {
        let gems = vec![g("A", 20, 20, false), g("B", 20, 20, false), g("C", 20, 23, true)];
        assert_eq!(gear_bonus(&gems, false), 0);
    }
}


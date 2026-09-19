//! gem_break/count.rs — キャラの持ち物からジェムを数える (装備の +1 を引いてコラプト済みだけを 21 / 23% とする)
//!
//! 2026-09-19 に gem_break.rs (584 行) から切り出した。
use super::*;

/// poe.ninja のジェム properties から数値を 1 つ ("Level" → 21、"[Quality]" → "+23%" の 23)
pub fn prop_num(props: Option<&serde_json::Value>, key: &str) -> Option<i64> {
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
pub struct GemView {
    pub name: String,
    /// poe.ninja の表示値 (装備やアセの「+X to Level of Skills」込み)
    pub level: i64,
    pub quality: i64,
    pub corrupted: bool,
}

/// キャラの skills[] から、サポート以外のジェムを平たく取り出す。
pub fn gems_of(ci: &ninja::CharacterItems) -> Vec<GemView> {
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

/// キャラごとのジェムから集計表を作る。
///
/// 2026-09-18: キャッシュだけで組み立てる経路 (try_offline) と同じ計算を使うため関数にした。
pub fn aggregate(per_char: &[Vec<GemView>]) -> Vec<GemBreakRow> {
    let mut table: HashMap<String, GemBreakRow> = HashMap::new();
    // ジェムごとの分布 (レベル / 品質 → 人数)。同じキャラの同じ値は 1 回
    let mut level_dist: HashMap<String, HashMap<i64, u32>> = HashMap::new();
    let mut quality_dist: HashMap<String, HashMap<i64, u32>> = HashMap::new();
    for gems in per_char {
        // 装備 / アセの底上げを引いて、ジェム自身のレベル / 品質に戻す
        let lvl_bonus = gear_bonus(gems, true);
        let q_bonus = gear_bonus(gems, false);
        // 同じキャラで同じジェムは 1 回だけ数える
        let mut seen: HashSet<String> = HashSet::new();
        let mut seen_l: HashSet<String> = HashSet::new();
        let mut seen_q: HashSet<String> = HashSet::new();
        let mut seen_b: HashSet<String> = HashSet::new();
        let mut seen_c: HashSet<String> = HashSet::new();
        // 分布は (ジェム, 値) 単位で 1 回
        let mut seen_ld: HashSet<(String, i64)> = HashSet::new();
        let mut seen_qd: HashSet<(String, i64)> = HashSet::new();
        for gem in gems {
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
    rows
}

/// キャッシュだけで結果を組み立てられるなら組み立てる (poe.ninja には一切問い合わせない)。
///
/// 条件: 同じ条件の検索結果が SEARCH_FRESH_SECS 以内にあり、その顔ぶれのジェムが全員分あること。
/// 新しい PC では同梱データがそのまま使えるので、初回から 1 リクエストも要らない。
pub fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn try_offline(
    window: Option<&tauri::Window>,
    app: &tauri::AppHandle,
    class: String,
    top_n: usize,
    now: i64,
) -> Option<GemBreakResult> {
    let cache = gcache::load_raw(app)?;
    let hit = cache.searches.get(&gcache::search_key(&class, top_n))?;
    if now - hit.fetched_at >= gcache::SEARCH_FRESH_SECS || hit.chars.is_empty() {
        return None;
    }
    let mut per_char: Vec<Vec<GemView>> = Vec::with_capacity(hit.chars.len());
    for (account, name) in &hit.chars {
        let c = cache.characters.get(&gcache::char_key(account, name))?;
        per_char.push(from_cached(&c.gems));
    }
    let label = if class.is_empty() { "全アセンダンシー".to_string() } else { class.clone() };
    let n = per_char.len();
    if let Some(w) = window {
        emit(w, "completed", n, n, &label, n);
    }
    let out = GemBreakResult {
        class: label,
        classes: vec![class],
        percentage: 100.0,
        characters: n,
        reused: n,
        requested: top_n,
        cancelled: false,
        league: cache.league.clone(),
        snapshot: cache.snapshot_name.clone(),
        // キャッシュから組み立てた時は「いつ取ったか」を偽らない (元の取得時刻を出す)
        fetched_at: hit.fetched_at,
        rows: aggregate(&per_char),
    };
    // 通信経路と同じく app_data にも残す (同梱データにする時はこのファイルを使う)
    save_result(app, &out);
    Some(out)
}

/// キャッシュに残す形 (poe.ninja の表示値のまま)
pub fn to_cached(gems: &[GemView]) -> Vec<gcache::CachedGem> {
    gems.iter()
        .map(|g| gcache::CachedGem { name: g.name.clone(), level: g.level, quality: g.quality, corrupted: g.corrupted })
        .collect()
}

/// キャッシュから集計用に戻す
pub fn from_cached(gems: &[gcache::CachedGem]) -> Vec<GemView> {
    gems.iter()
        .map(|g| GemView { name: g.name.clone(), level: g.level, quality: g.quality, corrupted: g.corrupted })
        .collect()
}

/// 装備 / アセンダンシー由来の底上げ量を推定する (2026-09-16)。
///
/// poe.ninja の `Level` は「+1 to Level of all Skills」などを **足した表示値** なので、
/// そのまま 21 以上を数えるとコラプトしていないジェムまで数えてしまう
/// (実例: Herald of Plague が corrupted=false で Level 21)。
/// コラプトしていないジェムは素の上限が 20 (品質は 20%) なので、
/// 「コラプトしていないジェムのうち上限付近の値の最頻値 − 20」を底上げ量とみなす。
/// 最頻値を使うのは、タグ限定の +レベル (例: 冷気スキルだけ +2) に引っ張られないようにするため。
pub fn gear_bonus(gems: &[GemView], pick_level: bool) -> i64 {
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


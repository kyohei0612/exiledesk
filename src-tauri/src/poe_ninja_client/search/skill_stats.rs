//! poe_ninja_client/search/skill_stats.rs — search の集計 + 辞書から poe.ninja のスキル使用率を組む
//!
//! search.rs から分割 (2026-09-26)。
use super::*;

/// スキル使用率に使う search の集計 (poe.ninja の Main Skills / Spirit Skills / All Skills)
pub(crate) const SKILL_DIMENSIONS: &[&str] = &["skills", "spiritgems", "allskills"];
/// 1 一覧に残す件数の上限 (キャッシュと emit を膨らませないため)
const SKILL_STATS_MAX: usize = 300;

/// 辞書はハッシュで中身が決まるので、プロセス内で使い回す (クラスごとに取り直さない)。
static DICTIONARY_CACHE: OnceLock<StdMutex<HashMap<String, Arc<Vec<String>>>>> = OnceLock::new();

/// `/poe2/api/builds/dictionary/{hash}` を取って名前の配列にする (2026-09-14)。
pub(crate) async fn fetch_dictionary(client: &Client, gate: &RateGate, hash: &str) -> Result<Arc<Vec<String>>, String> {
    let cache = DICTIONARY_CACHE.get_or_init(|| StdMutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().ok().and_then(|m| m.get(hash).cloned()) {
        return Ok(hit);
    }
    let url = format!("{NINJA_BASE}/poe2/api/builds/dictionary/{hash}", hash = url_encode(hash));
    let resp = http_get_with_backoff(client, gate, &url).await?;
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("dictionary bytes read error: {e}"))?;
    let names = decode_ninja_dictionary(&bytes)
        .ok_or_else(|| format!("dictionary {hash}: NDIC 形式として読めない ({} バイト)、poe.ninja の形式変更の可能性", bytes.len()))?;
    let names = Arc::new(names);
    if let Ok(mut m) = cache.lock() {
        m.insert(hash.to_string(), names.clone());
    }
    Ok(names)
}

/// search の集計から poe.ninja のスキル使用率を組む (必要な辞書だけ取る)。集計が無ければ None。
pub(crate) async fn skill_stats_from_summary(client: &Client, gate: &RateGate, summary: &SearchSummary) -> Result<Option<SkillUsageStats>, String> {
    let mut dicts: HashMap<String, Arc<Vec<String>>> = HashMap::new();
    for id in SKILL_DIMENSIONS {
        let Some(dim) = summary.dimensions.iter().find(|d| d.id == *id) else {
            continue;
        };
        if dicts.contains_key(&dim.dictionary) {
            continue;
        }
        let hash = summary
            .dictionaries
            .get(&dim.dictionary)
            .ok_or_else(|| format!("search: 辞書 {} のハッシュが無い", dim.dictionary))?;
        let names = fetch_dictionary(client, gate, hash).await?;
        dicts.insert(dim.dictionary.clone(), names);
    }
    if dicts.is_empty() {
        return Ok(None);
    }
    Ok(Some(build_skill_stats(summary, &dicts)))
}

/// 調査用 (examples/ninja_skills_probe.rs): 1 クラス分の search + 辞書から poe.ninja のスキル使用率を組む。
pub async fn fetch_skill_stats_for_class(client: &Client, gate: &RateGate, snapshot: &SnapshotMeta, class: &str) -> Result<Option<SkillUsageStats>, String> {
    let search = fetch_search(client, gate, snapshot, class, 1).await?;
    skill_stats_from_summary(client, gate, &search.summary).await
}

/// search の集計 + 辞書から、poe.ninja と同じスキル使用率 (人数降順) を組む。
pub(crate) fn build_skill_stats(summary: &SearchSummary, dicts: &HashMap<String, Arc<Vec<String>>>) -> SkillUsageStats {
    let list = |id: &str| -> Vec<GemUsageCount> {
        let Some(dim) = summary.dimensions.iter().find(|d| d.id == id) else {
            return Vec::new();
        };
        let Some(names) = dicts.get(&dim.dictionary) else {
            return Vec::new();
        };
        let mut v: Vec<GemUsageCount> = dim
            .counts
            .iter()
            .filter_map(|(k, c)| names.get(*k as usize).map(|n| GemUsageCount { name: n.clone(), count: *c }))
            .collect();
        v.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
        v.truncate(SKILL_STATS_MAX);
        v
    };
    SkillUsageStats { total: summary.total, main: list("skills"), spirit: list("spiritgems"), all: list("allskills") }
}

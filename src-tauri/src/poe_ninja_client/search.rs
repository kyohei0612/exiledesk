//! build-index-state (アセ使用率) / search (上位 N 人) / character (items[]) の取得とアカウント名検証
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

/// `/poe2/api/data/build-index-state` を叩いて、現リーグの全アセンダンシー使用率を取得。
///
/// レスポンス構造 (実機確認 2026-05-22):
/// ```json
/// {
///   "leagueBuilds": [
///     {
///       "leagueName": "Fate of the Vaal",
///       "leagueUrl": "vaal",
///       "total": 124108,
///       "statistics": [ { "class": "Blood Mage", "percentage": 17.09 }, ... ]
///     },
///     { "leagueName": "HC Fate of the Vaal", "leagueUrl": "vaalhc", ... },
///     ...
///   ]
/// }
/// ```
/// `leagueBuilds` は **配列**。leagueUrl が一致する要素を線形検索する (HC/SSF を除く本リーグを優先)。
pub async fn fetch_build_index_state(
    client: &Client,
    gate: &RateGate,
    league_url: &str,
) -> Result<Vec<AscendancyMeta>, String> {
    let url = format!("{NINJA_BASE}/poe2/api/data/build-index-state");
    let resp = http_get_with_backoff(client, gate, &url).await?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("build-index-state json parse error: {e}"))?;

    // leagueBuilds は配列。leagueUrl で一致を線形検索、見つからなければ先頭。
    let league_builds = body
        .get("leagueBuilds")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "build-index-state: leagueBuilds (array) missing".to_string())?;

    let league_node = league_builds
        .iter()
        .find(|entry| {
            entry
                .get("leagueUrl")
                .and_then(|v| v.as_str())
                .map(|s| s == league_url)
                .unwrap_or(false)
        })
        .or_else(|| league_builds.first())
        .ok_or_else(|| {
            format!("build-index-state: leagueBuilds[{league_url}] missing")
        })?;

    let stats = league_node
        .get("statistics")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            format!("build-index-state: statistics missing in leagueBuilds[{league_url}]")
        })?;

    let mut out: Vec<AscendancyMeta> = stats
        .iter()
        .filter_map(|s| {
            let class = s.get("class")?.as_str()?.to_string();
            let percentage = s.get("percentage")?.as_f64()?;
            Some(AscendancyMeta { class, percentage })
        })
        .collect();

    // 使用率降順 (人気順優先 = キュー投入順)
    out.sort_by(|a, b| {
        b.percentage
            .partial_cmp(&a.percentage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(out)
}

/// search 1 回で取れる物: 上位 N 人 + そのクラスの全キャラの集計 (スキル使用率など)。
pub(crate) struct SearchResult {
    pub characters: Vec<CharacterRef>,
    pub summary: SearchSummary,
}

/// `/poe2/api/builds/{version}/search?...` を叩いて上位 N 人を抽出。
///
/// Phase α B 案 (printable string + label-based slicing) を Rust に移植。
/// 戻り値: 上位 n 件の (account, name) ペア。
pub async fn fetch_search_top_n(
    client: &Client,
    gate: &RateGate,
    snapshot: &SnapshotMeta,
    class: &str,
    n: usize,
) -> Result<Vec<CharacterRef>, String> {
    fetch_search(client, gate, snapshot, class, n).await.map(|r| r.characters)
}

/// search を 1 回叩いて、上位 N 人と集計部分 (2026-09-14) を両方返す。
pub(crate) async fn fetch_search(
    client: &Client,
    gate: &RateGate,
    snapshot: &SnapshotMeta,
    class: &str,
    n: usize,
) -> Result<SearchResult, String> {
    let url = format!(
        "{NINJA_BASE}/poe2/api/builds/{version}/search?overview={overview}&class={class}&sort=dps",
        version = url_encode(&snapshot.version),
        overview = url_encode(&snapshot.snapshot_name),
        class = url_encode(class),
    );
    let resp = http_get_with_backoff(client, gate, &url).await?;
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("search bytes read error: {e}"))?;

    // カラム型 protobuf を構造的にパースして "name" / "account" 列を引く。
    let columns = extract_search_columns(&bytes);
    let names = columns.get("name").map(Vec::as_slice).unwrap_or_default();
    let accounts = columns.get("account").map(Vec::as_slice).unwrap_or_default();

    if names.is_empty() || accounts.is_empty() {
        return Err(format!(
            "search: name/account 列が取れない (name={}, account={}, 検出列=[{}])。\
             poe.ninja search のレスポンス構造変更の可能性",
            names.len(),
            accounts.len(),
            columns.keys().cloned().collect::<Vec<_>>().join(", "),
        ));
    }

    let pair_count = accounts.len().min(names.len()).min(n);
    let mut pairs = Vec::with_capacity(pair_count);
    for i in 0..pair_count {
        let acct = &accounts[i];
        let nm = &names[i];
        if !is_valid_account(acct) {
            continue;
        }
        pairs.push(CharacterRef {
            account: acct.clone(),
            name: nm.clone(),
        });
    }
    Ok(SearchResult { characters: pairs, summary: parse_search_summary(&bytes) })
}

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

/// `/poe2/api/builds/{version}/character?account=...&name=...&overview=...&timeMachine=`
/// を叩いて items[] 配列を抽出。
pub async fn fetch_character(
    client: &Client,
    gate: &RateGate,
    snapshot: &SnapshotMeta,
    char_ref: &CharacterRef,
) -> Result<CharacterItems, String> {
    let url = format!(
        "{NINJA_BASE}/poe2/api/builds/{version}/character?account={account}&name={name}&overview={overview}&timeMachine=",
        version = url_encode(&snapshot.version),
        account = url_encode(&char_ref.account),
        name = url_encode(&char_ref.name),
        overview = url_encode(&snapshot.snapshot_name),
    );
    let resp = http_get_with_backoff(client, gate, &url).await?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("character json parse error: {e}"))?;

    let items = body
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let skills = body
        .get("skills")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(CharacterItems {
        account: char_ref.account.clone(),
        name: char_ref.name.clone(),
        items,
        skills,
    })
}


// ============================================================================
// バリデーション
// ============================================================================

/// `<アカウント名>-<4 桁 discriminator>` 形式かの手書きチェック
/// (regex crate を増やしたくないため)。
///
/// 2026-09-07: 先頭部の「ASCII 英数字 + `_` のみ」制約を撤廃した。
/// 旧実装は `我的的的发-4378` / `썽아티비-1234` のような非 ASCII アカウント名を
/// 全部弾いており、上位プレイヤーの実に 2〜3 割 (中国語・韓国語圏) が
/// 集計から欠落していた。
///
/// 厳密な文字種チェックが必要だったのは、旧パーサが protobuf をフラットに
/// 舐めてゴミ文字列を拾う可能性があったため。現在は `account` カラムから
/// 構造的に取り出しているのでゴミは混入しない。ここでは
/// 「末尾が `-` + 4 桁数字」「先頭部が 1〜32 文字で制御文字を含まない」
/// だけを最低限のサニティチェックとして残す。
pub(crate) fn is_valid_account(s: &str) -> bool {
    let bytes = s.as_bytes();
    let n = bytes.len();
    // 最短: 先頭 1 バイト + '-' + 4 桁
    if n < 1 + 1 + 4 {
        return false;
    }
    // 末尾 4 桁が数字、その直前が '-'
    if bytes[n - 5] != b'-' {
        return false;
    }
    if !bytes[n - 4..].iter().all(u8::is_ascii_digit) {
        return false;
    }
    // 先頭部 (discriminator を除いた部分) を文字数で検査。
    // バイト長ではなく char 数で数えないと、マルチバイト名が長さ上限に引っかかる。
    let head = &s[..n - 5];
    let head_chars = head.chars().count();
    (1..=32).contains(&head_chars) && !head.chars().any(char::is_control)
}

//! ジェムの売れ行き追跡 (2026-09-16)
//!
//! オーナー要望: 「さばきが速いジェムを探したい。アプリがオンラインの間ずっと 1 時間に 1 回、
//! クラフト選定ジェムで完成品 5 人以上のジェムの売れ行きを見たい」。
//!
//! 測り方 (オーナー案の「ID が消えたか」より素直な方法):
//!   1. **滞留時間**: trade2 の fetch が返す `listing.indexed` (出品時刻) を見て、
//!      今並んでいる最安 10 件が「何分前に出された物か」の中央値を取る。
//!      さばきが速い市場ほど新しい出品しか残らない = 中央値が短い。1 回の取得で分かる。
//!   2. **出品総数の推移**: search の `total` を 1 時間ごとに記録。増え続ける = 供給過多。
//!   ID の消失は「売れた / 値下げ再出品 / 取り消し / オフライン」を区別できないので主軸にしない。
//!
//! 取得量: 1 ジェムあたり search 1 + fetch 1 = 2 リクエスト / 時。
//! trade2 の制限 (5/10 秒, 15/60 秒, 30/5 分, 600/6 時間) に対して 8 秒間隔で流す。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 追跡するジェム 1 種
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrackedGem {
    /// 英語名 (trade2 の type にそのまま使う)
    pub name: String,
    /// クラフト選定ジェムで「完成品 (レベル 21 かつ品質 23%)」を使っていた人数
    pub finished_users: u32,
    /// そのジェムの使用者数
    pub users: u32,
}

/// 1 回のサンプル
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FlowSample {
    /// unix 秒
    pub t: i64,
    /// 条件に合う出品の総数
    pub total: u64,
    /// 見た出品のうち「出品されてからの経過分」の中央値 (取れなければ None)
    pub median_age_min: Option<i64>,
    /// 実際に見た出品数 (最大 10)
    pub seen: usize,
    /// 最安値 (そのままの通貨)
    pub cheapest_amount: Option<f64>,
    pub cheapest_currency: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GemFlowStore {
    /// 最後にサンプルを取った時刻 (unix 秒)
    pub sampled_at: i64,
    /// 追跡リストを更新した時刻 (クラフト選定ジェムの取得時刻)
    pub list_refreshed_at: i64,
    /// trade2 のリーグ名
    pub league: String,
    /// "jp" / "www"
    pub site: String,
    pub gems: Vec<TrackedGem>,
    /// ジェム英語名 → サンプル列 (古い順)
    pub samples: std::collections::HashMap<String, Vec<FlowSample>>,
}

/// 1 ジェムあたり保持するサンプル数 (1 時間ごと = 30 日分)
const MAX_SAMPLES: usize = 24 * 30;
/// リクエストの間隔 (trade2 の 30 回 / 5 分に対して余裕を持たせる)
const REQUEST_INTERVAL: Duration = Duration::from_secs(8);
/// サンプリング周期
const SAMPLE_INTERVAL: Duration = Duration::from_secs(3600);

static SAMPLING: AtomicBool = AtomicBool::new(false);

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("gem_flow.json");
    Ok(dir)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn load_store(app: &tauri::AppHandle) -> GemFlowStore {
    let Ok(p) = store_path(app) else {
        return GemFlowStore::default();
    };
    let Ok(text) = fs::read_to_string(&p) else {
        return GemFlowStore::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_store(app: &tauri::AppHandle, store: &GemFlowStore) -> Result<(), String> {
    let p = store_path(app)?;
    let text = serde_json::to_string(store).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(&p, text).map_err(|e| format!("write {p:?}: {e}"))
}

// ============================================================================
// Tauri commands
// ============================================================================

/// 保存済みの売れ行きデータを返す (UI 表示用)
#[tauri::command]
pub fn gem_flow_load(app: tauri::AppHandle) -> Result<GemFlowStore, String> {
    Ok(load_store(&app))
}

#[derive(Deserialize)]
pub struct SetTrackedRequest {
    pub gems: Vec<TrackedGem>,
    pub league: String,
    #[serde(default)]
    pub site: Option<String>,
}

/// 追跡するジェムを入れ替える (クラフト選定ジェムの取得後にフロントから呼ぶ)。
/// 消えたジェムのサンプルは捨てる。
#[tauri::command]
pub fn gem_flow_set_tracked(app: tauri::AppHandle, req: SetTrackedRequest) -> Result<GemFlowStore, String> {
    let mut store = load_store(&app);
    let names: std::collections::HashSet<String> = req.gems.iter().map(|g| g.name.clone()).collect();
    store.samples.retain(|k, _| names.contains(k));
    store.gems = req.gems;
    store.league = req.league;
    if let Some(s) = req.site {
        store.site = s;
    }
    store.list_refreshed_at = now_secs();
    save_store(&app, &store)?;
    Ok(store)
}

/// 今すぐ 1 周サンプルを取る (手動ボタン用)。取得中なら何もしない。
#[tauri::command]
pub async fn gem_flow_sample_now(app: tauri::AppHandle) -> Result<GemFlowStore, String> {
    sample_once(&app).await?;
    Ok(load_store(&app))
}

// ============================================================================
// サンプリング
// ============================================================================

/// 完成品 (コラプト済み・レベル 21 以上・品質 23% 以上) の検索クエリ
fn finished_query(gem_en: &str) -> serde_json::Value {
    serde_json::json!({
        "query": {
            "status": { "option": "securable" },
            "type": { "discriminator": null, "option": gem_en },
            "filters": {
                "type_filters": { "filters": { "category": { "option": "gem.activegem" }, "quality": { "min": 23 } } },
                "misc_filters": { "filters": { "gem_level": { "min": 21 }, "corrupted": { "option": "true" } } }
            }
        },
        "sort": { "price": "asc" }
    })
}

/// 出品時刻の文字列 ("2026-09-16T10:00:00Z") → 経過分
fn age_minutes(indexed: &str, now: i64) -> Option<i64> {
    // 形式は RFC3339。chrono を足さずに済ませるため手で読む (YYYY-MM-DDTHH:MM:SSZ)
    let b = indexed.as_bytes();
    if b.len() < 19 {
        return None;
    }
    let num = |s: &str| -> Option<i64> { s.parse::<i64>().ok() };
    let y = num(&indexed[0..4])?;
    let mo = num(&indexed[5..7])?;
    let d = num(&indexed[8..10])?;
    let h = num(&indexed[11..13])?;
    let mi = num(&indexed[14..16])?;
    let s = num(&indexed[17..19])?;
    // 1970-01-01 からの日数 (civil_from_days の逆、Howard Hinnant のアルゴリズム)
    let y_adj = if mo <= 2 { y - 1 } else { y };
    let era = if y_adj >= 0 { y_adj } else { y_adj - 399 } / 400;
    let yoe = y_adj - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let epoch = days * 86_400 + h * 3600 + mi * 60 + s;
    Some(((now - epoch).max(0)) / 60)
}

/// 追跡中の全ジェムを 1 周サンプルする
pub async fn sample_once(app: &tauri::AppHandle) -> Result<(), String> {
    if SAMPLING.swap(true, Ordering::SeqCst) {
        return Ok(()); // 既に走っている
    }
    let result = sample_inner(app).await;
    SAMPLING.store(false, Ordering::SeqCst);
    result
}

async fn sample_inner(app: &tauri::AppHandle) -> Result<(), String> {
    let store = load_store(app);
    if store.gems.is_empty() || store.league.is_empty() {
        return Ok(());
    }
    let site = if store.site.is_empty() { None } else { Some(store.site.clone()) };
    let now = now_secs();
    let mut new_samples: Vec<(String, FlowSample)> = Vec::new();

    for gem in &store.gems {
        let search = crate::trade2::SearchRequest {
            league: store.league.clone(),
            site: site.clone(),
            query: finished_query(&gem.name),
        };
        let body = match crate::trade2::trade2_search(search).await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[gem_flow] search {} 失敗: {e}", gem.name);
                tokio::time::sleep(REQUEST_INTERVAL).await;
                continue;
            }
        };
        let total = body.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
        let query_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ids: Vec<String> = body
            .get("result")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).take(10).collect())
            .unwrap_or_default();
        tokio::time::sleep(REQUEST_INTERVAL).await;

        let mut ages: Vec<i64> = Vec::new();
        let mut cheapest: Option<(f64, String)> = None;
        if !ids.is_empty() && !query_id.is_empty() {
            let fetch = crate::trade2::FetchRequest { ids, query_id, site: site.clone() };
            match crate::trade2::trade2_fetch(fetch).await {
                Ok(v) => {
                    if let Some(arr) = v.get("result").and_then(|x| x.as_array()) {
                        for item in arr {
                            let listing = item.get("listing");
                            if let Some(idx) = listing.and_then(|l| l.get("indexed")).and_then(|x| x.as_str()) {
                                if let Some(m) = age_minutes(idx, now) {
                                    ages.push(m);
                                }
                            }
                            if cheapest.is_none() {
                                let amount = listing.and_then(|l| l.get("price")).and_then(|p| p.get("amount")).and_then(|x| x.as_f64());
                                let currency = listing
                                    .and_then(|l| l.get("price"))
                                    .and_then(|p| p.get("currency"))
                                    .and_then(|x| x.as_str())
                                    .map(str::to_string);
                                if let (Some(a), Some(c)) = (amount, currency) {
                                    cheapest = Some((a, c));
                                }
                            }
                        }
                    }
                }
                Err(e) => eprintln!("[gem_flow] fetch {} 失敗: {e}", gem.name),
            }
            tokio::time::sleep(REQUEST_INTERVAL).await;
        }

        ages.sort_unstable();
        let median = if ages.is_empty() { None } else { Some(ages[ages.len() / 2]) };
        new_samples.push((
            gem.name.clone(),
            FlowSample {
                t: now,
                total,
                median_age_min: median,
                seen: ages.len(),
                cheapest_amount: cheapest.as_ref().map(|c| c.0),
                cheapest_currency: cheapest.map(|c| c.1),
            },
        ));
    }

    // 走っている間に追跡リストが変わっている可能性があるので読み直してから足す
    let mut store = load_store(app);
    for (name, sample) in new_samples {
        let v = store.samples.entry(name).or_default();
        v.push(sample);
        if v.len() > MAX_SAMPLES {
            let cut = v.len() - MAX_SAMPLES;
            v.drain(0..cut);
        }
    }
    store.sampled_at = now;
    save_store(app, &store)
}

/// 起動時に呼ぶ: 1 時間ごとのサンプリングを回す
pub fn spawn_scheduler(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // 起動直後は他の取得とぶつからないよう少し待つ
        tokio::time::sleep(Duration::from_secs(120)).await;
        loop {
            let store = load_store(&app);
            let due = now_secs() - store.sampled_at >= SAMPLE_INTERVAL.as_secs() as i64;
            if due && !store.gems.is_empty() {
                if let Err(e) = sample_once(&app).await {
                    eprintln!("[gem_flow] サンプリング失敗: {e}");
                }
            }
            tokio::time::sleep(Duration::from_secs(300)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-01-01T00:00:00Z = 1767225600 (既知の値) を基準に経過分を確認
    #[test]
    fn age_minutes_reads_rfc3339() {
        let base = 1_767_225_600i64;
        assert_eq!(age_minutes("2026-01-01T00:00:00Z", base + 1800), Some(30));
        assert_eq!(age_minutes("2026-01-01T00:00:00Z", base), Some(0));
        // 未来の出品時刻 (時計ずれ) は 0 に丸める
        assert_eq!(age_minutes("2026-01-01T00:00:00Z", base - 600), Some(0));
    }

    /// 月またぎ / うるう年を含む日付でも epoch がずれない
    #[test]
    fn age_minutes_handles_month_and_leap() {
        // 2026-09-16T00:00:00Z = 1789516800
        let sep16 = 1_789_516_800i64;
        assert_eq!(age_minutes("2026-09-16T00:00:00Z", sep16 + 3600), Some(60));
        // 2024-02-29 (うるう日) = 1709164800
        let leap = 1_709_164_800i64;
        assert_eq!(age_minutes("2024-02-29T00:00:00Z", leap + 60), Some(1));
    }

    /// 形式が違う / 短い文字列は None
    #[test]
    fn age_minutes_rejects_garbage() {
        assert_eq!(age_minutes("", 0), None);
        assert_eq!(age_minutes("2026-09-16", 0), None);
    }

    /// 完成品クエリの条件 (レベル 21 以上 / 品質 23% 以上 / コラプト済み)
    #[test]
    fn finished_query_has_expected_filters() {
        let q = finished_query("Arc");
        assert_eq!(q["query"]["type"]["option"], "Arc");
        assert_eq!(q["query"]["filters"]["misc_filters"]["filters"]["gem_level"]["min"], 21);
        assert_eq!(q["query"]["filters"]["type_filters"]["filters"]["quality"]["min"], 23);
        assert_eq!(q["query"]["filters"]["misc_filters"]["filters"]["corrupted"]["option"], "true");
    }
}


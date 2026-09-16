//! 捌き速度の追跡 (2026-09-16、旧 gem_flow)
//!
//! 「この商品は何時間で売れるのか」を、公式 trade2 の出品を定期的に覗いて測る。
//! ジェム専用ではなく、trade2 のクエリを 1 本渡せば何でも追える (レア装備でも通貨でも)。
//!
//! ## 何を測るか (シミュレーションで検証済み: examples/gem_flow_sim.rs)
//! 素朴に「今並んでいる出品が何分前に出された物か」を見ると **速い市場ほど遅く出る**。
//! 良い出品は覗く前に売れていて、目に入るのは売れ残りだけだから。6 パターンの市場を
//! ダミーで作って測ったところ、実際の待ち時間と順序が合うのは **消失率** だけだった:
//!
//! | 市場              | 実際の待ち | 滞留の中央値 | 消失率 |
//! |-------------------|-----------|-------------|--------|
//! | 需給均衡 (速い)    | 21 分     | 18.4 時間   | 31%    |
//! | 供給過多 (遅い)    | 1.5 時間  | 20.6 時間   | 11%    |
//! | 速い + 強気が居座る | 14 分     | 2.2 日      | 15%    |
//! | 薄い市場          | 6 時間    | 1.7 日      | 4%     |
//! | 死んだ市場        | 8.8 時間  | 2.7 日      | 2%     |
//!
//! そこで **前回見えていた出品 ID が今回何割消えたか** を主指標にする。
//! 1 例外だけ検出できない: 「即売れ + 強気出品だらけ」(見える範囲が全部売れ残り)。
//! これは「最安だけ頻繁に入れ替わるのに在庫が動かない」で別途警告する。
//!
//! 取得量: 1 銘柄あたり search 1 + fetch 1 = 2 リクエスト / 時。
//! trade2 の制限 (5/10 秒, 15/60 秒, 30/5 分, 600/6 時間) に対して 8 秒間隔で流す。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 追跡する銘柄 1 つ (ジェムでも装備でも、trade2 のクエリがあれば何でも)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Watch {
    /// 一意なキー (ジェムなら英語名)
    pub key: String,
    /// 画面に出す名前
    #[serde(default)]
    pub label: String,
    /// trade2 の検索クエリ (フロントで組んだ物をそのまま使う)
    pub query: serde_json::Value,
    /// 補足 (「完成品を 41 人が使用」など、登録元が入れる)
    #[serde(default)]
    pub note: String,
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
    /// 同じく平均 (表示用。判定は外れ値に強い中央値で行う)
    #[serde(default)]
    pub avg_age_min: Option<i64>,
    /// 実際に見た出品数 (最大 10)
    pub seen: usize,
    /// その時見えていた最安 10 件の listing ID (消失率の計算に使う。主指標)
    #[serde(default)]
    pub ids: Vec<String>,
    /// 最安値 (そのままの通貨)
    pub cheapest_amount: Option<f64>,
    pub cheapest_currency: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct FlowStore {
    /// 最後にサンプルを取った時刻 (unix 秒)
    pub sampled_at: i64,
    /// 追跡リストを更新した時刻 (クラフト選定ジェムの取得時刻)
    pub list_refreshed_at: i64,
    /// trade2 のリーグ名
    pub league: String,
    /// "jp" / "www"
    pub site: String,
    pub watches: Vec<Watch>,
    /// キー → サンプル列 (古い順)
    pub samples: std::collections::HashMap<String, Vec<FlowSample>>,
}

/// 1 ジェムあたり保持するサンプル数 (1 時間ごと = 30 日分)
const MAX_SAMPLES: usize = 24 * 30;
/// リクエストの間隔 (trade2 の 30 回 / 5 分に対して余裕を持たせる)
const REQUEST_INTERVAL: Duration = Duration::from_secs(8);
/// サンプリング周期
const SAMPLE_INTERVAL: Duration = Duration::from_secs(3600);
/// 起動直後の 1 回目を飛ばす条件 (直前のサンプルからこの秒数以内なら取らない)
const FIRST_SAMPLE_MIN_GAP: i64 = 900;

static SAMPLING: AtomicBool = AtomicBool::new(false);

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("market_flow.json");
    Ok(dir)
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn load_store(app: &tauri::AppHandle) -> FlowStore {
    let Ok(p) = store_path(app) else {
        return FlowStore::default();
    };
    let Ok(text) = fs::read_to_string(&p) else {
        return FlowStore::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn save_store(app: &tauri::AppHandle, store: &FlowStore) -> Result<(), String> {
    let p = store_path(app)?;
    let text = serde_json::to_string(store).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(&p, text).map_err(|e| format!("write {p:?}: {e}"))
}

// ============================================================================
// Tauri commands
// ============================================================================

/// 保存済みの記録を返す (UI 表示用)
#[tauri::command]
pub fn market_flow_load(app: tauri::AppHandle) -> Result<FlowStore, String> {
    Ok(load_store(&app))
}

#[derive(Deserialize)]
pub struct SetWatchesRequest {
    pub watches: Vec<Watch>,
    pub league: String,
    #[serde(default)]
    pub site: Option<String>,
}

/// 追跡する銘柄を入れ替える (登録元の画面から呼ぶ)。外れた銘柄のサンプルは捨てる。
#[tauri::command]
pub fn market_flow_set_watches(app: tauri::AppHandle, req: SetWatchesRequest) -> Result<FlowStore, String> {
    let mut store = load_store(&app);
    let keys: std::collections::HashSet<String> = req.watches.iter().map(|w| w.key.clone()).collect();
    store.samples.retain(|k, _| keys.contains(k));
    store.watches = req.watches;
    store.league = req.league;
    if let Some(s) = req.site {
        store.site = s;
    }
    store.list_refreshed_at = now_secs();
    save_store(&app, &store)?;
    Ok(store)
}

#[derive(Deserialize)]
pub struct RecordRequest {
    /// 銘柄のキー
    pub key: String,
    pub total: u64,
    #[serde(default)]
    pub median_age_min: Option<i64>,
    #[serde(default)]
    pub avg_age_min: Option<i64>,
    #[serde(default)]
    pub seen: usize,
    #[serde(default)]
    pub cheapest_amount: Option<f64>,
    #[serde(default)]
    pub cheapest_currency: Option<String>,
    /// 見えていた listing ID (消失率に使う)
    #[serde(default)]
    pub ids: Vec<String>,
}

/// 画面から手で取った結果を同じ履歴に差し込む (2026-09-16 オーナー指示)。
/// 自動サンプルと同じ形で時系列に入るので、グラフも繋がる。
#[tauri::command]
pub fn market_flow_record(app: tauri::AppHandle, req: RecordRequest) -> Result<FlowStore, String> {
    let mut store = load_store(&app);
    let now = now_secs();
    let v = store.samples.entry(req.key).or_default();
    // 同じ時間帯に自動サンプルが入っていれば上書きする (二重計上を避ける)
    if let Some(last) = v.last_mut() {
        if now - last.t < 300 {
            *last = FlowSample {
                t: now,
                total: req.total,
                median_age_min: req.median_age_min,
                avg_age_min: req.avg_age_min,
                seen: req.seen,
                ids: req.ids,
                cheapest_amount: req.cheapest_amount,
                cheapest_currency: req.cheapest_currency,
            };
            store.sampled_at = now;
            save_store(&app, &store)?;
            return Ok(store);
        }
    }
    v.push(FlowSample {
        t: now,
        total: req.total,
        median_age_min: req.median_age_min,
        avg_age_min: req.avg_age_min,
        seen: req.seen,
        ids: req.ids,
        cheapest_amount: req.cheapest_amount,
        cheapest_currency: req.cheapest_currency,
    });
    if v.len() > MAX_SAMPLES {
        let cut = v.len() - MAX_SAMPLES;
        v.drain(0..cut);
    }
    store.sampled_at = now;
    save_store(&app, &store)?;
    Ok(store)
}

/// 今すぐ 1 周サンプルを取る (手動ボタン用)。取得中なら何もしない。
#[tauri::command]
pub async fn market_flow_sample_now(app: tauri::AppHandle) -> Result<FlowStore, String> {
    sample_once(&app).await?;
    Ok(load_store(&app))
}

// ============================================================================
// サンプリング
// ============================================================================

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
    if store.watches.is_empty() || store.league.is_empty() {
        return Ok(());
    }
    let site = if store.site.is_empty() { None } else { Some(store.site.clone()) };
    let now = now_secs();
    let mut new_samples: Vec<(String, FlowSample)> = Vec::new();

    for watch in &store.watches {
        let search = crate::trade2::SearchRequest {
            league: store.league.clone(),
            site: site.clone(),
            query: watch.query.clone(),
        };
        let body = match crate::trade2::trade2_search(search).await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[market_flow] search {} 失敗: {e}", watch.key);
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
        let seen_ids: Vec<String> = ids.iter().take(10).cloned().collect();
        let mut cheapest: Option<(f64, String)> = None;
        if !ids.is_empty() && !query_id.is_empty() {
            let fetch = crate::trade2::FetchRequest { ids: ids.clone(), query_id, site: site.clone() };
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
                Err(e) => eprintln!("[market_flow] fetch {} 失敗: {e}", watch.key),
            }
            tokio::time::sleep(REQUEST_INTERVAL).await;
        }

        ages.sort_unstable();
        let median = if ages.is_empty() { None } else { Some(ages[ages.len() / 2]) };
        let avg = if ages.is_empty() { None } else { Some(ages.iter().sum::<i64>() / ages.len() as i64) };
        new_samples.push((
            watch.key.clone(),
            FlowSample {
                t: now,
                total,
                median_age_min: median,
                avg_age_min: avg,
                seen: ages.len(),
                ids: seen_ids,
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
        // オーナー指示 (2026-09-16): 1 回目は起動したらすぐ取る。
        // ただし直前 (15 分以内) に取っていれば飛ばす (再起動を繰り返した時にレート制限を焼かないため)。
        tokio::time::sleep(Duration::from_secs(15)).await;
        {
            let store = load_store(&app);
            if !store.watches.is_empty() && now_secs() - store.sampled_at >= FIRST_SAMPLE_MIN_GAP {
                if let Err(e) = sample_once(&app).await {
                    eprintln!("[market_flow] 起動時のサンプリング失敗: {e}");
                }
            }
        }
        loop {
            let store = load_store(&app);
            let due = now_secs() - store.sampled_at >= SAMPLE_INTERVAL.as_secs() as i64;
            if due && !store.watches.is_empty() {
                if let Err(e) = sample_once(&app).await {
                    eprintln!("[market_flow] サンプリング失敗: {e}");
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

}


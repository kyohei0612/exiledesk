//! Phase ο-A: 起動時の Rust 健全性チェック (外部 API + HTML スクレイプ)。
//!
//! 目的:
//!   - 上流データソース (poe.ninja / poe2db / pathofexile.com trade2) の
//!     スキーマ・HTML 構造が想定通りかを起動時に 1 回だけ検証する。
//!   - 既存の `character_items_to_cached` で is_target_inventory_id に
//!     ヒットしなかった inventoryId をカウントし、未知スロット出現を可視化する。
//!   - 失敗時は graceful degradation: ok=false + warning を返すだけで起動は止めない。
//!
//! 公開 API (Tauri command):
//!   - `health_check_all` — 1-3 を並列で実行し、4 のカウンタも合わせて返す。
//!
//! @author engineering-B
//! @date 2026-05-22

use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use reqwest::Client;
use serde::Serialize;

// ============================================================================
// 定数
// ============================================================================

/// HTTP タイムアウト: 起動時間に響かないよう短く (オーナー指示: 5 秒程度)。
const HEALTH_HTTP_TIMEOUT_SECS: u64 = 5;

/// User-Agent: poe_ninja_client と整合させた礼儀的明記。
const HEALTH_USER_AGENT: &str =
    "ExileDesk/0.1.4 (POE2 health check; contact: nekodori0612@gmail.com)";

/// 各エンドポイント URL。
const POE_NINJA_INDEX_STATE_URL: &str =
    "https://poe.ninja/poe2/api/data/index-state";
const POE2DB_SAMPLE_URL: &str = "https://poe2db.tw/us/Atziris_Splendour";
const TRADE2_FILTERS_URL: &str =
    "https://www.pathofexile.com/api/trade2/data/filters";

// ============================================================================
// 未知 inventoryId カウンタ (静的)
// ============================================================================

/// `character_items_to_cached` 内で `is_target_inventory_id` に弾かれた inventoryId 数。
/// プロセス起動からの累積カウント。`health_check_all` から `.load()` のみで参照する。
pub static UNKNOWN_INV_ID_COUNT: AtomicU64 = AtomicU64::new(0);

/// 既存ロジックから呼び出すための薄いインクリメンタ。
/// `character_items_to_cached` で reject 直後に呼ぶことを想定。
///
/// `inv_id` はデバッグ用に eprintln! で 1 行ログ出力する (オーナー指示)。
/// `frame_type` は -1 (欠落) の場合もある。
pub fn record_unknown_inventory_id(inv_id: &str, frame_type: i64) {
    UNKNOWN_INV_ID_COUNT.fetch_add(1, Ordering::Relaxed);
    eprintln!(
        "[health-check] unknown inventoryId='{}' frameType={}",
        inv_id, frame_type
    );
}

// ============================================================================
// 公開構造体
// ============================================================================

/// `health_check_all` の戻り値。
///
/// - `*_ok`            : 各チェックが成功 = true。1 つでも失敗で false。
/// - `unknown_inventory_ids_count` : これまでの累積 (プロセス起動からの和)。
/// - `warnings`        : 失敗時の人間可読メッセージ。空なら全 OK。
#[derive(Serialize, Clone, Debug)]
pub struct HealthCheckResult {
    pub poe_ninja_schema_ok: bool,
    pub poe2db_html_ok: bool,
    pub trade2_api_ok: bool,
    pub unknown_inventory_ids_count: u64,
    pub warnings: Vec<String>,
}

// ============================================================================
// 共通 HTTP client builder
// ============================================================================

fn build_health_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(HEALTH_USER_AGENT)
        .timeout(Duration::from_secs(HEALTH_HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("health client build error: {e}"))
}

// ============================================================================
// 1. poe.ninja API スキーマチェック
// ============================================================================

/// `/poe2/api/data/index-state` を 1 回 GET し、必須フィールドを確認する。
///
/// 必須:
///   - `economyLeagues` が配列で 1 件以上
///   - 各 economyLeagues[].url が文字列
///   - `snapshotVersions` が配列で 1 件以上
///   - 各 snapshotVersions[].version と snapshotName が文字列
async fn check_poe_ninja_schema(client: &Client) -> Result<(), String> {
    let resp = client
        .get(POE_NINJA_INDEX_STATE_URL)
        .send()
        .await
        .map_err(|e| format!("poe.ninja index-state network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!(
            "poe.ninja index-state HTTP {status}: 構造変更/障害の可能性"
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("poe.ninja index-state json parse error: {e}"))?;

    // economyLeagues チェック
    let leagues = body
        .get("economyLeagues")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "poe.ninja: フィールド 'economyLeagues' が消えている、API 構造変更の可能性"
                .to_string()
        })?;
    if leagues.is_empty() {
        return Err(
            "poe.ninja: 'economyLeagues' が空配列、リーグ未定義/構造変更の可能性"
                .to_string(),
        );
    }
    for (i, entry) in leagues.iter().enumerate() {
        if entry.get("url").and_then(|v| v.as_str()).is_none() {
            return Err(format!(
                "poe.ninja: economyLeagues[{i}].url 欠落、構造変更の可能性"
            ));
        }
    }

    // snapshotVersions チェック
    let snaps = body
        .get("snapshotVersions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "poe.ninja: フィールド 'snapshotVersions' が消えている、API 構造変更の可能性"
                .to_string()
        })?;
    if snaps.is_empty() {
        return Err(
            "poe.ninja: 'snapshotVersions' が空配列、構造変更の可能性".to_string()
        );
    }
    for (i, entry) in snaps.iter().enumerate() {
        if entry.get("version").and_then(|v| v.as_str()).is_none() {
            return Err(format!(
                "poe.ninja: snapshotVersions[{i}].version 欠落、構造変更の可能性"
            ));
        }
        if entry
            .get("snapshotName")
            .and_then(|v| v.as_str())
            .is_none()
        {
            return Err(format!(
                "poe.ninja: snapshotVersions[{i}].snapshotName 欠落、構造変更の可能性"
            ));
        }
    }

    Ok(())
}

// ============================================================================
// 2. POE2DB HTML 構造チェック
// ============================================================================

/// 既知 unique ページ `Atziris_Splendour` を取得し、主要構造の存在を確認する。
///
/// 確認: HTTP 200 + `class="itemName"` 文字列 + `<h1` タグの存在。
/// (本格的な HTML パーサを足さない: scraper crate を追加しない方針)
async fn check_poe2db_html(client: &Client) -> Result<(), String> {
    let resp = client
        .get(POE2DB_SAMPLE_URL)
        .send()
        .await
        .map_err(|e| format!("poe2db network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("poe2db HTTP {status}: ページ消失/障害の可能性"));
    }

    let html = resp
        .text()
        .await
        .map_err(|e| format!("poe2db body read error: {e}"))?;

    // 文字列ベースの最小チェック (HTML パーサ依存を避ける)。
    let has_item_name = html.contains("class=\"itemName\"")
        || html.contains("class='itemName'")
        || html.contains("itemName");
    let has_h1 = html.contains("<h1");
    if !has_item_name {
        return Err(
            "poe2db: 'itemName' クラスが見つからない、HTML 構造変更の可能性".to_string()
        );
    }
    if !has_h1 {
        return Err("poe2db: <h1> タグが見つからない、HTML 構造変更の可能性".to_string());
    }

    Ok(())
}

// ============================================================================
// 3. trade2 API フィルタ仕様チェック
// ============================================================================

/// `/api/trade2/data/filters` を取得し、`type_filters` の category options に
/// `armour.shield` / `armour.focus` / `armour.quiver` が含まれているか確認する。
///
/// 構造 (実機 2026-05-22 時点):
/// ```json
/// {
///   "result": [
///     { "id": "type_filters",
///       "filters": [
///         { "id": "category",
///           "option": { "options": [ { "id": "armour.shield", ... }, ... ] }
///         },
///         ...
///       ]
///     },
///     ...
///   ]
/// }
/// ```
async fn check_trade2_filters(client: &Client) -> Result<(), String> {
    let resp = client
        .get(TRADE2_FILTERS_URL)
        .send()
        .await
        .map_err(|e| format!("trade2 filters network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!("trade2 filters HTTP {status}: 構造変更/障害の可能性"));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("trade2 filters json parse error: {e}"))?;

    // result[] を線形検索して type_filters を見つけ、その下の filters[] を線形検索して
    // category を見つけ、option.options[] から id を集める。
    // パスが少しでも違ったらすぐ Err を出して原因を分かりやすく。
    let result_arr = body
        .get("result")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "trade2 filters: 'result' 配列が見つからない".to_string())?;

    let type_filters_node = result_arr
        .iter()
        .find(|e| e.get("id").and_then(|v| v.as_str()) == Some("type_filters"))
        .ok_or_else(|| {
            "trade2 filters: result[].id=='type_filters' が消えている、構造変更の可能性"
                .to_string()
        })?;

    let filters_arr = type_filters_node
        .get("filters")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "trade2 filters: type_filters.filters[] が見つからない、構造変更の可能性"
                .to_string()
        })?;

    let category_node = filters_arr
        .iter()
        .find(|e| e.get("id").and_then(|v| v.as_str()) == Some("category"))
        .ok_or_else(|| {
            "trade2 filters: type_filters.filters[].id=='category' が消えている、構造変更の可能性"
                .to_string()
        })?;

    // category.option.options[] (POE2 trade2 の実構造) と category.options[] (フォールバック)
    // の両方を見る: 構造軽微変更にも耐性をつける。
    let options_arr = category_node
        .get("option")
        .and_then(|o| o.get("options"))
        .and_then(|v| v.as_array())
        .or_else(|| {
            category_node
                .get("options")
                .and_then(|v| v.as_array())
        })
        .ok_or_else(|| {
            "trade2 filters: type_filters.category.(option.)options[] が見つからない、構造変更の可能性"
                .to_string()
        })?;

    if options_arr.is_empty() {
        return Err(
            "trade2 filters: type_filters.category options[] が空、構造変更の可能性"
                .to_string(),
        );
    }

    let ids: HashSet<&str> = options_arr
        .iter()
        .filter_map(|e| e.get("id").and_then(|v| v.as_str()))
        .collect();

    let required = ["armour.shield", "armour.focus", "armour.quiver"];
    let missing: Vec<&str> = required
        .iter()
        .filter(|id| !ids.contains(*id))
        .copied()
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "trade2 filters: 必須 category id 欠落: {:?} — POE2 仕様変更の可能性",
            missing
        ));
    }

    Ok(())
}

// ============================================================================
// Tauri command
// ============================================================================

/// 起動時に呼び出される統合 health check。1-3 を並列実行し、4 (累積カウンタ) を合算。
///
/// 各チェック失敗時は `warnings` に push、対応する `_ok` を false にして返す。
/// ネットワーク全断でも `Ok(HealthCheckResult { *_ok: false, ... })` を返すことで、
/// 起動シーケンス自体は止めない (graceful degradation)。
#[tauri::command]
pub async fn health_check_all() -> Result<HealthCheckResult, String> {
    let client = match build_health_client() {
        Ok(c) => c,
        Err(e) => {
            // client が作れない = reqwest 内部障害。これだけは Err を返す
            // (3 並列実行できないため、graceful degradation の対象外)。
            return Err(e);
        }
    };

    // tokio::join! で 3 並列実行 (try_join! は早期 short-circuit するため不適)。
    let (ninja_res, poe2db_res, trade2_res) = tokio::join!(
        check_poe_ninja_schema(&client),
        check_poe2db_html(&client),
        check_trade2_filters(&client),
    );

    let mut warnings: Vec<String> = Vec::new();

    let poe_ninja_schema_ok = match ninja_res {
        Ok(()) => true,
        Err(e) => {
            warnings.push(format!("poe.ninja schema: {e}"));
            false
        }
    };
    let poe2db_html_ok = match poe2db_res {
        Ok(()) => true,
        Err(e) => {
            warnings.push(format!("poe2db html: {e}"));
            false
        }
    };
    let trade2_api_ok = match trade2_res {
        Ok(()) => true,
        Err(e) => {
            warnings.push(format!("trade2 filters: {e}"));
            false
        }
    };

    let unknown_inventory_ids_count = UNKNOWN_INV_ID_COUNT.load(Ordering::Relaxed);

    Ok(HealthCheckResult {
        poe_ninja_schema_ok,
        poe2db_html_ok,
        trade2_api_ok,
        unknown_inventory_ids_count,
        warnings,
    })
}

// ============================================================================
// ユニットテスト (オフライン: カウンタ + 構造体のみ)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_inv_id_counter_increments() {
        let before = UNKNOWN_INV_ID_COUNT.load(Ordering::Relaxed);
        record_unknown_inventory_id("MysterySlot", 2);
        record_unknown_inventory_id("MysterySlot2", -1);
        let after = UNKNOWN_INV_ID_COUNT.load(Ordering::Relaxed);
        assert!(after >= before + 2);
    }

    #[test]
    fn health_check_result_serializes() {
        let r = HealthCheckResult {
            poe_ninja_schema_ok: true,
            poe2db_html_ok: false,
            trade2_api_ok: true,
            unknown_inventory_ids_count: 3,
            warnings: vec!["poe2db html: HTTP 503".to_string()],
        };
        let s = serde_json::to_string(&r).unwrap();
        assert!(s.contains("\"poe_ninja_schema_ok\":true"));
        assert!(s.contains("\"poe2db_html_ok\":false"));
        assert!(s.contains("\"unknown_inventory_ids_count\":3"));
        assert!(s.contains("HTTP 503"));
    }
}

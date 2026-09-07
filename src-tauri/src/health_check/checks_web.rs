//! poe2db HTML 構造確認と trade2 filters API 確認
//!
//! health_check.rs (714 行) から機械分割 (2026-09-07 R3)。

use super::*;

/// 既知 unique ページ `Atziris_Splendour` を取得し、主要構造の存在を確認する。
///
/// Phase ο-C (2026-05-22) 改訂:
///   - 旧実装は `<h1>` タグ必須だったが、実機 (2026-05-22 curl) で POE2DB が
///     `<h1>` を `<h3 style='display: none'>` に変更しているのを確認。
///   - 新ヘッダー実構造:
///       <div class="itemHeader doubleLine">
///         <div class="itemName">
///           <span class="lc">Atziri's Splendour</span>
///         </div>
///         ...
///       </div>
///   - そのため検証ロジックを「itemName クラス必須 + 以下のいずれかで item の
///     正式名が抽出できる」に緩和:
///       a) `<span class="lc">` (新構造: itemName 内の表示テキスト)
///       b) `<div class="itemHeader` (新構造: ヘッダー枠)
///       c) `<h1`                    (旧構造、フォールバック)
///       d) `<h3` + `display: none`  (新構造で SEO 用に残ってる隠し h3)
///     1 つでもマッチすればヘッダー検出 OK と判定。
///   - これにより POE2DB の細かい構造変更で False Positive が出にくくなる。
///
/// (scraper crate は引き続き不採用: 依存を増やさない方針)
pub(crate) async fn check_poe2db_html(client: &Client) -> Result<(), String> {
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

    // (1) itemName クラスは新旧構造共通の必須要素 (現行 POE2DB は確実に持つ)。
    let has_item_name = html.contains("class=\"itemName\"")
        || html.contains("class='itemName'");
    if !has_item_name {
        return Err(
            "poe2db: 'itemName' クラスが見つからない、HTML 構造変更の可能性".to_string()
        );
    }

    // (2) ヘッダー検出は複数パターンの OR (どれか 1 つでもマッチすれば OK)。
    //     POE2DB が h1 → h3(hidden) → div.itemHeader と変えていっても誤検知しない。
    let has_h1 = html.contains("<h1");
    let has_hidden_h3 =
        html.contains("<h3") && html.contains("display: none");
    let has_item_header = html.contains("class=\"itemHeader")
        || html.contains("class='itemHeader");
    let has_lc_span =
        html.contains("class=\"lc\"") || html.contains("class='lc'");

    if !(has_h1 || has_hidden_h3 || has_item_header || has_lc_span) {
        return Err(
            "poe2db: ヘッダー候補 (<h1> / <h3 display:none> / .itemHeader / .lc) \
             がいずれも見つからない、HTML 構造変更の可能性"
                .to_string(),
        );
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
pub(crate) async fn check_trade2_filters(client: &Client) -> Result<(), String> {
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

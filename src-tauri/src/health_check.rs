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

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use reqwest::Client;
use serde::Serialize;

// ============================================================================
// Phase ο-C (2026-05-22): 未知 inventoryId サンプル収集
// ============================================================================
//
// 旧実装は AtomicU64 で「件数」だけを保持していたが、オーナーから「62 件と
// 数字だけでは何の inv_id か分からない、具体値が見たい」要望が出たため、
// inv_id 文字列 → 出現カウントの Map を保持する。
//
// 排他制御:
//   - 起動時は health_check_all から read (lock + clone) のみ。
//   - フェッチ中は record_unknown_inventory_id から書き込み (頻度: 数十回/分)。
//   - 同時アクセスはあるが秒間数件程度なので Mutex で十分 (Rwlock 不要)。
//
// メモリ上限:
//   - 異常時 (POE2 が 1000 種類の新スロット投入) に備え、HashMap サイズが
//     UNKNOWN_INV_ID_CAP を超えたら新規 inv_id を弾く (既存カウントは継続)。
//   - 通常 POE2 で想定される未知スロットは 5-20 種類なので問題なし。
const UNKNOWN_INV_ID_CAP: usize = 256;

/// inv_id 文字列 → 累積出現カウント。
/// 例: { "Belt" => 30, "Flask1" => 18, ... }
static UNKNOWN_INV_ID_SAMPLES: Mutex<Option<HashMap<String, u64>>> = Mutex::new(None);

/// サンプル UI 表示件数 (上位 N 件)。
const UNKNOWN_INV_ID_SAMPLE_LIMIT: usize = 20;

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
///
/// Phase ο-C (2026-05-22): カウントだけでなく inv_id 文字列もサンプル収集する。
///   - UNKNOWN_INV_ID_SAMPLES に inv_id → count を蓄積。
///   - UI 側で「Belt が 30 件、Flask1 が 18 件」のように具体値が見えるようにする。
pub fn record_unknown_inventory_id(inv_id: &str, frame_type: i64) {
    UNKNOWN_INV_ID_COUNT.fetch_add(1, Ordering::Relaxed);
    eprintln!(
        "[health-check] unknown inventoryId='{}' frameType={}",
        inv_id, frame_type
    );

    // Mutex 取得失敗 (poisoned) は無視: サンプル収集は best-effort で OK。
    if let Ok(mut guard) = UNKNOWN_INV_ID_SAMPLES.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        // Cap 超過時の挙動:
        //   - 既知の inv_id ならカウントだけ +1 (既存エントリ更新)。
        //   - 新規 inv_id は破棄 (メモリ爆発防止)。
        match map.get_mut(inv_id) {
            Some(c) => {
                *c = c.saturating_add(1);
            }
            None => {
                if map.len() < UNKNOWN_INV_ID_CAP {
                    map.insert(inv_id.to_string(), 1);
                }
            }
        }
    }
}

/// テスト・将来の手動リセット用ヘルパー (現状 UI からは未呼び出し)。
/// カウンタとサンプル両方をクリアする。
#[allow(dead_code)]
pub fn reset_unknown_inventory_id_samples() {
    UNKNOWN_INV_ID_COUNT.store(0, Ordering::Relaxed);
    if let Ok(mut guard) = UNKNOWN_INV_ID_SAMPLES.lock() {
        *guard = None;
    }
}

/// 上位 N 件の (inv_id, count) を出現順で返す (count 降順、同数は inv_id 辞書順)。
/// health_check_all から呼び出される。
fn top_unknown_inventory_id_samples() -> Vec<(String, u64)> {
    let guard = match UNKNOWN_INV_ID_SAMPLES.lock() {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    let map = match guard.as_ref() {
        Some(m) => m,
        None => return Vec::new(),
    };

    let mut items: Vec<(String, u64)> =
        map.iter().map(|(k, v)| (k.clone(), *v)).collect();
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    items.truncate(UNKNOWN_INV_ID_SAMPLE_LIMIT);
    items
}

// ============================================================================
// 公開構造体
// ============================================================================

/// `health_check_all` の戻り値。
///
/// - `*_ok`            : 各チェックが成功 = true。1 つでも失敗で false。
/// - `unknown_inventory_ids_count` : これまでの累積 (プロセス起動からの和)。
/// - `unknown_inventory_id_samples` : Phase ο-C で追加。上位 20 件の
///     (inv_id, count) ペアを count 降順で返す。UI 側で警告詳細展開時に表示。
/// - `warnings`        : 失敗時の人間可読メッセージ。空なら全 OK。
#[derive(Serialize, Clone, Debug)]
pub struct HealthCheckResult {
    pub poe_ninja_schema_ok: bool,
    pub poe2db_html_ok: bool,
    pub trade2_api_ok: bool,
    pub unknown_inventory_ids_count: u64,
    pub unknown_inventory_id_samples: Vec<UnknownInvIdSample>,
    pub warnings: Vec<String>,
}

/// `HealthCheckResult.unknown_inventory_id_samples` の 1 エントリ。
/// JSON では `{ "inventory_id": "Belt", "count": 30 }` 形式。
#[derive(Serialize, Clone, Debug)]
pub struct UnknownInvIdSample {
    pub inventory_id: String,
    pub count: u64,
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

    // search レスポンス (protobuf) のパース検証。
    //
    // 2026-09-07 追加の背景:
    //   index-state / build-index-state は素直な JSON なのでフィールド検査で守れるが、
    //   「上位プレイヤーMOD一覧」の中核である search は .proto を持たない
    //   リバースエンジニアリング実装で、**一番壊れやすいのにノーチェックだった**。
    //   実際 2026-09 のリーグ切替でカラムのフィールド番号が変わり、パースが
    //   全件 0 件を返してこの機能が丸ごと無言で死んだ (HTTP は 200 のまま)。
    //   スキーマ検査を通り抜ける以上、実際にパースして確かめるしかない。
    let current_league_url = leagues[0]
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let snap = snaps
        .iter()
        .find(|s| s.get("url").and_then(|u| u.as_str()) == Some(current_league_url));
    if let Some(snap) = snap {
        let version = snap.get("version").and_then(|v| v.as_str()).unwrap_or("");
        let overview = snap
            .get("snapshotName")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        check_poe_ninja_search_parse(client, version, overview).await?;
    }

    Ok(())
}

/// search エンドポイントを 1 回だけ叩き、`name` / `account` カラムが
/// 実際に取り出せるかを確認する。
///
/// `class` を指定しない全体検索を使う (リーグごとに変わるアセンダンシー名に
/// 依存させないため、かつ build-index-state への追加リクエストを避けるため)。
async fn check_poe_ninja_search_parse(
    client: &Client,
    version: &str,
    overview: &str,
) -> Result<(), String> {
    if version.is_empty() || overview.is_empty() {
        return Ok(());
    }
    let url =
        format!("https://poe.ninja/poe2/api/builds/{version}/search?overview={overview}&sort=dps");

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("poe.ninja search network error: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("poe.ninja search HTTP {status}: 障害/仕様変更の可能性"));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("poe.ninja search bytes read error: {e}"))?;

    let columns = crate::poe_ninja_client::extract_search_columns(&bytes);
    let names = columns.get("name").map(Vec::len).unwrap_or(0);
    let accounts = columns.get("account").map(Vec::len).unwrap_or(0);
    if names == 0 || accounts == 0 {
        let mut found: Vec<&str> = columns.keys().map(String::as_str).collect();
        found.sort_unstable();
        return Err(format!(
            "poe.ninja search: name/account カラムを抽出できない \
             (name={names}, account={accounts}, 検出カラム=[{}])。\
             protobuf 構造変更のため『上位プレイヤーMOD一覧』が空になります",
            found.join(", ")
        ));
    }

    Ok(())
}

// ============================================================================
// 2. POE2DB HTML 構造チェック
// ============================================================================

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
    let unknown_inventory_id_samples: Vec<UnknownInvIdSample> =
        top_unknown_inventory_id_samples()
            .into_iter()
            .map(|(inventory_id, count)| UnknownInvIdSample {
                inventory_id,
                count,
            })
            .collect();

    Ok(HealthCheckResult {
        poe_ninja_schema_ok,
        poe2db_html_ok,
        trade2_api_ok,
        unknown_inventory_ids_count,
        unknown_inventory_id_samples,
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
            unknown_inventory_id_samples: vec![UnknownInvIdSample {
                inventory_id: "Belt".to_string(),
                count: 2,
            }],
            warnings: vec!["poe2db html: HTTP 503".to_string()],
        };
        let s = serde_json::to_string(&r).unwrap();
        assert!(s.contains("\"poe_ninja_schema_ok\":true"));
        assert!(s.contains("\"poe2db_html_ok\":false"));
        assert!(s.contains("\"unknown_inventory_ids_count\":3"));
        assert!(s.contains("\"inventory_id\":\"Belt\""));
        assert!(s.contains("\"count\":2"));
        assert!(s.contains("HTTP 503"));
    }

    /// Phase ο-C: サンプル収集が「同じ inv_id を複数回 push したら count が増える」
    /// + 「上位 N 件が count 降順で並ぶ」ことを確認する。
    #[test]
    fn unknown_inv_id_samples_aggregate_by_count() {
        // 先行テストの影響を消すため、明示リセット。
        reset_unknown_inventory_id_samples();

        // Belt を 3 回、Flask を 1 回、Charm を 2 回 push。
        record_unknown_inventory_id("Belt", 2);
        record_unknown_inventory_id("Belt", 2);
        record_unknown_inventory_id("Belt", 2);
        record_unknown_inventory_id("Flask", 0);
        record_unknown_inventory_id("Charm", 2);
        record_unknown_inventory_id("Charm", 2);

        let samples = top_unknown_inventory_id_samples();
        assert_eq!(samples.len(), 3);
        // count 降順: Belt(3) → Charm(2) → Flask(1)
        assert_eq!(samples[0].0, "Belt");
        assert_eq!(samples[0].1, 3);
        assert_eq!(samples[1].0, "Charm");
        assert_eq!(samples[1].1, 2);
        assert_eq!(samples[2].0, "Flask");
        assert_eq!(samples[2].1, 1);

        // 後続テストに影響しないよう片付け。
        reset_unknown_inventory_id_samples();
    }

    /// Phase ο-C: 旧 (`<h1>`) 構造の HTML だけでも OK、新 (`itemHeader` + `lc`)
    /// 構造の HTML だけでも OK、両方欠落かつ itemName も無い場合は NG、
    /// という多パターン許容の挙動を確認する。
    ///
    /// 注: `check_poe2db_html` は HTTP 引いてしまうため、ここでは検証ロジックを
    /// インライン化したヘルパー `validate_poe2db_html_struct` でユニットテスト。
    #[test]
    fn poe2db_html_struct_validator_accepts_old_and_new_layouts() {
        let old_layout = "<html><body><h1>X</h1>\
            <div class=\"itemName\">Atziri</div></body></html>";
        let new_layout = "<html><body>\
            <h3 style='display: none'>X</h3>\
            <div class=\"itemHeader doubleLine\">\
              <div class=\"itemName\"><span class=\"lc\">X</span></div>\
            </div></body></html>";
        let broken = "<html><body><p>nothing</p></body></html>";

        assert!(validate_poe2db_html_struct(old_layout).is_ok());
        assert!(validate_poe2db_html_struct(new_layout).is_ok());
        assert!(validate_poe2db_html_struct(broken).is_err());
    }
}

// ============================================================================
// テスト用ヘルパー: HTTP 経由しない HTML 構造検証 (本体ロジックと同じ判定)
// ============================================================================

/// `check_poe2db_html` の HTML 部分だけを抽出したテスト用バリデータ。
/// 本体ロジックの変更時にこっちも更新すること (DRY のため本体からも参照可能)。
#[cfg(test)]
fn validate_poe2db_html_struct(html: &str) -> Result<(), String> {
    let has_item_name = html.contains("class=\"itemName\"")
        || html.contains("class='itemName'");
    if !has_item_name {
        return Err("itemName missing".to_string());
    }
    let has_h1 = html.contains("<h1");
    let has_hidden_h3 =
        html.contains("<h3") && html.contains("display: none");
    let has_item_header = html.contains("class=\"itemHeader")
        || html.contains("class='itemHeader");
    let has_lc_span =
        html.contains("class=\"lc\"") || html.contains("class='lc'");
    if !(has_h1 || has_hidden_h3 || has_item_header || has_lc_span) {
        return Err("header missing".to_string());
    }
    Ok(())
}

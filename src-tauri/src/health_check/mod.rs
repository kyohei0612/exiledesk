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

// モジュール構成 (2026-09-07 R3: 713 行の単一ファイルを分割):
//   - `unknown_inv`   未知 inventoryId のカウンタ + サンプル収集
//   - `checks_ninja`  poe.ninja index-state スキーマ / search protobuf パース確認
//   - `checks_web`    poe2db HTML 構造 / trade2 filters API 確認
//   - ここ (mod.rs)   定数 / 結果構造体 / client builder / `health_check_all`
// 各子モジュールは `use super::*;` でここの import と兄弟の pub(crate) item を共有する。
mod checks_ninja;
mod checks_web;
mod unknown_inv;

#[cfg(test)]
mod tests;

pub(crate) use checks_ninja::*;
pub(crate) use checks_web::*;
pub use unknown_inv::*;

// ============================================================================
// 定数
// ============================================================================

/// HTTP タイムアウト: 起動時間に響かないよう短く (オーナー指示: 5 秒程度)。
pub(crate) const HEALTH_HTTP_TIMEOUT_SECS: u64 = 5;

/// User-Agent: poe_ninja_client と整合させた礼儀的明記。
pub(crate) const HEALTH_USER_AGENT: &str =
    "ExileDesk/0.1.4 (POE2 health check; contact: nekodori0612@gmail.com)";

/// 各エンドポイント URL。
pub(crate) const POE_NINJA_INDEX_STATE_URL: &str =
    "https://poe.ninja/poe2/api/data/index-state";
pub(crate) const POE2DB_SAMPLE_URL: &str = "https://poe2db.tw/us/Atziris_Splendour";
pub(crate) const TRADE2_FILTERS_URL: &str =
    "https://www.pathofexile.com/api/trade2/data/filters";

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

pub(crate) fn build_health_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(HEALTH_USER_AGENT)
        .timeout(Duration::from_secs(HEALTH_HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("health client build error: {e}"))
}

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

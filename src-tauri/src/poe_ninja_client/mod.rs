//! poe.ninja クライアント (Phase β / engineering-B 実装)。
//!
//! 目的:
//!   - クラフト発見君 V2 のデータソースとして、poe.ninja から
//!     「上位アセンダンシー × 上位キャラ × 装備 items[]」を取得する。
//!   - Phase α の printable string 抽出ロジック (`scripts/phase-alpha-decode-B.mjs`)
//!     を Rust に移植し、依存ゼロで protobuf wire format を解釈する。
//!
//! 確定運用ポリシー (オーナー指示 2026-05-22):
//!   - 起動時毎回 fresh fetch (長期キャッシュなし)
//!   - 人気順優先: 使用率降順でキュー投入 (キュー投入順 = 取得開始順)
//!   - 漸進UI更新: アセンダンシー単位で完了 → Tauri event emit
//!   - レート制限: MIN_REQUEST_INTERVAL_MS 間隔保証 + 並列度 1 (完全シリアル)
//!     429 で exponential backoff、UA 明記
//!   - 対象: 上位 10 アセンダンシー × 50 人 = 500 calls + 10 search + 2 data = 512 calls
//!
//! モジュール構成 (2026-09-07 R3: 2,476 行の単一ファイルを分割):
//!   - `config`           定数 (間隔 / 並列度 / backoff / タイムアウト)
//!   - `status`           キャンセルフラグ、ペナルティ・リトライ可視化、`get_network_status`
//!   - `metrics`          req 通し番号 / rolling window / ON-OFF サイクルログ
//!   - `types`            IPC payload 構造体
//!   - `rate_gate`        グローバルレートゲート
//!   - `http`             client builder / backoff 付き GET / url_encode
//!   - `leagues`          index-state (snapshot meta) / economyLeagues
//!   - `search`           build-index-state / search / character
//!   - `ascendancy_fetch` 1 アセンダンシー分の search → character 並列取得 → 進捗 emit
//!   - `orchestrate`      `craft_v2_fetch_all` (全体フロー: 差分判定 / タイムアウト / checkpoint)
//!   - `cache_convert`    キャッシュ <-> CharacterItems 変換
//!   - `protobuf`         search レスポンスの protobuf パーサ
//!
//! 各子モジュールは `use super::*;` でここの import と兄弟の pub(crate) item を共有する。
//!
//! @author engineering-B
//! @date 2026-05-22

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::{header::HeaderMap, Client, StatusCode};
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::{Mutex, Semaphore};
use tokio::task::JoinSet;
use tokio::time::{sleep, sleep_until, Instant};

use crate::craft_v2_storage::{
    CachedAscendancy, CachedCharacter, CachedRareItem, CachedSkillGroup, CachedUniqueItem, CraftV2Cache, GemUsageCount,
    SkillUsageStats,
};

mod ascendancy_fetch;
mod cache_convert;
mod config;
mod http;
mod leagues;
mod metrics;
mod orchestrate;
mod protobuf;
mod rate_gate;
mod search;
mod status;
mod types;

#[cfg(test)]
mod tests;

// glob 再エクスポート: pub item は crate 外へ、pub(crate) item は crate 内 (health_check 等) と
// 子モジュール (`use super::*`) へ見える。
pub(crate) use ascendancy_fetch::*;
pub(crate) use cache_convert::*;
pub(crate) use config::*;
pub(crate) use http::*;
pub use leagues::*;
pub(crate) use metrics::*;
pub use orchestrate::*;
pub(crate) use protobuf::*;
pub use rate_gate::*;
pub use search::*;
pub use status::*;
pub use types::*;

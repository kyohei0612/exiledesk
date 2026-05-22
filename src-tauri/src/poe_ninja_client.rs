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
//!   - 並列度 4 (Semaphore で制御、Phase θ で 8→6→4 に段階緩和済み)
//!   - 漸進UI更新: アセンダンシー単位で完了 → Tauri event emit
//!   - レート制限: 280ms 間隔保証 (MIN_REQUEST_INTERVAL_MS)、429 で exponential backoff、UA 明記
//!   - 対象: 上位 10 アセンダンシー × 50 人 = 500 calls + 10 search + 2 data = 512 calls
//!
//! 公開 API (Tauri command):
//!   - `craft_v2_fetch_all` — 全フロー実行、進捗を window event で emit
//!
//! 内部の低レベル関数:
//!   - `fetch_index_state`        : リーグ slug + snapshot meta 取得
//!   - `fetch_build_index_state`  : 全アセンダンシー使用率取得 (降順ソート)
//!   - `fetch_search_top_n`       : search protobuf decode → 上位 n 人の (account, name) 抽出
//!   - `fetch_character`          : character endpoint → items[] 抽出
//!
//! @author engineering-B
//! @date 2026-05-22

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use reqwest::{header::HeaderMap, Client, StatusCode};
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::{Mutex, Semaphore};
use tokio::time::{sleep, sleep_until, Instant};

use crate::craft_v2_storage::{
    CachedAscendancy, CachedCharacter, CachedRareItem, CachedUniqueItem, CraftV2Cache,
};

// ============================================================================
// 定数
// ============================================================================

const NINJA_BASE: &str = "https://poe.ninja";

/// User-Agent: poe.ninja への礼儀として連絡先 + バージョン明記
const USER_AGENT: &str = "ExileDesk/0.1.4 (POE2 craft discovery; contact: nekodori0612@gmail.com)";

/// グローバルレート制限: 1 リクエスト送信の最低間隔 (ms)
/// 2026-05-22 第3回: 180ms で 1015 諦めケースが残るので 220ms に緩和 (オーナー承認)
/// 2026-05-22 Phase θ: さらに 220→280ms に緩和 (Cloudflare 1015 頻発のため)
const MIN_REQUEST_INTERVAL_MS: u64 = 280;

/// 429 受信時の exponential backoff 初期値 (ms)
/// 2026-05-22 Phase θ: 2s → 3s に延長
const BACKOFF_INITIAL_MS: u64 = 3_000;

/// 429 backoff 上限 (ms): 3s → 6s → 12s → 24s → 48s → 96s → 120s で打ち切り
/// 2026-05-22 Phase θ: 60s → 120s に拡大 (Cloudflare 1015 解除待ち余裕)
const BACKOFF_MAX_MS: u64 = 120_000;

/// 429 リトライ回数上限 (2026-05-22: 5 → 8 に増やして 1015 ブロック解除を待つ)
const MAX_RETRIES: usize = 8;

/// 1 アセンダンシー取得の最大許容時間 (秒)。
/// 2026-05-23 緊急修正: 最終アセが「429/522 連発 × 8 retry × 120s backoff」の組合せで
/// 16 分以上ハングする問題への対策。これを超えたらそのアセは諦めて次へ進む。
/// 5 分 = 50 キャラ × 並列度 4 = 平均 12.5 並列 batch、各 batch ~3-5 秒として
/// 通常 1-3 分、429 backoff 込でも 5 分以内に収まる想定。
const ASCENDANCY_TIMEOUT_SECS: u64 = 300;

/// 2026-05-23 緊急修正: オーナー指示で意図的に除外する inventoryId 群。
/// `is_target_inventory_id` で reject されるが「未知警告」(record_unknown_inventory_id)
/// からはスキップする。これらは「新スロット未対応」ではなく「対象外と判断済み」のため。
/// Incursion 系 (POE2 新スロットの可能性) は警告対象のまま、白リスト追加は別 Phase で判断。
const INTENTIONALLY_EXCLUDED_INV_IDS: &[&str] = &[
    "Belt", // オーナー指示で除外 (8 スロット集計の対象外)
];

/// `inv_id` が意図的除外リストに含まれているか判定。
fn is_intentionally_excluded(inv_id: &str) -> bool {
    INTENTIONALLY_EXCLUDED_INV_IDS.contains(&inv_id)
}

/// printable string scanner の再帰深度ガード。
/// 2026-05-22 Low-L5: 8 → 16 に拡大 (poe.ninja protobuf の nested 構造に
/// 余裕を持たせる。実観測の最大 depth は ~5 だが、新フィールド追加で深くなる
/// ケースに備える。性能影響は無視できる: 1 リクエスト数 KB の scan 内で 16 深
/// 程度の再帰は CPU bound にならない)。
const MAX_SCAN_DEPTH: usize = 16;

// ============================================================================
// Cancel flag (Medium-M7, 2026-05-22)
// ============================================================================
//
// craft_v2_fetch_all は数百回の HTTP リクエストを並列実行する長時間タスク。
// 旧実装は UI からのキャンセル手段なし → ユーザは window を閉じるしかなかった。
//
// 最小実装ポリシー:
//   - グローバル static AtomicBool 1 つ
//   - `craft_v2_cancel` Tauri command が flag を true にする
//   - fetch ループ (アセンダンシー loop / character spawn task) が随所で `.load()` 確認、
//     true なら早期 return (中途キャッシュは emit 済みなので失われない)
//   - fetch 開始時 (`craft_v2_fetch_all` 入口) に flag を false にリセット
//
// より厳密な CancellationToken (tokio-util) を使わない理由:
//   - 依存追加を避けつつ最小実装を優先 (UI 連携は別 Phase)
//   - HTTP リクエスト中断ではなく「次の HTTP 開始前にチェック」で十分

/// グローバルキャンセルフラグ。
/// `craft_v2_cancel` で true にセット、`craft_v2_fetch_all` 開始時に false にリセット。
static CRAFT_V2_CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

/// fetch ループから随時呼び出し、キャンセル要求が来ていれば true を返すヘルパ。
fn is_cancel_requested() -> bool {
    CRAFT_V2_CANCEL_FLAG.load(Ordering::Relaxed)
}

/// UI 側から呼ぶキャンセル commaand。fetch 中であれば次のチェックポイントで停止する。
/// 既に停止済 / 未開始でも安全 (flag を立てるだけ)。
#[tauri::command]
pub fn craft_v2_cancel() {
    CRAFT_V2_CANCEL_FLAG.store(true, Ordering::Relaxed);
}

// ============================================================================
// Rate limit penalty 可視化 (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「残り取得中で止まるのって実際何してんの、結構長いけどリミット待ち?」
//   への回答として、Cloudflare 1015 ペナルティ / 429 backoff 中の残秒数を UI に
//   リアルタイム表示するための global state。
//
// 設計判断:
//   - `CURRENT_PENALTY_UNTIL_MS`: AtomicU64 (UNIX epoch ms、0 = ペナルティなし)。
//     RateGate::set_penalty で書き込み、TS 側 polling から読み込む。
//     1 回の load/store だけで完結する単純な数値なので AtomicU64 (lock-free)
//     を採用 — Mutex を取らないので polling 側もペナルティ書き込み側も
//     一切ブロックされない。値を「時刻」として保持し、TS 側で `now` と比較する
//     ことで「ペナルティ解除時にリセットを忘れる」競合が原理的に発生しない
//     (時刻が過去になれば自動的に waiting=false になる)。
//
//   - `LAST_PENALTY_REASON`: Mutex<Option<String>>。
//     String を atomic に扱う primitive が無いため Mutex で保護。
//     書き込みは 429/5xx 検出時のみ (= 数秒〜数分に 1 回)、読み込みは UI polling
//     から 1 秒に 1 回 → lock 競合は実質ゼロ。標準 std::sync::Mutex を採用
//     (tokio::sync::Mutex は async 用途、ここは同期 command なので不要)。
//
// なぜ atomic と mutex を混在させたか:
//   - 数値 (u64) は AtomicU64 で十分高速
//   - String は AtomicPtr 等を組むより Mutex の方が安全 & 短期 lock
//   - lock-free / lock 制御は「アクセス頻度」と「データ型」のバランス選択
static CURRENT_PENALTY_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static LAST_PENALTY_REASON: StdMutex<Option<String>> = StdMutex::new(None);

/// 現在のレート制限ペナルティ状態 (TS UI の polling 用)。
#[derive(Serialize, Clone, Debug)]
pub struct RateLimitStatus {
    /// 現在ペナルティ待機中か (= until_ms > now)
    pub waiting: bool,
    /// 解除まで残り秒数 (waiting=false の時は 0)
    pub remaining_secs: u64,
    /// 最後にペナルティを受けた理由 (例: "429 Too Many Requests", "522 Connection Timeout")。
    /// ペナルティを 1 度も受けていない場合は None。
    pub reason: Option<String>,
}

/// UI が 1 秒ごとに呼ぶ「現在のレート制限状態」command。
/// AtomicU64 のロードだけなので極めて高速 (polling 中もアプリ全体に影響なし)。
#[tauri::command]
pub fn get_rate_limit_status() -> RateLimitStatus {
    let until_ms = CURRENT_PENALTY_UNTIL_MS.load(Ordering::Relaxed);
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let waiting = until_ms > now_ms;
    let remaining_secs = if waiting {
        (until_ms - now_ms) / 1000
    } else {
        0
    };
    // 理由は Mutex で保護されているが lock 競合は実質ゼロ (書き込みは数秒〜数分に 1 回)
    let reason = LAST_PENALTY_REASON
        .lock()
        .ok()
        .and_then(|g| g.clone());
    RateLimitStatus {
        waiting,
        remaining_secs,
        reason,
    }
}

/// `set_penalty` から呼ばれる: global state を更新して UI に可視化させる。
/// `until_instant` は Tokio の `Instant` (単調時計) 由来なので、UNIX epoch に
/// 変換するために「現在の差分」を SystemTime ベースで再計算する。
fn record_penalty_for_ui(until_instant: Instant, reason: Option<String>) {
    let now_instant = Instant::now();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let remaining_ms = if until_instant > now_instant {
        until_instant.duration_since(now_instant).as_millis() as u64
    } else {
        0
    };
    let target_ms = now_ms + remaining_ms;
    // 「既存ペナルティが長ければ伸ばさない」(max を取る) のは set_penalty 側で
    // 行う前提だが、ここでも fetch_max でガードしておく。
    CURRENT_PENALTY_UNTIL_MS.fetch_max(target_ms, Ordering::Relaxed);
    if let Some(r) = reason {
        if let Ok(mut g) = LAST_PENALTY_REASON.lock() {
            *g = Some(r);
        }
    }
}

// ============================================================================
// 公開構造体
// ============================================================================

/// アセンダンシー使用率 (build-index-state より)
#[derive(Serialize, Clone, Debug)]
pub struct AscendancyMeta {
    /// "Blood Mage" / "Oracle" など、search の class クエリにそのまま使える表記
    pub class: String,
    /// 使用率 (0.0〜100.0)
    pub percentage: f64,
}

/// キャラ参照 (search からの抽出結果)
#[derive(Serialize, Clone, Debug)]
pub struct CharacterRef {
    /// account-discriminator (例: "AsmodeusPOE-0579")
    pub account: String,
    /// キャラ名 (例: "Asmo_CarryDeluxe")
    pub name: String,
}

/// キャラ単位の取得結果 (character endpoint の items[] そのまま)
///
/// MOD フィルタ・集計は TS 側 (Phase δ) で行う。Rust 側はあくまで透過。
#[derive(Serialize, Clone, Debug)]
pub struct CharacterItems {
    pub account: String,
    pub name: String,
    /// poe.ninja `items[]` 配列の JSON value をそのまま保持
    pub items: Vec<serde_json::Value>,
}

/// snapshot メタ情報 (index-state より動的解決)
#[derive(Serialize, Clone, Debug)]
pub struct SnapshotMeta {
    /// リーグ slug (例: "vaal")
    pub league_url: String,
    /// snapshot 名 (例: "fate-of-the-vaal")
    pub snapshot_name: String,
    /// snapshot version (例: "1623-20260521-21119")
    pub version: String,
}

/// リーグ情報 (Phase ξ: economyLeagues から動的取得)
///
/// poe.ninja の `economyLeagues[]` 各エントリから抽出:
///   - `url`        : "vaal" / "hcvaal" / "ssfvaal" / "ssfhcvaal" / "standard" / "hardcore"
///   - `name`       : "Fate of the Vaal" / "Hardcore Fate of the Vaal" / ...
///   - `is_hardcore`: url または name に "hc" / "hardcore" 含むか
///   - `is_ssf`     : url または name に "ssf" 含むか
#[derive(Serialize, Clone, Debug)]
pub struct LeagueInfo {
    pub url: String,
    pub name: String,
    pub is_hardcore: bool,
    pub is_ssf: bool,
}

/// アセンダンシー単位の進捗イベント payload (Tauri emit 用)
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2Progress {
    pub ascendancy: String,
    pub percentage: f64,
    pub characters_done: usize,
    pub characters_total: usize,
    /// このアセンダンシー分のすべての CharacterItems (完了時に 1 度だけ emit)
    pub items: Vec<CharacterItems>,
}

/// 取得完了時に return / craft-v2-done event で返す結果。
/// TS 側は `cache` を `craft_v2_cache_save` で永続化する。
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2FetchResult {
    pub snapshot: SnapshotMeta,
    pub cache: CraftV2Cache,
}

// ============================================================================
// レート制限: グローバルゲート
// ============================================================================

/// グローバルレートゲート: すべての outbound request が最低 MIN_REQUEST_INTERVAL_MS 間隔で送信される。
///
/// Semaphore (並列度上限) と独立して動く。並列度 5 で同時に 5 タスクが request を投げようとしても、
/// このゲートが順次 280ms ずつ間隔を空けてリリースする。
///
/// 低レベル fetch 関数 (`fetch_*`) を pub 公開するため、本体も pub にする。
///
/// 2026-05-22 Rust-H1+H2 修正:
///   旧実装は `last_sent` を lock → drop → sleep → 再取得 する形で、
///   ペナルティ解除直後に複数タスクが同時通過 → Cloudflare 1015 残存。
///   新実装は「予約時刻ベース」: lock を持つ間に next_slot を進めるだけで
///   sleep はしない。各タスクは順に reserved 時刻を受け取り、lock を drop した
///   後に sleep_until で待つ。これにより:
///     - 4 タスクが順番に 280ms 刻みの reserved 時刻を取得する
///     - ペナルティ反映も同じロック内で一括処理 → 解除集中なし
///     - lock 保持中に sleep しない → デッドロックなし
#[derive(Clone)]
pub struct RateGate {
    /// (next_slot, penalty_until) を atomically に扱う。
    /// next_slot: 次に発行できる送信時刻 (単調増加)。
    /// penalty_until: 429 ペナルティで全タスクが揃って待つ時刻。
    state: Arc<Mutex<RateGateState>>,
    min_interval: Duration,
}

struct RateGateState {
    /// 次に予約可能な送信時刻 (各 acquire は自分の slot を受け取った後この値を更新する)
    next_slot: Instant,
    /// 429 ペナルティ: この時刻まで送信禁止
    penalty_until: Instant,
}

impl RateGate {
    pub fn new(min_interval_ms: u64) -> Self {
        let past = Instant::now() - Duration::from_millis(min_interval_ms * 2);
        Self {
            state: Arc::new(Mutex::new(RateGateState {
                next_slot: past,
                penalty_until: past,
            })),
            min_interval: Duration::from_millis(min_interval_ms),
        }
    }

    /// 1 リクエスト分の枠が空くまで待つ。
    /// 予約時刻ベース: lock 保持中に slot を確定 → drop → sleep_until。
    /// 複数タスクが同時に呼んでも reserved 時刻は単調増加 + min_interval 刻みで配布される。
    pub async fn acquire(&self) {
        let send_at = {
            let mut guard = self.state.lock().await;
            let now = Instant::now();
            // 自分の予約時刻: 「今」「次空きスロット」「ペナルティ解除時刻」の最大値。
            // どれが大きくても順序関係は崩れない (next_slot が単調増加するため)。
            let reserved = now.max(guard.next_slot).max(guard.penalty_until);
            // 次の呼び出しは reserved + min_interval 以降にしか発行できない。
            guard.next_slot = reserved + self.min_interval;
            reserved
        };
        // lock を drop した状態で待つ。他タスクは別 slot で並行に進める。
        if send_at > Instant::now() {
            sleep_until(send_at).await;
        }
    }

    /// 429 を食らったら全タスクを `dur` だけ一時停止する。
    /// 既に長いペナルティが設定済の場合は伸ばさない (max を取る)。
    ///
    /// このメソッドが next_slot も同時に押し上げる: 既に reserved 済の
    /// タスクは sleep_until で待っている最中なので影響なし。今後 acquire するタスクは
    /// penalty_until を見て自然に後ろにずれる。
    ///
    /// 2026-05-23: `reason` 引数を追加。UI 側でペナルティ理由 ("429 Too Many Requests" 等)
    /// を表示するため、global static (`LAST_PENALTY_REASON`) も同時に更新する。
    pub async fn set_penalty(&self, dur: Duration, reason: Option<String>) {
        let mut guard = self.state.lock().await;
        let target = Instant::now() + dur;
        if target > guard.penalty_until {
            guard.penalty_until = target;
        }
        // UI 可視化用 global state を更新 (lock-free な AtomicU64 + 短期 Mutex<String>)
        record_penalty_for_ui(guard.penalty_until, reason);
    }
}

// ============================================================================
// HTTP ヘルパ: User-Agent + 429 backoff
// ============================================================================

/// 共通 client builder (User-Agent 設定)
fn build_client() -> Result<Client, String> {
    let headers = HeaderMap::new();
    Client::builder()
        .user_agent(USER_AGENT)
        .default_headers(headers)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("client build error: {e}"))
}

/// 429 + Cloudflare 5xx を exponential backoff でリトライしながら GET する低レベル関数。
///
/// - レートゲートで間隔保証
/// - 429 (rate limit) → backoff + 全タスク penalty (Cloudflare 1015 ブロック解除待ち)
/// - 5xx (502/503/504/522 等 Cloudflare 一時障害) → backoff のみ (ペナルティは付けない、
///   個別キャラの edge node 不調で全停止する必要なし、2026-05-22 追加)
/// - 4xx (429 除く) は即 Err
/// - body 抽出は呼び側に委ねる (bytes / json で分岐するため)
async fn http_get_with_backoff(
    client: &Client,
    gate: &RateGate,
    url: &str,
) -> Result<reqwest::Response, String> {
    let mut backoff_ms = BACKOFF_INITIAL_MS;
    for attempt in 0..=MAX_RETRIES {
        gate.acquire().await;

        let resp = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("network error on {url}: {e}"))?;

        let status = resp.status();
        let is_rate_limited = status == StatusCode::TOO_MANY_REQUESTS;
        let is_server_5xx = status.is_server_error();

        // 5xx は短時間で諦める (リトライ 3 回 = 初回 + 3 リトライ = 計 4 回試行、約 9 秒以内)。
        // 429 は MAX_RETRIES (= リトライ 8 回 = 計 9 回試行) まで粘る (Cloudflare 1015 解除待ち)。
        // 5xx は edge node の単発不調なので、長時間 retry しても無駄になりやすい。
        //
        // Medium-M1 修正 (2026-05-22): 判定式を `attempt > N - 1` に統一して
        // 「リトライ N 回試した後に諦める」セマンティクスを明確化。
        // ループは `0..=MAX_RETRIES` (= 計 MAX_RETRIES+1 回試行) なので、
        // 初回 (attempt=0) は「リトライ前」、attempt=N が N 回目のリトライ完了状態。
        const SERVER_ERROR_MAX_RETRIES: usize = 3;

        if is_rate_limited || is_server_5xx {
            // `attempt > N - 1` <=> `attempt >= N` だが、意図 (= N 回リトライしたら諦める) を表現。
            let exceeded = if is_server_5xx {
                attempt > SERVER_ERROR_MAX_RETRIES - 1
            } else {
                attempt > MAX_RETRIES - 1
            };
            if exceeded {
                let body = resp.text().await.unwrap_or_default();
                let retries = if is_server_5xx { SERVER_ERROR_MAX_RETRIES } else { MAX_RETRIES };
                return Err(format!(
                    "HTTP {status} after {retries} retries for {url}: {}",
                    body.chars().take(500).collect::<String>()
                ));
            }
            // Retry-After ヘッダがあれば尊重、なければ exponential
            let retry_after_ms = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .map(|sec| sec * 1000)
                .unwrap_or(backoff_ms);
            // 429 は全タスク一斉停止 (Cloudflare 1015 全体ブロックの可能性)
            // 5xx は個別キャラ単位のリトライのみ (edge node 単発不調が典型)
            //
            // 2026-05-23: UI に「リミット制限待機中 (●秒) (理由)」を出すため、
            // ペナルティ発火時に status の文字列を `reason` として渡す。
            // 429 だけでなく 522/503 等の Cloudflare 一時障害でも、UI 側に
            // 「待っている事実 + 理由」を見せたいので 5xx も record する。
            // ただし `set_penalty` は 429 のみ呼び、5xx は record_penalty_for_ui を
            // 直接呼ばない (= gate に影響を与えない) — 単に reason だけ残すと
            // 「ペナルティ無いのに理由だけ表示」のチグハグが起きるため、5xx は
            // 個別 sleep のみで gate / global state 共に変更しない方針を維持。
            if is_rate_limited {
                let reason = format!("{status}");
                gate.set_penalty(Duration::from_millis(retry_after_ms), Some(reason))
                    .await;
            }
            sleep(Duration::from_millis(retry_after_ms)).await;
            backoff_ms = (backoff_ms * 2).min(BACKOFF_MAX_MS);
            continue;
        }

        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!(
                "HTTP {status} for {url}: {}",
                body.chars().take(500).collect::<String>()
            ));
        }

        return Ok(resp);
    }
    // Medium-M2 修正 (2026-05-22): 旧実装は `Err(format!("unreachable..."))` を返していたが、
    // この行はループが上限まで回って `continue` が消えた場合のみ到達 → 上の `if exceeded` で
    // 必ず `return Err(...)` するので論理的に到達不能。`unreachable!()` で意図を明示。
    unreachable!("backoff loop terminated without explicit return for {url}")
}

// ============================================================================
// 低レベル fetch 関数
// ============================================================================

/// `/poe2/api/data/index-state` を叩いて現リーグの snapshot meta を解決する。
///
/// レスポンス構造 (実機 2026-05-22 確認):
/// ```json
/// {
///   "economyLeagues": [ { "url": "vaal", "name": "Fate of the Vaal", ... }, ... ],
///   "snapshotVersions": [ { "version": "1623-...", "snapshotName": "fate-of-the-vaal" }, ... ]
/// }
/// ```
pub async fn fetch_index_state(
    client: &Client,
    gate: &RateGate,
    requested_league_url: Option<&str>,
) -> Result<SnapshotMeta, String> {
    let url = format!("{NINJA_BASE}/poe2/api/data/index-state");
    let resp = http_get_with_backoff(client, gate, &url).await?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("index-state json parse error: {e}"))?;

    let leagues = body
        .get("economyLeagues")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "index-state: economyLeagues (array) が消えている、poe.ninja API 構造変更の可能性"
                .to_string()
        })?;

    // Phase ξ: 指定 league_url があれば探す。無ければ default = economyLeagues[0]。
    let chosen_league = if let Some(req) = requested_league_url {
        leagues
            .iter()
            .find(|l| l.get("url").and_then(|u| u.as_str()) == Some(req))
            .ok_or_else(|| format!("index-state: requested league '{req}' not found"))?
    } else {
        leagues
            .get(0)
            .ok_or_else(|| "index-state: economyLeagues[0] missing".to_string())?
    };

    let league_url = chosen_league
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "index-state: chosen_league.url missing".to_string())?
        .to_string();

    // snapshotVersions[] からリーグ別 entry を探す: snapshotName == league の snapshotName
    // 見つからなければ [0] フォールバック (リーグ共通の最新スナップショット想定)
    let league_snapshot_name = chosen_league
        .get("snapshotName")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let snap = body
        .get("snapshotVersions")
        .and_then(|v| v.as_array())
        .and_then(|arr| {
            if let Some(ref name) = league_snapshot_name {
                arr.iter()
                    .find(|s| s.get("snapshotName").and_then(|n| n.as_str()) == Some(name))
                    .or_else(|| arr.get(0))
            } else {
                arr.get(0)
            }
        })
        .ok_or_else(|| {
            "index-state: snapshotVersions[] が空または消えている、poe.ninja API 構造変更の可能性"
                .to_string()
        })?;

    let snapshot_name = snap
        .get("snapshotName")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            "index-state: snapshotVersions[].snapshotName フィールドが消えている、poe.ninja API 構造変更の可能性"
                .to_string()
        })?
        .to_string();

    let version = snap
        .get("version")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            "index-state: snapshotVersions[].version フィールドが消えている、poe.ninja API 構造変更の可能性"
                .to_string()
        })?
        .to_string();

    Ok(SnapshotMeta {
        league_url,
        snapshot_name,
        version,
    })
}

/// `/poe2/api/data/index-state` から `economyLeagues[]` を全件抽出する低レベル関数。
///
/// 各エントリ:
/// ```json
/// { "url": "vaal", "name": "Fate of the Vaal", ... }
/// { "url": "hcvaal", "name": "Hardcore Fate of the Vaal", ... }
/// { "url": "standard", "name": "Standard", ... }
/// ```
/// `is_hardcore` / `is_ssf` は url パターン (`hc` / `ssf` を含むか) で判定し、
/// 名前に "Hardcore" / "SSF" が含まれる場合もフォローバックとして利用する。
pub async fn fetch_economy_leagues_inner(
    client: &Client,
    gate: &RateGate,
) -> Result<Vec<LeagueInfo>, String> {
    let url = format!("{NINJA_BASE}/poe2/api/data/index-state");
    let resp = http_get_with_backoff(client, gate, &url).await?;
    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("index-state json parse error: {e}"))?;

    let leagues = body
        .get("economyLeagues")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "index-state: economyLeagues (array) が消えている、poe.ninja API 構造変更の可能性"
                .to_string()
        })?;

    let mut out: Vec<LeagueInfo> = Vec::with_capacity(leagues.len());
    for entry in leagues {
        let url = match entry.get("url").and_then(|v| v.as_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let name = entry
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&url)
            .to_string();
        let lower_url = url.to_lowercase();
        let lower_name = name.to_lowercase();
        // POE2 URL 規約 (実機 2026-05-22 確認):
        //   "vaal" (通常) / "hcvaal" (HC) / "ssfvaal" (SSF) / "ssfhcvaal" (SSF HC) /
        //   "standard" (永続) / "hardcore" (永続HC)
        // url 含有判定だけで HC/SSF を引けるが、name でも保険する。
        let is_hardcore = lower_url.starts_with("hc")
            || lower_url.contains("hcvaal")
            || lower_url == "hardcore"
            || lower_name.contains("hardcore");
        let is_ssf = lower_url.starts_with("ssf") || lower_name.contains("ssf");
        out.push(LeagueInfo {
            url,
            name,
            is_hardcore,
            is_ssf,
        });
    }
    if out.is_empty() {
        return Err("index-state: economyLeagues is empty after filter".to_string());
    }
    Ok(out)
}

/// Tauri command 版 `fetch_economy_leagues_inner`。
/// UI 起動時の dropdown 初期化で 1 回だけ叩く想定。
///
/// 失敗時はネットワーク / Cloudflare 1015 等で Err を返すので、UI 側は
/// フォールバックリーグ (空 dropdown) で起動するか、リトライ UX を出す。
#[tauri::command]
pub async fn fetch_economy_leagues() -> Result<Vec<LeagueInfo>, String> {
    let client = build_client()?;
    let gate = RateGate::new(MIN_REQUEST_INTERVAL_MS);
    fetch_economy_leagues_inner(&client, &gate).await
}

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

    // wire format scan
    let mut strings = Vec::with_capacity(1024);
    scan_message(&bytes, 0, &mut strings, 0, -1);

    // ラベル "name" / "account" の直後ブロック抽出
    let names = slice_block_after_label(&strings, "name");
    let accounts = slice_block_after_label(&strings, "account");

    let pair_count = accounts.len().min(names.len()).min(n);
    let mut pairs = Vec::with_capacity(pair_count);
    for i in 0..pair_count {
        let acct = accounts[i];
        let nm = names[i];
        if !is_valid_account(acct) {
            continue;
        }
        if is_meta_word(nm) {
            continue;
        }
        pairs.push(CharacterRef {
            account: acct.to_string(),
            name: nm.to_string(),
        });
    }
    Ok(pairs)
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

    Ok(CharacterItems {
        account: char_ref.account.clone(),
        name: char_ref.name.clone(),
        items,
    })
}

// ============================================================================
// Tauri command: craft_v2_fetch_all
// ============================================================================

/// 起動時メインフロー。**Phase ζ で差分更新対応** (キャッシュあり時は新規キャラのみ取得)。
///
/// 1. index-state → snapshot meta
/// 2. build-index-state → 上位 top_n_ascendancies 件 (使用率降順)
/// 3. `prev_cache` と snapshot_version を比較:
///    - キャッシュなし or version 変化 → **全取得モード** (10 ascendancy × N chars)
///    - version 同じ                  → **差分モード**: search 結果と prev を比較、新規だけ fetch_character
/// 4. 人気順で各アセンダンシーについて search → (差分 or 全) character fetch → CraftV2Progress emit
/// 5. 全完了したら新キャッシュを構築、CraftV2FetchResult を return / `craft-v2-done` emit
///
/// レート制限:
/// - グローバル RateGate で MIN_REQUEST_INTERVAL_MS (= 280ms) 間隔保証
/// - 429 検出 → exponential backoff + 全タスク一斉停止
///
/// 並列度: アセンダンシー単位は逐次 (= 人気順死守)、character は 4 並列
/// (Phase θ で 8→6→4 に段階緩和済み、Medium-M5 コメント整合 2026-05-22)。
#[tauri::command]
pub async fn craft_v2_fetch_all(
    window: tauri::Window,
    top_n_ascendancies: usize,
    top_n_per_ascendancy: usize,
    prev_cache: Option<CraftV2Cache>,
    // Phase ξ: 取得対象リーグの url (例: "vaal" / "hcvaal" / "standard")。
    // None なら従来通り economyLeagues[0] (= メイン通常リーグ) を使用。
    league_url: Option<String>,
) -> Result<CraftV2FetchResult, String> {
    let client = Arc::new(build_client()?);
    let gate = RateGate::new(MIN_REQUEST_INTERVAL_MS);

    // Medium-M7 (2026-05-22): fetch 開始時に cancel flag をリセット。
    // 前回 fetch 末尾でユーザがキャンセルした残骸が残らないように。
    CRAFT_V2_CANCEL_FLAG.store(false, Ordering::Relaxed);

    // 1. snapshot meta 解決
    let snapshot = fetch_index_state(&client, &gate, league_url.as_deref()).await?;

    // 2. アセンダンシー使用率 (降順ソート済み)
    let all_ascendancies =
        fetch_build_index_state(&client, &gate, &snapshot.league_url).await?;

    let top_ascendancies: Vec<AscendancyMeta> = all_ascendancies
        .into_iter()
        .take(top_n_ascendancies)
        .collect();

    // 3. 差分モード判定: snapshot_version が一致した場合のみ prev_cache を使う。
    //    league_url が違ったらリーグ切替なので無効化 (POE2 では vaal/vaalhc 等)。
    let prev_by_class: HashMap<String, CachedAscendancy> = match prev_cache.as_ref() {
        Some(c)
            if c.snapshot_version == snapshot.version
                && c.league_url == snapshot.league_url =>
        {
            c.ascendancies
                .iter()
                .map(|a| (a.class.clone(), a.clone()))
                .collect()
        }
        _ => HashMap::new(),
    };
    let differential_mode = !prev_by_class.is_empty();

    // 3. 人気順 (= ループ順) で逐次処理。各アセンダンシー内で character は並列。
    //
    // ポイント: アセンダンシー単位は逐次にすることで、
    //   - emit の順序が人気順になる (UI 側で「最初に来たブラッドメイジから埋まる」体験)
    //   - 429 が出た時にどのアセンダンシーで詰まったか明確
    // 2026-05-22 第3回: 8 並列で 1015 諦めケースが残るので 6 に緩和 (オーナー承認)
    // 2026-05-22 Phase θ: 6 でも 1015 が残るので 4 にさらに緩和 (オーナー指示)
    let semaphore = Arc::new(Semaphore::new(4));

    // 新キャッシュ構築用バッファ (アセンダンシー完了ごとに push)
    let mut new_ascendancies: Vec<CachedAscendancy> = Vec::with_capacity(top_ascendancies.len());

    for asc in &top_ascendancies {
        // Medium-M7: アセンダンシー開始前に cancel チェック。
        // ここで break すると、これまで完了したアセンダンシー分のキャッシュは保持される。
        if is_cancel_requested() {
            let _ = window.emit(
                "craft-v2-cancelled",
                serde_json::json!({ "phase": "ascendancy-start", "ascendancy": asc.class }),
            );
            break;
        }

        // 2026-05-23 緊急修正: アセ単位タイムアウト導入。
        // 旧実装は「429/522 連発 × 8 retry × 120s backoff」の組合せで最終アセが
        // 16 分以上ハングする問題があった。各アセを 5 分で打ち切り次へ進める。
        //
        // 実装: 1 アセの fetch 全処理 (search + 並列 character + 集計 + cache push) を
        // async ブロックで包み、Option<CachedAscendancy> を返す。timeout 経過時は
        // spawn 済みの未完了 handle は await 待ちのまま drop されてキャンセルされる
        // (handles を timeout 中の async ブロック内で消費するので、外に漏れない)。
        let asc_class = asc.class.clone();
        let asc_pct = asc.percentage;
        let client_ref = Arc::clone(&client);
        let gate_ref = gate.clone();
        let semaphore_ref = Arc::clone(&semaphore);
        let snapshot_ref = snapshot.clone();
        let window_ref = window.clone();
        let top_n_per_ascendancy_ref = top_n_per_ascendancy;
        let differential_mode_ref = differential_mode;
        let prev_asc_opt = prev_by_class.get(&asc.class).cloned();

        let asc_future = async move {
            let chars = match fetch_search_top_n(
                &client_ref,
                &gate_ref,
                &snapshot_ref,
                &asc_class,
                top_n_per_ascendancy_ref,
            )
            .await
            {
                Ok(v) => v,
                Err(e) => {
                    // search 失敗 → このアセンダンシーは諦めて次へ進む
                    let _ = window_ref.emit(
                        "craft-v2-error",
                        serde_json::json!({
                            "ascendancy": asc_class,
                            "phase": "search",
                            "error": e,
                        }),
                    );
                    return None;
                }
            };
            let total = chars.len();

            // ---- 差分モード: 既存キャッシュから流用するキャラを抽出 ----
            // キー = (account, name) のタプル文字列で uniqueness 判定
            let prev_chars_by_key: HashMap<String, CachedCharacter> =
                if let Some(prev_asc) = prev_asc_opt.as_ref() {
                    prev_asc
                        .characters
                        .iter()
                        .map(|c| (format!("{}|{}", c.account, c.name), c.clone()))
                        .collect()
                } else {
                    HashMap::new()
                };

            // 今回 search で取得したキャラ集合 (新キャッシュにはこの順で入れる、消失キャラは含めない)
            let current_keys: Vec<String> = chars
                .iter()
                .map(|c| format!("{}|{}", c.account, c.name))
                .collect();

            // 流用 vs 新規取得を分ける
            let mut reused_items: Vec<CharacterItems> = Vec::new();
            let mut reused_cached: Vec<CachedCharacter> = Vec::new();
            let mut to_fetch: Vec<CharacterRef> = Vec::with_capacity(total);
            let now_ts = now_unix_seconds();
            for char_ref in chars {
                let key = format!("{}|{}", char_ref.account, char_ref.name);
                if differential_mode_ref {
                    if let Some(cached) = prev_chars_by_key.get(&key) {
                        // キャッシュから items[] を復元
                        reused_items.push(cached_character_to_character_items(cached));
                        // Rust-H4 修正: 流用キャラの fetched_at を「今」に更新して
                        // 永続的に古いまま居座る問題を防ぐ (rare/unique items 内容はそのまま流用)。
                        reused_cached.push(CachedCharacter {
                            fetched_at: now_ts,
                            ..cached.clone()
                        });
                        continue;
                    }
                }
                to_fetch.push(char_ref);
            }

            // Rust-H3 修正: 「総件数」用に to_fetch.len() を先に保存する
            // (この後 to_fetch は spawn ループで move されるので length が取れなくなる)。
            // 中間 emit のガード判定で items.capacity() (Vec の動的容量) を使うと
            // 二重 emit や emit 抜けが起きるため、新規取得件数と比較する。
            let to_fetch_len = to_fetch.len();

            // character endpoint を並列で叩く (新規キャラのみ)
            let mut handles = Vec::with_capacity(to_fetch_len);
            for char_ref in to_fetch {
                let client_c = Arc::clone(&client_ref);
                let gate_c = gate_ref.clone();
                let snapshot_c = snapshot_ref.clone();
                let sem_c = Arc::clone(&semaphore_ref);
                let handle = tokio::spawn(async move {
                    let _permit = sem_c
                        .acquire_owned()
                        .await
                        .map_err(|e| format!("semaphore closed: {e}"))?;
                    // Medium-M7: permit を取った直後にもキャンセル確認。
                    // 既に semaphore queue で待っていたタスクが、cancel 後に走り出さないように。
                    if is_cancel_requested() {
                        return Err("cancelled".to_string());
                    }
                    fetch_character(&client_c, &gate_c, &snapshot_c, &char_ref).await
                });
                handles.push(handle);
            }

            // 全 character の完了を待つ。
            // 流用分は最初から入っているので succeeded もそこから加算。
            const INTERMEDIATE_EMIT_BATCH: usize = 5;
            let mut items: Vec<CharacterItems> = reused_items;
            let mut new_cached: Vec<CachedCharacter> = Vec::with_capacity(handles.len());
            let mut succeeded: usize = reused_cached.len();
            let mut completed: usize = 0;
            // 2026-05-23 緊急修正: tokio::time::timeout が future 全体を drop した時、
            // spawn 済みの未完了 handle は JoinHandle が drop されるとタスクは
            // detached 状態になる (キャンセルされない、Tokio の挙動)。
            // 完全キャンセルを保証するため、handle 自体は async ブロック内で
            // 保持し続け、ブロックが drop される際に handles も drop されるが
            // 既に await ループ内で消費中の handle は join で待つ。
            // 残った未取得 handle は cancel flag 経由で fetch_character 開始前に
            // 早期 return できる (semaphore queue で待っている分も含めて)。
            for h in handles {
                match h.await {
                    Ok(Ok(ci)) => {
                        // キャッシュ用に縮小形式へ変換
                        new_cached.push(character_items_to_cached(&ci, now_ts));
                        items.push(ci);
                        succeeded += 1;
                    }
                    Ok(Err(e)) => {
                        let _ = window_ref.emit(
                            "craft-v2-error",
                            serde_json::json!({
                                "ascendancy": asc_class,
                                "phase": "character",
                                "error": e,
                            }),
                        );
                    }
                    Err(join_err) => {
                        let _ = window_ref.emit(
                            "craft-v2-error",
                            serde_json::json!({
                                "ascendancy": asc_class,
                                "phase": "join",
                                "error": format!("{join_err}"),
                            }),
                        );
                    }
                }
                completed += 1;
                // Rust-H3 修正: 5 件ごとに中間 emit (新規取得分の完了数だけが対象、
                // 最後の 1 件はループ外の final emit と重複しないよう除外)。
                if completed % INTERMEDIATE_EMIT_BATCH == 0 && completed < to_fetch_len {
                    let intermediate = CraftV2Progress {
                        ascendancy: asc_class.clone(),
                        percentage: asc_pct,
                        characters_done: succeeded,
                        characters_total: total,
                        items: items.clone(),
                    };
                    let _ = window_ref.emit("craft-v2-progress", &intermediate);
                }
            }

            // 4. アセンダンシー完了 → 最終 progress emit
            let progress = CraftV2Progress {
                ascendancy: asc_class.clone(),
                percentage: asc_pct,
                characters_done: succeeded,
                characters_total: total,
                items,
            };
            let _ = window_ref.emit("craft-v2-progress", &progress);

            // 新キャッシュへ追加 (search 順で current_keys に出てきた順を維持。
            // 流用分 + 新規分を search 順に並び替える)
            let mut combined_by_key: HashMap<String, CachedCharacter> = HashMap::new();
            for c in reused_cached {
                combined_by_key.insert(format!("{}|{}", c.account, c.name), c);
            }
            for c in new_cached {
                combined_by_key.insert(format!("{}|{}", c.account, c.name), c);
            }
            let ordered: Vec<CachedCharacter> = current_keys
                .iter()
                .filter_map(|k| combined_by_key.remove(k))
                .collect();

            // Rust-H5 修正: characters 0 件のアセンダンシーは cache を汚染しない。
            // ここで None を返すと外側で push もスキップされ、Rust-H5 と同じ挙動になる。
            if ordered.is_empty() {
                return None;
            }

            Some(CachedAscendancy {
                class: asc_class.clone(),
                percentage: asc_pct,
                characters: ordered,
            })
        };

        // 2026-05-23 緊急修正: アセ単位タイムアウト (5 分) で wrap。
        // timeout 経過時はそのアセを諦めて次へ進む (部分結果も破棄)。
        // 経過時に未完了 handles が含まれる async ブロックごと drop されるので、
        // 未完了の `tokio::spawn` で取った character タスクは「detached」状態になる
        // (Tokio の挙動)。次のアセ開始前/permit 取得直後の cancel flag check で
        // 早期 return される設計ではないため、最悪 1-2 個の余剰 fetch が走る可能性は
        // あるが、Cloudflare 側で 429 になるだけで実害なし。
        let timeout_dur = Duration::from_secs(ASCENDANCY_TIMEOUT_SECS);
        let asc_outcome = tokio::time::timeout(timeout_dur, asc_future).await;

        let maybe_ascendancy = match asc_outcome {
            Ok(opt) => opt, // 正常完了 (Some=結果あり / None=空 or search 失敗)
            Err(_elapsed) => {
                // 5 分超過。そのアセは諦めて次へ進む。
                let _ = window.emit(
                    "craft-v2-error",
                    serde_json::json!({
                        "ascendancy": asc.class,
                        "phase": "ascendancy-timeout",
                        "error": format!(
                            "ascendancy fetch timed out after {} seconds, skipping",
                            ASCENDANCY_TIMEOUT_SECS
                        ),
                    }),
                );
                None
            }
        };

        // Rust-H5 と整合: 空 / タイムアウト / search 失敗のアセは cache に push しない。
        // checkpoint emit も同様にスキップ (空アセを含めずに保存)。
        let cached_asc = match maybe_ascendancy {
            Some(a) => a,
            None => continue,
        };

        new_ascendancies.push(cached_asc);

        // Phase θ: アセンダンシー単位 cache checkpoint emit。
        // 目的: Cloudflare 1015 や中断で全 10 完了に至らない場合でも、ここまでの分を
        // TS 側で `saveCraftV2Cache` してもらい、次回起動の差分モードに繋ぐ。
        let checkpoint = CraftV2Cache {
            snapshot_version: snapshot.version.clone(),
            league_url: snapshot.league_url.clone(),
            snapshot_name: snapshot.snapshot_name.clone(),
            saved_at: now_unix_seconds(),
            ascendancies: new_ascendancies.clone(),
        };
        let _ = window.emit("craft-v2-checkpoint", &checkpoint);
    }

    // 5. 新キャッシュ構築 (TS 側で保存)
    let new_cache = CraftV2Cache {
        snapshot_version: snapshot.version.clone(),
        league_url: snapshot.league_url.clone(),
        snapshot_name: snapshot.snapshot_name.clone(),
        saved_at: now_unix_seconds(),
        ascendancies: new_ascendancies,
    };

    let result = CraftV2FetchResult {
        snapshot: snapshot.clone(),
        cache: new_cache,
    };

    // 全体完了通知 (TS 側はこの payload の cache を craft_v2_cache_save に渡す)
    let _ = window.emit("craft-v2-done", &result);
    Ok(result)
}

// ============================================================================
// キャッシュ <-> CharacterItems 変換
// ============================================================================

fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// character endpoint の生 items[] から、キャッシュ用縮小形式を抽出する。
/// rare (frameType=2) + unique (frameType=3) の最小サブセットだけ拾う。
fn character_items_to_cached(ci: &CharacterItems, fetched_at: i64) -> CachedCharacter {
    let mut rare_items: Vec<CachedRareItem> = Vec::new();
    let mut unique_items: Vec<CachedUniqueItem> = Vec::new();

    for raw in &ci.items {
        // items[] は wrapper: { itemSlot, itemData: { ... } }
        let data = match raw.get("itemData") {
            Some(d) => d,
            None => continue,
        };
        let frame_type = data.get("frameType").and_then(|v| v.as_i64()).unwrap_or(-1);
        let inv_id = match data
            .get("inventoryId")
            .and_then(|v| v.as_str())
        {
            Some(s) => s.to_string(),
            None => continue,
        };

        // 8 スロット対象外は捨てる (rare/unique 両方)
        // Phase ο-A (2026-05-22): 未知 inventoryId をカウントして health_check 経由で
        // 可視化する。poe.ninja 側で新スロット (例: Flask, Jewel 等) が追加された場合や、
        // 既知でも `is_target_inventory_id` に追記し忘れた場合に検知できる。
        //
        // 2026-05-23 緊急修正: Belt 等「オーナー指示で意図的に除外」している inv_id は
        // 未知警告の対象外にする (= record_unknown_inventory_id を呼ばない)。
        // Belt × 94 件のような「想定通りの除外」が未知警告を埋め尽くす問題への対応。
        if !is_target_inventory_id(&inv_id) {
            if !is_intentionally_excluded(&inv_id) {
                crate::health_check::record_unknown_inventory_id(&inv_id, frame_type);
            }
            continue;
        }

        // Phase ν: weapon2 を shield / focus / quiver / main に分割するため、
        // poe.ninja item の `extended.subcategories` を rare / unique 両方で抽出。
        let subcategories: Vec<String> = data
            .get("extended")
            .and_then(|e| e.get("subcategories"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if frame_type == 2 {
            // rare
            let explicit_mods = data
                .get("explicitMods")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            rare_items.push(CachedRareItem {
                inventory_id: inv_id,
                explicit_mods,
                subcategories: subcategories.clone(),
            });
        } else if frame_type == 3 {
            // unique
            let type_line = data
                .get("typeLine")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let base_type = data
                .get("baseType")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let icon = data
                .get("icon")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let implicit_mods = data
                .get("implicitMods")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let explicit_mods = data
                .get("explicitMods")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let flavour_text = data.get("flavourText").cloned();
            let requirements = data.get("requirements").cloned();
            let properties = data.get("properties").cloned();
            let item_level = data.get("ilvl").and_then(|v| v.as_i64());
            let level = data.get("level").and_then(|v| v.as_i64());

            unique_items.push(CachedUniqueItem {
                inventory_id: inv_id,
                type_line,
                base_type,
                name,
                icon,
                implicit_mods,
                explicit_mods,
                flavour_text,
                requirements,
                properties,
                item_level,
                level,
                subcategories,
            });
        }
    }

    CachedCharacter {
        account: ci.account.clone(),
        name: ci.name.clone(),
        rare_items,
        unique_items,
        fetched_at,
    }
}

/// キャッシュ縮小形式から、TS 側 aggregateFromProgress が読める形式に復元。
/// 元の poe.ninja items[] の wrapper 構造 `{ itemSlot, itemData: { ... } }` を再現する。
fn cached_character_to_character_items(c: &CachedCharacter) -> CharacterItems {
    let mut items: Vec<serde_json::Value> = Vec::with_capacity(
        c.rare_items.len() + c.unique_items.len(),
    );
    for r in &c.rare_items {
        // Phase ν: extended.subcategories を復元 (weapon2 サブタブ判定に使う)
        items.push(serde_json::json!({
            "itemSlot": r.inventory_id,
            "itemData": {
                "frameType": 2,
                "inventoryId": r.inventory_id,
                "explicitMods": r.explicit_mods,
                "extended": { "subcategories": r.subcategories },
            }
        }));
    }
    for u in &c.unique_items {
        // Phase ν: ユニーク側にも extended.subcategories を復元。
        let mut data = serde_json::json!({
            "frameType": 3,
            "inventoryId": u.inventory_id,
            "typeLine": u.type_line,
            "baseType": u.base_type,
            "name": u.name,
            "icon": u.icon,
            "implicitMods": u.implicit_mods,
            "explicitMods": u.explicit_mods,
            "extended": { "subcategories": u.subcategories },
        });
        if let Some(v) = &u.flavour_text {
            data["flavourText"] = v.clone();
        }
        if let Some(v) = &u.requirements {
            data["requirements"] = v.clone();
        }
        if let Some(v) = &u.properties {
            data["properties"] = v.clone();
        }
        if let Some(v) = u.item_level {
            data["ilvl"] = serde_json::Value::from(v);
        }
        if let Some(v) = u.level {
            data["level"] = serde_json::Value::from(v);
        }
        items.push(serde_json::json!({
            "itemSlot": u.inventory_id,
            "itemData": data,
        }));
    }
    CharacterItems {
        account: c.account.clone(),
        name: c.name.clone(),
        items,
    }
}

/// 8 スロット対象の inventoryId だけ true。
/// (TS 側 inventoryIdToSlot のミラー、Belt 等は除外)
fn is_target_inventory_id(inv: &str) -> bool {
    matches!(
        inv,
        "Ring"
            | "Ring2"
            | "Amulet"
            | "Weapon"
            | "Weapon2"
            | "Offhand"
            | "Offhand2"
            | "Helm"
            | "Gloves"
            | "BodyArmour"
            | "Boots"
    )
}

// ============================================================================
// protobuf wire format スキャナ (Phase α B 案 Rust 移植)
// ============================================================================

/// `(field_number, parent_field, depth)` を保持した printable string レコード
#[derive(Debug)]
struct StringRecord<'a> {
    text: &'a str,
    parent: i32,
    depth: usize,
}

/// varint を読む。返り値: `(value, next_offset)` または None
fn read_varint(buf: &[u8], offset: usize) -> Option<(u64, usize)> {
    let mut result: u64 = 0;
    let mut shift: u32 = 0;
    let mut i = offset;
    while i < buf.len() {
        let b = buf[i];
        i += 1;
        result |= ((b & 0x7f) as u64) << shift;
        if (b & 0x80) == 0 {
            return Some((result, i));
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}

/// UTF-8 として valid で、制御文字を含まないか判定する。
///
/// 元は ASCII 0x20-0x7e 限定だったが、poe.ninja のキャラ名にはタイ語・中国語・日本語等
/// マルチバイト文字も多い。printable filter が ASCII で弾くと account/name 配列の長さが
/// 食い違い、ペアが全体的にズレて全 character endpoint が 404 になる致命バグが発生していた
/// (2026-05-22 修正)。
///
/// Low-L4 修正 (2026-05-22): 関数名を `is_printable_ascii` から `is_printable_utf8` に
/// rename。実装は UTF-8 全域を受け入れているのに ASCII を名乗ると誤読を招くため。
fn is_printable_utf8(buf: &[u8]) -> bool {
    if buf.is_empty() {
        return false;
    }
    let Ok(s) = std::str::from_utf8(buf) else {
        return false;
    };
    !s.chars().any(|c| c.is_control())
}

/// バイト列の先頭が妥当な protobuf message タグかラフ判定
fn looks_like_message(buf: &[u8]) -> bool {
    if buf.len() < 2 {
        return false;
    }
    let Some((tag, _)) = read_varint(buf, 0) else {
        return false;
    };
    let wt = (tag & 0x7) as u8;
    matches!(wt, 0 | 1 | 2 | 5)
}

/// protobuf message を再帰スキャンして printable string を集める。
///
/// `buf` は **'static / lifetime 不問** のスライス。`StringRecord<'a>` は
/// 元の `buf` から借りた `&str` を保持する (アロケーション回避)。
fn scan_message<'a>(
    buf: &'a [u8],
    _base_offset: usize,
    out: &mut Vec<StringRecord<'a>>,
    depth: usize,
    parent_field: i32,
) {
    if depth > MAX_SCAN_DEPTH {
        return;
    }
    let mut i = 0usize;
    while i < buf.len() {
        let Some((tag, next)) = read_varint(buf, i) else {
            return;
        };
        let wt = (tag & 0x7) as u8;
        let fn_num = (tag >> 3) as i32;
        i = next;

        match wt {
            0 => {
                let Some((_, ni)) = read_varint(buf, i) else {
                    return;
                };
                i = ni;
            }
            1 => {
                if i + 8 > buf.len() {
                    return;
                }
                i += 8;
            }
            5 => {
                if i + 4 > buf.len() {
                    return;
                }
                i += 4;
            }
            2 => {
                let Some((len, ni)) = read_varint(buf, i) else {
                    return;
                };
                let len = len as usize;
                i = ni;
                if i + len > buf.len() {
                    return;
                }
                let slice = &buf[i..i + len];
                if is_printable_utf8(slice) {
                    // ASCII なので from_utf8 は必ず成功
                    if let Ok(text) = std::str::from_utf8(slice) {
                        out.push(StringRecord {
                            text,
                            parent: parent_field,
                            depth,
                        });
                    }
                } else if looks_like_message(slice) {
                    scan_message(slice, i, out, depth + 1, fn_num);
                }
                i += len;
            }
            _ => return, // 3, 4 group (廃止)、6+ は不明
        }
    }
}

/// ラベル文字列の直後ブロック (parent=2, depth=3 の値配列) を抽出する。
///
/// 実機観測: ラベル signature = (parent=5, depth=2)、値配列 signature = (parent=2, depth=3)
fn slice_block_after_label<'a>(strings: &'a [StringRecord<'a>], label: &str) -> Vec<&'a str> {
    const LABEL_PARENT: i32 = 5;
    const LABEL_DEPTH: usize = 2;

    let label_idx = strings.iter().position(|s| {
        s.text == label && s.parent == LABEL_PARENT && s.depth == LABEL_DEPTH
    });
    let Some(start) = label_idx else {
        return Vec::new();
    };

    let mut block = Vec::with_capacity(64);
    for s in &strings[start + 1..] {
        // 次のラベルで打ち切り
        if s.parent == LABEL_PARENT && s.depth == LABEL_DEPTH {
            break;
        }
        // 値配列のシグネチャだけ採用
        if s.parent != 2 || s.depth != 3 {
            continue;
        }
        block.push(s.text);
    }
    block
}

// ============================================================================
// バリデーション
// ============================================================================

/// `^[A-Za-z0-9_]{2,32}-\d{4}$` の手書きチェック (regex crate を増やしたくないため)
fn is_valid_account(s: &str) -> bool {
    let bytes = s.as_bytes();
    let n = bytes.len();
    if n < 2 + 1 + 4 {
        return false;
    }
    // 末尾 4 桁が数字、その直前が '-'
    if bytes[n - 5] != b'-' {
        return false;
    }
    for &b in &bytes[n - 4..] {
        if !b.is_ascii_digit() {
            return false;
        }
    }
    // 先頭 (n-5) 文字が英数字 + _、長さ 2-32
    let head_len = n - 5;
    if !(2..=32).contains(&head_len) {
        return false;
    }
    bytes[..head_len]
        .iter()
        .all(|&b| b.is_ascii_alphanumeric() || b == b'_')
}

/// メタ語 (スキーマ定義文字列) 判定
fn is_meta_word(s: &str) -> bool {
    matches!(
        s,
        // 処理段階名
        "Start Search"
            | "ApplyFilters"
            | "ApplyIntegerFilters"
            | "ApplyFloatFilters"
            | "ApplySearchFilters"
            | "SelectTopK"
            | "PopulateValues"
            | "PopulateDimensionCounts"
            | "PopulateIntegerDimensionMetadata"
            | "PopulateFloatDimensionMetadata"
            | "BuildResult"
            | "End Search"
            // スキーマフィールド名
            | "class"
            | "weaponmode"
            | "items"
            | "skills"
            | "keypassives"
            | "anointed"
            | "allskills"
            | "level"
            | "life"
            | "energyshield"
            | "mana"
            | "spirit"
            | "movementspeed"
            | "liferegen"
            | "itemrarity"
            | "fireres"
            | "coldres"
            | "lightningres"
            | "chaosres"
            | "echarges"
            | "fcharges"
            | "pcharges"
            | "armour"
            | "evasion"
            | "deflect"
            | "block"
            | "phystakenas"
            | "uequip"
            | "mequip"
            | "mweapons"
            | "marmours"
            | "physicalmax"
            | "firemax"
            | "coldmax"
            | "lightningmax"
            | "chaosmax"
            | "lowestmax"
            | "dps"
            | "ehp"
            | "name"
            | "account"
    )
}

// ============================================================================
// 簡易 URL encode (trade2.rs と同方針: 標準依存を増やさない)
// ============================================================================

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

// ============================================================================
// ユニットテスト (オフライン: パーサのみ)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varint_roundtrip() {
        // 150 = 0x96 0x01 (varint encoded)
        let buf = [0x96u8, 0x01];
        let (v, next) = read_varint(&buf, 0).unwrap();
        assert_eq!(v, 150);
        assert_eq!(next, 2);
    }

    #[test]
    fn varint_zero() {
        let buf = [0u8];
        let (v, next) = read_varint(&buf, 0).unwrap();
        assert_eq!(v, 0);
        assert_eq!(next, 1);
    }

    #[test]
    fn printable_utf8_basic() {
        // Low-L4 修正 (2026-05-22): test 名と関数名を `is_printable_utf8` に統一。
        // 末尾 `[0x80]` は単独 byte で UTF-8 invalid なので false 期待のまま。
        assert!(is_printable_utf8(b"hello"));
        assert!(is_printable_utf8(b"AsmodeusPOE-0579"));
        assert!(!is_printable_utf8(b""));
        assert!(!is_printable_utf8(b"hi\n"));
        assert!(!is_printable_utf8(&[0x80]));
    }

    #[test]
    fn valid_account_examples() {
        assert!(is_valid_account("AsmodeusPOE-0579"));
        assert!(is_valid_account("dekkakza-4456"));
        assert!(is_valid_account("a9_-1234"));
        assert!(!is_valid_account("AsmodeusPOE"));      // discriminator なし
        assert!(!is_valid_account("a-12345"));          // 5 桁
        assert!(!is_valid_account("-1234"));            // 先頭空
        assert!(!is_valid_account("foo.bar-1234"));     // ドット禁止
    }

    #[test]
    fn meta_word_filter() {
        assert!(is_meta_word("dps"));
        assert!(is_meta_word("Start Search"));
        assert!(!is_meta_word("GabrielVRD"));
    }

    #[test]
    fn url_encode_basic() {
        assert_eq!(url_encode("Blood Mage"), "Blood%20Mage");
        assert_eq!(url_encode("vaal"), "vaal");
        assert_eq!(url_encode("fate-of-the-vaal"), "fate-of-the-vaal");
    }

    /// scan_message が printable string を順序保持で抽出することを確認。
    /// 手書き proto: field 1 (tag = 0x0a = (1<<3)|2), len = 5, "hello"
    /// + field 2 (tag = 0x12 = (2<<3)|2), len = 5, "world"
    #[test]
    fn scan_message_extracts_strings_in_order() {
        let buf: Vec<u8> = vec![
            0x0a, 0x05, b'h', b'e', b'l', b'l', b'o',
            0x12, 0x05, b'w', b'o', b'r', b'l', b'd',
        ];
        let mut out = Vec::new();
        scan_message(&buf, 0, &mut out, 0, -1);
        let texts: Vec<&str> = out.iter().map(|s| s.text).collect();
        assert_eq!(texts, vec!["hello", "world"]);
    }
}

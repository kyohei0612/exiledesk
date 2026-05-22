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
//!   - レート制限: 500ms 間隔保証 (MIN_REQUEST_INTERVAL_MS) + 並列度 1 (完全シリアル)
//!     429 で exponential backoff、UA 明記
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
/// 2026-05-23: 並列 4 で 60 秒待ちペナルティ観測のため 280→380ms に追加緩和。
/// 並列度も 4→2 に減らして burst を抑える (CONCURRENT_FETCH_LIMIT 参照)。
/// 2026-05-23 第2回: 並列 2 + 380ms でも 1015 食らうため 380→500ms に追加緩和、
/// 並列も 2→1 (完全シリアル) に。1.0 req/sec まで落として Cloudflare 閾値の
/// 経験則 60-100 req/min を確実に下回る。
/// 計算: 500 req × 500ms = 250 秒 (4 分強)。
/// 2026-05-23 ON/OFF サイクル導入: 並列 1 シリアル 500ms でも 1015 食らうのは
/// Cloudflare の token bucket が「連続送信」を検出しているという仮説に基づき、
/// 200ms 並列 4 で 15 秒送って 10 秒完全休憩 (= token bucket リセット狙い) に切替。
/// 1 サイクル ON 期間 75 req、510 req を約 170 秒 = 6.8 サイクルで完了見込み。
/// 2026-05-23 第3回: ON/OFF の burst でも秒スケールで 1015 食らうことを実機で観測。
/// 「Cloudflare は burst を検出する」結論で完全シリアルに戻す。500ms。
/// ON/OFF 機構自体はコードに残置 (OFF_PERIOD=0 で実質無効化)、将来再有効化用。
const MIN_REQUEST_INTERVAL_MS: u64 = 500;

/// キャラ並列 fetch の上限 (Semaphore のキャパシティ)。
/// 2026-05-23 第2回: 2→1 に減らして完全シリアル送信、burst ゼロ。
/// 同時に複数 in-flight しないので Cloudflare の short window 集中検出を
/// 確実に回避できる。
/// 2026-05-23 ON/OFF サイクル: 1→4 に復活 (ON 期間 15 秒だけ並列 4、その後 10 秒休止)。
/// 累積 req/sec は 75 req / 25 秒 = 3.0 req/sec で、シリアル 500ms の 2.0 req/sec
/// より一見高いが、10 秒の完全休止が token bucket をリセットさせる狙い。
/// 2026-05-23 第3回: ON 中の burst で 1015 食らうため 4→1 に戻す。
/// 完全シリアル + 500ms 間隔 = 2 req/sec で安定動作を狙う。
const CONCURRENT_FETCH_LIMIT: usize = 1;

/// ON/OFF サイクル: ON 期間の長さ (ms)。
/// この期間内は MIN_REQUEST_INTERVAL_MS 間隔で並列 CONCURRENT_FETCH_LIMIT 件まで送信。
/// 15 秒間 × 200ms 間隔 = 最大 75 req/サイクル。
const ON_PERIOD_MS: u64 = 15_000;

/// ON/OFF サイクル: OFF 期間の長さ (ms)。
/// この期間中は全送信ブロック (acquire が次サイクル開始まで sleep)。
/// 10 秒 = Cloudflare の per-IP token bucket がリセットされると経験的に期待される長さ。
/// 短すぎると bucket がフルにならない、長すぎると無駄なアイドル。
/// 2026-05-23 第3回: 0 に設定して ON/OFF 機構を実質無効化 (= 常時 ON、シリアル送信のみ)。
/// 機構自体はコードに残置、将来再有効化する場合は 10_000 等に戻す。
const OFF_PERIOD_MS: u64 = 0;

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

// ============================================================================
// per-character 進捗可視化 (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「取得中ってのは新しいキャラを取り込むときの取得中の事だよ?
//   何で何も取得中に待ってる感じにしてんの」への対応。
//   1 アセ内のキャラ取得進捗 (32/50 など) と現在の並列度を UI に流す。
//
// 設計判断:
//   - `ACTIVE_FETCH_COUNT`: AtomicUsize、`http_get_with_backoff` 前後で fetch_add/sub。
//     並列度 snapshot は emit 時に `load(Relaxed)` で読み込むのみ — lock 不要。
//   - per-character emit は **5 キャラ毎にバッチ** (= 並列 4 で動いてる時、約 1 秒に 1 回)
//     にする。全 50 キャラ毎回 emit すると Tauri IPC オーバーヘッドが上がる。
//     例外: phase 切り替え時 (search→fetching, fetching→completed) は即時 emit。

/// 現在 outbound HTTP リクエストを発行中のタスク数。
/// `http_get_with_backoff` の入口で +1、return 直前 (await 後) で -1。
/// per-character progress emit 時に `current_concurrency` として詰める。
static ACTIVE_FETCH_COUNT: AtomicUsize = AtomicUsize::new(0);

/// fetch ループ内で active fetch count を増減する RAII guard。
/// Drop で必ず減らすので、panic / early return / await 中断のどれでも漏れない。
struct ActiveFetchGuard;
impl ActiveFetchGuard {
    fn new() -> Self {
        ACTIVE_FETCH_COUNT.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for ActiveFetchGuard {
    fn drop(&mut self) {
        ACTIVE_FETCH_COUNT.fetch_sub(1, Ordering::Relaxed);
    }
}

// ============================================================================
// retry 中タスク数の可視化 (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「キャラ取得中でしばらく止まるのはなんでなん? 途中で止まる時あるけど
//   あれなにしてんのそこ」への対応。4 並列のうち 1-2 件が 5xx/429 backoff の sleep
//   中なのに、他の完了済キャラの Semaphore permit を解放できず「N/50 が止まって見える」
//   問題に対し、UI 側で「🔁 再試行中 N 件 (522 Bad Gateway 残 8 秒)」を表示する。
//
// 設計判断:
//   - `ACTIVE_RETRY_COUNT`: AtomicUsize、retry sleep 直前で +1、sleep 完了で -1。
//     RAII guard で panic / early return も漏れない。
//   - `LAST_RETRY_INFO`: StdMutex<Option<RetryInfo>>。直近の retry の理由 + 終了時刻
//     を 1 件だけ保持 (複数並列の場合は最後に書いたもので上書き、UI は 1 行表示なので
//     これで十分)。読み込みは UI polling 1Hz、書き込みは retry 発生時のみ。
static ACTIVE_RETRY_COUNT: AtomicUsize = AtomicUsize::new(0);

/// 直近の retry 情報 (UI polling 用)。
/// `LAST_RETRY_INFO` に格納し、retry sleep 完了後も「最後に何が起きたか」として残す。
/// `until_ms` が過去になれば UI 側は残秒数 0 として扱う。
#[derive(Clone, Debug)]
struct RetryInfo {
    /// 例: "522 Bad Gateway", "429 Too Many Requests"
    reason: String,
    /// sleep が終わる epoch ms (UI 側で `now - until_ms` から残秒数を計算)
    until_ms: u64,
}

static LAST_RETRY_INFO: StdMutex<Option<RetryInfo>> = StdMutex::new(None);

/// retry sleep 中のタスク数を増減する RAII guard。
/// `http_get_with_backoff` で sleep 直前に `new()`、sleep 後に drop することで
/// panic / early return / await 中断のどれでも ACTIVE_RETRY_COUNT が漏れない。
struct ActiveRetryGuard;
impl ActiveRetryGuard {
    fn new() -> Self {
        ACTIVE_RETRY_COUNT.fetch_add(1, Ordering::Relaxed);
        Self
    }
}
impl Drop for ActiveRetryGuard {
    fn drop(&mut self) {
        ACTIVE_RETRY_COUNT.fetch_sub(1, Ordering::Relaxed);
    }
}

/// 直近 retry の理由 + 終了時刻を global state へ書き込む。
/// `http_get_with_backoff` の 429/5xx 分岐で sleep 直前に呼ぶ。
fn record_retry_info(reason: String, retry_after_ms: u64) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let until_ms = now_ms + retry_after_ms;
    if let Ok(mut g) = LAST_RETRY_INFO.lock() {
        *g = Some(RetryInfo { reason, until_ms });
    }
}

/// 現在のネットワーク状態 (TS UI の polling 用)。
///
/// 旧 `RateLimitStatus` を発展させ、retry 情報も統合した payload。
/// rename 経緯 (2026-05-23): 「4 並列の 1-2 件が retry sleep 中」の表示が
/// rate-limit ペナルティとは別軸で必要になったため、命名も `NetworkStatus`
/// (= 通信全般の現在状態) に広げた。
#[derive(Serialize, Clone, Debug)]
pub struct NetworkStatus {
    /// 現在グローバルペナルティ待機中か (= until_ms > now)。
    /// 旧 `waiting` のリネーム — 「rate-limit ペナルティ (= 全タスク一斉停止)」用。
    pub global_penalty_waiting: bool,
    /// グローバルペナルティ解除まで残り秒数 (waiting=false の時は 0)
    pub global_penalty_remaining_secs: u64,
    /// 最後にグローバルペナルティを受けた理由 (例: "429 Too Many Requests")
    pub global_penalty_reason: Option<String>,
    /// 現在 retry sleep 中のタスク数 (5xx/429 backoff 中)。
    /// 4 並列中で 1-2 件が retry なら 1 or 2、全件正常なら 0。
    pub active_retry_count: usize,
    /// 直近 retry の理由 (例: "522 Bad Gateway")。retry 一度も発生していなければ None。
    pub last_retry_reason: Option<String>,
    /// 直近 retry の残秒数 (sleep 終了予定までの残り)。
    /// `LAST_RETRY_INFO.until_ms` が過去になれば 0 を返す。
    pub last_retry_remaining_secs: u64,
    /// ON/OFF サイクルの現在フェーズ。
    /// Some("on") / Some("off") / None (= まだサイクル未開始 = 取得中ではない)。
    /// UI 側で「🛌 休憩中」表示に使う想定 (現状は次 Phase で実装)。
    pub cycle_phase: Option<String>,
    /// 現在フェーズの残秒数。
    ///   - phase="off" のとき: OFF 期間が終わるまで (= 次の ON 開始まで)
    ///   - phase="on" / None のとき: 0 (UI 側で「休憩中」を出さない)
    pub cycle_remaining_secs: u64,
}

/// UI が 1 秒ごとに呼ぶ「現在のネットワーク状態」command。
/// AtomicU64/AtomicUsize のロード + 短期 Mutex<Option<...>> ロードだけなので極めて高速。
///
/// 旧名 `get_rate_limit_status` からのリネーム (2026-05-23) — retry 情報を含む
/// より広いネットワーク状態 payload を返すため。TS 側も合わせて更新。
#[tauri::command]
pub fn get_network_status() -> NetworkStatus {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // --- グローバルペナルティ (旧 RateLimitStatus 相当) ---
    let penalty_until_ms = CURRENT_PENALTY_UNTIL_MS.load(Ordering::Relaxed);
    let global_penalty_waiting = penalty_until_ms > now_ms;
    let global_penalty_remaining_secs = if global_penalty_waiting {
        (penalty_until_ms - now_ms) / 1000
    } else {
        0
    };
    let global_penalty_reason = LAST_PENALTY_REASON
        .lock()
        .ok()
        .and_then(|g| g.clone());

    // --- retry 情報 (新規) ---
    let active_retry_count = ACTIVE_RETRY_COUNT.load(Ordering::Relaxed);
    let (last_retry_reason, last_retry_remaining_secs) = match LAST_RETRY_INFO.lock().ok().and_then(|g| g.clone()) {
        Some(info) => {
            let remaining_secs = if info.until_ms > now_ms {
                (info.until_ms - now_ms) / 1000
            } else {
                0
            };
            (Some(info.reason), remaining_secs)
        }
        None => (None, 0),
    };

    // --- ON/OFF サイクル (2026-05-23) ---
    // CURRENT_OFF_END_MS は acquire の OFF 検出時に「OFF 終了時刻」を書き込む。
    // 過去になれば自動的に ON フェーズとして扱う (= リセット書き込み不要)。
    // 0 のままなら「まだ acquire が一度も呼ばれていない」 or 「OFF にまだ入っていない」
    // = phase は None として UI には何も表示しない。
    let off_end_ms = CURRENT_OFF_END_MS.load(Ordering::Relaxed);
    let (cycle_phase, cycle_remaining_secs) = if off_end_ms == 0 {
        (None, 0)
    } else if off_end_ms > now_ms {
        let remaining = (off_end_ms - now_ms) / 1000;
        (Some("off".to_string()), remaining)
    } else {
        // OFF 終了済 = 現在 ON 期間中 (or サイクル外)。UI 側で「休憩中」を消すために
        // phase="on" を明示的に返す (None だと「まだ未開始」と区別がつかない)。
        (Some("on".to_string()), 0)
    };

    NetworkStatus {
        global_penalty_waiting,
        global_penalty_remaining_secs,
        global_penalty_reason,
        active_retry_count,
        last_retry_reason,
        last_retry_remaining_secs,
        cycle_phase,
        cycle_remaining_secs,
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
// Cloudflare 1015 閾値実測ログ (2026-05-23)
// ============================================================================
//
// 目的:
//   ユーザー指摘「1 並列 500ms でも制限くらう、絶対おかしい、原因解明してくれ」
//   への対応として、各 outbound HTTP リクエストに通し番号 + 直近 60 秒以内の
//   リクエスト数 + セッション経過秒を eprintln! で stderr に詳細出力する。
//
//   これにより「N req in 60 秒で Cloudflare 1015 (= HTTP 429) を食らった」が
//   実測でき、閾値が逆算できる。
//
// 設計判断:
//   - `REQ_COUNTER`: AtomicU64、req# のシーケンス採番 (0001 から)。
//   - `REQ_TIMESTAMPS`: StdMutex<VecDeque<Instant>>、直近 60 秒以内に発行した
//     リクエストの送信時刻のみ保持する rolling window。先頭から古いものを pop して
//     常に 60 秒以内のサンプルだけを残す。lock 範囲は push + 削除 + 長さ取得のみ
//     なので短期 lock、競合は無視できる。
//   - `SESSION_START`: OnceLock<Instant>、プロセス起動からの経過秒を測る基準点。
//     `OnceLock::get_or_init` は thread-safe で最初の 1 回だけ初期化される。
//
// なぜ once_cell ではなく OnceLock:
//   - Cargo.toml に once_cell 依存を追加するのを避けるため (std で代替可能)。
//   - std::sync::OnceLock は Rust 1.70 以降で安定、本プロジェクトは edition=2021 + 最新版 OK。

/// プロセス開始時刻 (= 1 度だけ Instant::now() で初期化)。
/// `SESSION_START.get_or_init(Instant::now)` で thread-safe に初期化される。
static SESSION_START: OnceLock<Instant> = OnceLock::new();

/// 累計リクエスト番号。`fetch_add(1, Relaxed) + 1` で 0001 始まりの連番を採番。
static REQ_COUNTER: AtomicU64 = AtomicU64::new(0);

/// 直近 60 秒以内に発行したリクエスト時刻の rolling window。
/// `record_request_time` で push + 古い要素を pop + 長さを返す。
static REQ_TIMESTAMPS: StdMutex<VecDeque<Instant>> = StdMutex::new(VecDeque::new());

/// セッション開始からの経過秒 (f64)。
/// `SESSION_START` が未初期化なら `Instant::now()` で初期化してから 0.0 を返す。
fn session_elapsed_secs() -> f64 {
    SESSION_START
        .get_or_init(Instant::now)
        .elapsed()
        .as_secs_f64()
}

/// `now` を rolling window に push し、60 秒より古い要素を削除した後の長さを返す。
/// (= 「直近 60 秒間に何件発行したか」を即座に取得)
fn record_request_time(now: Instant) -> usize {
    let mut deque = match REQ_TIMESTAMPS.lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    deque.push_back(now);
    while let Some(&front) = deque.front() {
        if now.duration_since(front) > Duration::from_secs(60) {
            deque.pop_front();
        } else {
            break;
        }
    }
    deque.len()
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

/// per-character 単位の進捗イベント payload (Tauri emit 用、2026-05-23 追加)。
///
/// アセ内のキャラ取得が「今どこまで進んでいるか」「何をしている最中か」を可視化するため、
/// `craft-v2-character-progress` event で emit される。UI 側でヘッダーに
/// 「📥 ブラッドメイジ 32/50 (4 並列)」のように表示する。
///
/// 発火タイミング:
///   - phase="search"    : `fetch_search_top_n` 呼出**前**に 1 回 (上位プレイヤー検索開始)
///   - phase="fetching"  : 5 キャラ完了毎にバッチ emit (per-character オーバーヘッド削減)
///   - phase="completed" : アセ完了時に 1 回 (UI のクリア用)
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2CharacterProgress {
    /// アセンダンシー名 (例: "Blood Mage")
    pub ascendancy: String,
    /// 既に取得済 (成功 + 失敗合計、流用分は含めない)
    pub characters_done: usize,
    /// 該当アセの取得対象キャラ数 (search で得た総数 = 通常 50、検索失敗時は 0)
    pub characters_total: usize,
    /// 現在 fetch 中の並列タスク数 (= ACTIVE_FETCH_COUNT snapshot)。
    /// emit 時点での観測値なので「ちょうど 0」が一瞬で見えることもあるが、UX 上は
    /// 「何個並列で走ってる」目安が立てば十分。
    pub current_concurrency: usize,
    /// "search" | "fetching" | "completed"
    pub phase: String,
}

/// 取得完了時に return / craft-v2-done event で返す結果。
/// TS 側は `cache` を `craft_v2_cache_save` で永続化する。
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2FetchResult {
    pub snapshot: SnapshotMeta,
    pub cache: CraftV2Cache,
}

// ============================================================================
// ON/OFF サイクル: 共有 state + ログ出力ヘルパ (2026-05-23)
// ============================================================================
//
// 目的:
//   Cloudflare 1015 の発火条件が「短時間の累積 req 数」ではなく「連続送信の継続時間」
//   なら、定期的に完全休止を挟むことで token bucket をリセットさせ、ペナルティを
//   回避できる仮説に基づき、ON 期間 + OFF 期間サイクル送信を導入。
//
// 設計判断:
//   - RateGateState 内で cycle_started_at を保持 (= acquire 呼び出しと同じ lock 内で更新)
//   - 加えて UI 表示用に「現在 OFF 中かどうか」をグローバルに公開: AtomicU64 で
//     OFF 終了時刻 (epoch ms) を持ち、`get_network_status` から polling 可能にする。
//   - log_cycle_event: ON/OFF 遷移を session_elapsed_secs を交えて eprintln。
//     ログから「ON/OFF サイクルが実際に効いているか」「req# との対応」が読める。
//
// なぜ global state も用意するか:
//   RateGateState は async Mutex 越しなので Tauri command (sync) から読みづらい。
//   AtomicU64 の OFF_END_MS は lock-free で即時 polling 可能 — UI 1Hz 更新と相性が良い。
//   書き込みは acquire / penalty 設定時のみ (= 数百回/取得で済む)。

/// 現在の OFF 期間が終わる epoch ms (0 = ON 中 or サイクル未開始)。
/// `acquire` で OFF 検出時に「次サイクル開始時刻」を SystemTime ベースに変換して書き込む。
/// UI polling が SystemTime::now() と比較して残秒数を計算する。
static CURRENT_OFF_END_MS: AtomicU64 = AtomicU64::new(0);

/// ON/OFF サイクルログを stderr に出力。session_elapsed_secs を絡めて時系列で読みやすく。
/// `event`: "ON period started" / "OFF period entered, deferring to next cycle" 等。
/// `from`/`to`: Tokio Instant (単調時計)。差分から「いつから・いつまで」を表示。
///
/// 戻り値は () のみ (`let _ = log_cycle_event(...)` で破棄)。
fn log_cycle_event(event: &str, from: Instant, to: Instant) {
    let now_instant = Instant::now();
    let session_t = session_elapsed_secs();
    let from_offset = if from >= now_instant {
        from.duration_since(now_instant).as_secs_f64()
    } else {
        -now_instant.duration_since(from).as_secs_f64()
    };
    let to_offset = if to >= now_instant {
        to.duration_since(now_instant).as_secs_f64()
    } else {
        -now_instant.duration_since(to).as_secs_f64()
    };
    eprintln!(
        "[rate-cycle] {} — T+{:.1}s (from T+{:.1}s, to T+{:.1}s)",
        event,
        session_t,
        session_t + from_offset,
        session_t + to_offset,
    );
}

/// `acquire` の OFF 検出時に呼ばれ、UI polling 用に OFF 終了時刻 (epoch ms) を更新する。
/// `off_end` は Tokio `Instant` (単調時計) 由来なので、SystemTime に変換するために
/// 「now との差分」を計算して足す。
fn record_off_end_for_ui(off_end: Instant) {
    let now_instant = Instant::now();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let remaining_ms = if off_end > now_instant {
        off_end.duration_since(now_instant).as_millis() as u64
    } else {
        0
    };
    let target_ms = now_ms + remaining_ms;
    // ON 中に OFF 情報を消す: target_ms が「過去」になっていたら 0 に書き戻す。
    // 単純化のため fetch_max ではなく直接 store (= 常に最新を書き込む)。
    CURRENT_OFF_END_MS.store(target_ms, Ordering::Relaxed);
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
    /// 現在の ON 期間が始まった時刻 (None = まだ最初の acquire が来ていない)。
    /// ON_PERIOD_MS 経過で OFF 期間に入り、ON_PERIOD_MS + OFF_PERIOD_MS 経過で
    /// 自動的に次サイクルが開始される (= cycle_started_at を最新時刻に更新)。
    /// set_penalty とは独立: ペナルティ中も ON/OFF サイクルは時間で進行する。
    cycle_started_at: Option<Instant>,
}

impl RateGate {
    pub fn new(min_interval_ms: u64) -> Self {
        let past = Instant::now() - Duration::from_millis(min_interval_ms * 2);
        Self {
            state: Arc::new(Mutex::new(RateGateState {
                next_slot: past,
                penalty_until: past,
                cycle_started_at: None,
            })),
            min_interval: Duration::from_millis(min_interval_ms),
        }
    }

    /// 1 リクエスト分の枠が空くまで待つ。
    /// 予約時刻ベース: lock 保持中に slot を確定 → drop → sleep_until。
    /// 複数タスクが同時に呼んでも reserved 時刻は単調増加 + min_interval 刻みで配布される。
    ///
    /// 2026-05-23 ON/OFF サイクル対応:
    /// reserved 時刻が現在サイクルの OFF 期間内に入る場合、次サイクルの ON 開始
    /// (= off_end) まで遅延させる。サイクルは「ON 15 秒 + OFF 10 秒」を 1 周期とし、
    /// 最初の acquire 呼び出しで cycle_started_at が初期化される。
    /// 周期経過後の reserved 時刻に対しては、cycle_started_at を新サイクルに進める
    /// (= ループバックして自然に ON 期間として扱う)。
    pub async fn acquire(&self) {
        let send_at = {
            let mut guard = self.state.lock().await;
            let now = Instant::now();
            // 自分の予約時刻: 「今」「次空きスロット」「ペナルティ解除時刻」の最大値。
            // どれが大きくても順序関係は崩れない (next_slot が単調増加するため)。
            let mut reserved = now.max(guard.next_slot).max(guard.penalty_until);

            // ----- ON/OFF サイクル判定 -----
            let on_period = Duration::from_millis(ON_PERIOD_MS);
            let off_period = Duration::from_millis(OFF_PERIOD_MS);
            let cycle_total = on_period + off_period;

            // reserved 時刻が「どのサイクルに属するか」を判定するため、
            // 必要なら cycle_started_at を最新サイクルへ進める。
            // 初回 (None) は reserved を新サイクル開始時刻として記録。
            // 既存サイクル開始から `cycle_total` 以上経過した reserved に対しては、
            // 経過したサイクル数だけ繰り上げて新サイクル開始時刻を再計算する
            // (= reserved を含むサイクルの先頭に揃える)。
            let cycle_start = match guard.cycle_started_at {
                None => {
                    guard.cycle_started_at = Some(reserved);
                    let _ = log_cycle_event("ON period started", reserved, reserved + on_period);
                    reserved
                }
                Some(start) => {
                    if reserved >= start + cycle_total {
                        // reserved が現在サイクル外。何サイクル進んだか計算して
                        // 新サイクル開始時刻に揃える。
                        let elapsed = reserved.duration_since(start);
                        let cycles_elapsed = elapsed.as_millis() / cycle_total.as_millis();
                        // u128 → u64 サイクル幅。1 サイクル = 25 秒なので u64 で十分。
                        let advance = cycle_total
                            .checked_mul(cycles_elapsed as u32)
                            .unwrap_or(Duration::ZERO);
                        let new_start = start + advance;
                        guard.cycle_started_at = Some(new_start);
                        let _ = log_cycle_event(
                            "ON period started",
                            new_start,
                            new_start + on_period,
                        );
                        new_start
                    } else {
                        start
                    }
                }
            };

            let on_end = cycle_start + on_period;
            let off_end = cycle_start + cycle_total;

            // reserved が OFF 期間内 (on_end <= reserved < off_end) なら、次サイクル
            // 開始 (off_end) まで遅延させる。同時に cycle_started_at も次サイクル
            // 開始時刻に更新 (これにより以降の reserved は新サイクルの ON 期間として扱われる)。
            if reserved >= on_end && reserved < off_end {
                let new_start = off_end;
                let _ = log_cycle_event(
                    "OFF period entered, deferring to next cycle",
                    reserved,
                    new_start,
                );
                // UI polling 用に「OFF 終了時刻」を公開 (= 残秒数表示の元ネタ)。
                record_off_end_for_ui(new_start);
                reserved = new_start;
                guard.cycle_started_at = Some(new_start);
                let _ = log_cycle_event(
                    "ON period started",
                    new_start,
                    new_start + on_period,
                );
            }

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
    // 2026-05-23: per-character 進捗の「並列度」表示用に active fetch count を増減する。
    // RAII guard なので panic / early return / await 中断のどれでも必ず drop で -1 される。
    let _active_guard = ActiveFetchGuard::new();
    let mut backoff_ms = BACKOFF_INITIAL_MS;
    for attempt in 0..=MAX_RETRIES {
        gate.acquire().await;

        // ------------------------------------------------------------------
        // 2026-05-23: Cloudflare 1015 閾値実測ログ (リクエスト直前)
        // ------------------------------------------------------------------
        // gate.acquire() 後 = 実際に送信する直前のタイミングで採番 + 記録する。
        // `req_id` は 0001 始まりの連番 (0-padding 4 桁、9999 超えれば桁あふれ表示)。
        // `in_60s` は直近 60 秒以内の累計リクエスト数 (本リクエストも含む)。
        let req_id = REQ_COUNTER.fetch_add(1, Ordering::Relaxed) + 1;
        let req_time = Instant::now();
        // SESSION_START を初期化 (まだなら) し、経過秒を取得。
        let session_t = session_elapsed_secs();
        let in_60s = record_request_time(req_time);
        eprintln!(
            "[req#{:04}] T+{:.1}s in_60s={} GET {}",
            req_id, session_t, in_60s, url
        );

        let resp = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("network error on {url}: {e}"))?;

        let status = resp.status();
        let is_rate_limited = status == StatusCode::TOO_MANY_REQUESTS;
        let is_server_5xx = status.is_server_error();

        // レスポンスを受け取った直後の所要時間ログ。
        let elapsed_req = req_time.elapsed();
        eprintln!(
            "[req#{:04}] -> {} in {:.0}ms",
            req_id,
            status,
            elapsed_req.as_millis()
        );

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
            // Retry-After ヘッダがあれば尊重、なければ exponential。
            // 429 の場合は header / body dump 前に取得する必要がある (resp.text() で move される)。
            let retry_after_ms = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .map(|sec| sec * 1000)
                .unwrap_or(backoff_ms);

            // ------------------------------------------------------------------
            // 2026-05-23: 429 (Cloudflare 1015) 詳細ログ — 閾値実測用
            // ------------------------------------------------------------------
            // resp を text() で消費する前にヘッダを dump する。retry-after / cf-ray /
            // x-ratelimit-* 等の Cloudflare 固有ヘッダから 1015 vs 1020 の区別、
            // ペナルティ秒数の元ネタを特定する。
            // 既存のリトライ判定 (`exceeded`) と独立に毎回 dump (8 retry 全ての挙動が見える)。
            if is_rate_limited {
                eprintln!(
                    "[req#{:04}] !!! 429 RATE LIMITED — in_60s before this req was {}, retry_after_ms={}",
                    req_id, in_60s, retry_after_ms
                );
                eprintln!("[req#{:04}] 429 headers:", req_id);
                for (k, v) in resp.headers().iter() {
                    eprintln!("    {}: {}", k, v.to_str().unwrap_or("?"));
                }
            }

            if exceeded {
                let body = resp.text().await.unwrap_or_default();
                let retries = if is_server_5xx { SERVER_ERROR_MAX_RETRIES } else { MAX_RETRIES };
                if is_rate_limited {
                    eprintln!(
                        "[req#{:04}] 429 body (first 1KB):\n{}",
                        req_id,
                        body.chars().take(1024).collect::<String>()
                    );
                }
                return Err(format!(
                    "HTTP {status} after {retries} retries for {url}: {}",
                    body.chars().take(500).collect::<String>()
                ));
            }
            // 429 で諦めずリトライする場合も、body 先頭 1KB を dump して
            // Cloudflare error page (1015 vs 1020 vs 別 error) の HTML パターンを観測する。
            // resp はここで text() に move される — 以降は body 文字列だけ手元に残る。
            if is_rate_limited {
                let body = resp.text().await.unwrap_or_default();
                eprintln!(
                    "[req#{:04}] 429 body (first 1KB):\n{}",
                    req_id,
                    body.chars().take(1024).collect::<String>()
                );
            }
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
            // 2026-05-23: UI 可視化のため、sleep 中の retry 情報を global state に記録。
            // 4 並列のうち 1-2 件が sleep 中でも、UI 側は「🔁 再試行中 N 件 (522 残 X 秒)」
            // を表示できる。RAII guard で sleep 中の N をカウント、sleep 後に確実に -1。
            let retry_reason = format!(
                "{} {}",
                status.as_u16(),
                status.canonical_reason().unwrap_or("?")
            );
            record_retry_info(retry_reason, retry_after_ms);
            let _retry_guard = ActiveRetryGuard::new();
            sleep(Duration::from_millis(retry_after_ms)).await;
            drop(_retry_guard); // 明示 drop で N が確実に -1 されてから次ループへ
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
    let semaphore = Arc::new(Semaphore::new(CONCURRENT_FETCH_LIMIT));

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
        // async ブロックで包み、Option<CachedAscendancy> を返す。
        //
        // 2026-05-23 Hotfix (Rust-H6): timeout 発火時に内側で spawn 済みの character
        // タスクが detach されないよう、外側で `join_set_for_abort` を declare し、
        // 内側 async ブロックで JoinSet を載せる (Arc<Mutex<Option<Arc<Mutex<JoinSet>>>>>).
        // timeout 発火時に `abort_all()` を呼ぶことで、Semaphore::new(4) を超えて
        // 累積していた detached task を一掃する。
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
        // Rust-H6: timeout 分岐から JoinSet にアクセスするための共有 slot。
        // 内側 async ブロックは spawn 直後に Some(...) を書き込み、
        // 外側はタイムアウト時にこれを読み出して abort_all を呼ぶ。
        let join_set_for_abort: Arc<Mutex<Option<Arc<Mutex<JoinSet<Result<CharacterItems, String>>>>>>> =
            Arc::new(Mutex::new(None));
        let join_set_for_abort_inner = Arc::clone(&join_set_for_abort);

        let asc_future = async move {
            // alias: 内側 async ブロックで move する handle
            let join_set_for_abort = join_set_for_abort_inner;
            // 2026-05-23: search 開始時に phase="search" を emit。
            // total は確定前なので暫定で top_n_per_ascendancy_ref (= 通常 50) を入れる。
            // 検索失敗時は phase="completed" で done=0, total=0 を emit して UI をクリアする。
            let _ = window_ref.emit(
                "craft-v2-character-progress",
                &CraftV2CharacterProgress {
                    ascendancy: asc_class.clone(),
                    characters_done: 0,
                    characters_total: top_n_per_ascendancy_ref,
                    current_concurrency: ACTIVE_FETCH_COUNT.load(Ordering::Relaxed),
                    phase: "search".to_string(),
                },
            );

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
                    // UI 側でフェーズ表示を消すために completed を投げる
                    let _ = window_ref.emit(
                        "craft-v2-character-progress",
                        &CraftV2CharacterProgress {
                            ascendancy: asc_class.clone(),
                            characters_done: 0,
                            characters_total: 0,
                            current_concurrency: ACTIVE_FETCH_COUNT.load(Ordering::Relaxed),
                            phase: "completed".to_string(),
                        },
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

            // character endpoint を並列で叩く (新規キャラのみ)。
            //
            // 2026-05-23 Hotfix (Rust-H6): 旧実装は `Vec<JoinHandle>` を async ブロック
            // 内で保持していたが、外側の `tokio::time::timeout` が elapsed したとき
            // async ブロックごと drop されると、未完了の JoinHandle は drop されるだけで
            // **タスクは detached 状態のまま走り続ける** (Tokio の仕様: JoinHandle drop
            // ≠ cancel)。これがアセタイムアウトを跨いで累積し、Semaphore::new(4) を
            // 突破した「26 並列」現象を引き起こしていた。
            //
            // 対策: `JoinSet` を使い、外側からアクセス可能な `Arc<Mutex<JoinSet>>` に
            // 載せる。タイムアウト発火時に外側で `set.abort_all()` を呼ぶことで
            // 全 spawn 済みタスクを即 abort できる。タスク内の Semaphore permit は
            // タスクが abort されると _permit binding が drop され、Semaphore の
            // 内部カウンタは確実に回復する。同様に `ActiveFetchGuard` も Drop で
            // ACTIVE_FETCH_COUNT を確実に -1 する (RAII)。
            let join_set: Arc<Mutex<JoinSet<Result<CharacterItems, String>>>> =
                Arc::new(Mutex::new(JoinSet::new()));
            {
                let mut set_guard = join_set.lock().await;
                for char_ref in to_fetch {
                    let client_c = Arc::clone(&client_ref);
                    let gate_c = gate_ref.clone();
                    let snapshot_c = snapshot_ref.clone();
                    let sem_c = Arc::clone(&semaphore_ref);
                    set_guard.spawn(async move {
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
                }
            }
            // Rust-H6: 外側 (timeout 分岐) からアクセスするためのクローン。
            // Arc 経由なので JoinSet 本体は共有。
            *join_set_for_abort.lock().await = Some(Arc::clone(&join_set));

            // 全 character の完了を待つ。
            // 流用分は最初から入っているので succeeded もそこから加算。
            // 2026-05-23: 旧 `INTERMEDIATE_EMIT_BATCH=5` (5 件毎バッチ) は撤廃。
            // 1 件完了毎に emit して N/50 を即時更新するため (retry sleep 中も他並列が
            // 動けば進捗が確実に進む)。
            let mut items: Vec<CharacterItems> = reused_items;
            let mut new_cached: Vec<CachedCharacter> = Vec::with_capacity(to_fetch_len);
            let mut succeeded: usize = reused_cached.len();
            let mut completed: usize = 0;

            // 2026-05-23: fetching 開始 emit。
            // 並列タスクが走り出す前の「これから X 件取得する」状態を UI に見せる。
            // done は reused_cached.len() (流用済) を初期値、total は search で取れた件数。
            let _ = window_ref.emit(
                "craft-v2-character-progress",
                &CraftV2CharacterProgress {
                    ascendancy: asc_class.clone(),
                    characters_done: reused_cached.len(),
                    characters_total: total,
                    current_concurrency: ACTIVE_FETCH_COUNT.load(Ordering::Relaxed),
                    phase: "fetching".to_string(),
                },
            );
            // Rust-H6: JoinSet の `join_next()` を消費するループ。
            // タイムアウト発火時には外側で `abort_all()` が呼ばれており、
            // 残った task は JoinError::is_cancelled() で完了するので join_next() は
            // 即 return する。よって `loop` で全消費しても外側 timeout が elapsed
            // して async ブロックが drop されるまでに到達する。
            // (実際には timeout 後の outer match で `asc_future` の結果は捨てる。)
            loop {
                let mut set_guard = join_set.lock().await;
                let next = set_guard.join_next().await;
                drop(set_guard); // 他の lock 待ちタスクを邪魔しないよう即 release
                let join_result = match next {
                    Some(r) => r,
                    None => break, // 全完了
                };
                match join_result {
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
                // 2026-05-23 改修: 旧実装は `completed % 5 == 0` でバッチ emit していたが、
                // 4 並列のうち 1-2 件が 5xx/429 retry sleep 中の場合、N/50 表示が
                // 数十秒間動かず「止まっている」ように見えた。1 件完了毎に emit すれば、
                // 他キャラが retry 中でも残り並列が完了する度に N が確実に進む。
                // 50 キャラなら最大 50 回 emit、Tauri IPC オーバーヘッドは無視できる。
                //
                // 中間 emit は最後の 1 件 (= ループ外の final emit) と重複させないよう除外。
                if completed < to_fetch_len {
                    let intermediate = CraftV2Progress {
                        ascendancy: asc_class.clone(),
                        percentage: asc_pct,
                        characters_done: succeeded,
                        characters_total: total,
                        items: items.clone(),
                    };
                    let _ = window_ref.emit("craft-v2-progress", &intermediate);
                }
                // 2026-05-23: per-character 進捗 emit (毎件 emit)。
                // succeeded は「流用 + 取得成功」、completed は「新規取得分の処理済」。
                // UI には「合計 succeeded / total」を見せたいので succeeded を使う。
                if completed < to_fetch_len {
                    let _ = window_ref.emit(
                        "craft-v2-character-progress",
                        &CraftV2CharacterProgress {
                            ascendancy: asc_class.clone(),
                            characters_done: succeeded,
                            characters_total: total,
                            current_concurrency: ACTIVE_FETCH_COUNT.load(Ordering::Relaxed),
                            phase: "fetching".to_string(),
                        },
                    );
                }
            }

            // 2026-05-23: アセ完了時の最終 emit。UI 側でフェーズ表示をクリアする。
            // done = total になるよう succeeded を入れる (= 全件処理済み)。
            let _ = window_ref.emit(
                "craft-v2-character-progress",
                &CraftV2CharacterProgress {
                    ascendancy: asc_class.clone(),
                    characters_done: succeeded,
                    characters_total: total,
                    current_concurrency: ACTIVE_FETCH_COUNT.load(Ordering::Relaxed),
                    phase: "completed".to_string(),
                },
            );

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
        //
        // 2026-05-23 Hotfix (Rust-H6): 旧実装は async ブロック drop で detach され
        // てしまい、Semaphore::new(4) を突破して 26 並列まで暴走した。本修正で
        // タイムアウト発火時に明示的に `abort_all()` を呼ぶ。abort 後は:
        //   - JoinSet 内の Task が cancel される
        //   - 各 task の `_permit` (Semaphore OwnedPermit) が drop され Semaphore 回復
        //   - 各 task の RAII `ActiveFetchGuard` が drop され ACTIVE_FETCH_COUNT 回復
        // これにより次アセは確実に 0 並列スタート → Semaphore で 4 並列に整流される。
        let timeout_dur = Duration::from_secs(ASCENDANCY_TIMEOUT_SECS);
        let asc_outcome = tokio::time::timeout(timeout_dur, asc_future).await;

        let maybe_ascendancy = match asc_outcome {
            Ok(opt) => opt, // 正常完了 (Some=結果あり / None=空 or search 失敗)
            Err(_elapsed) => {
                // 5 分超過。そのアセは諦めて次へ進む。
                // Rust-H6: 内側で spawn された全 character task を明示的に abort。
                // JoinSet::abort_all() は各 task に cancel signal を送り、
                // task 内の `.await` 点で JoinError::is_cancelled() を返して終了。
                // Drop chain: cancel → _permit drop → Semaphore 回復、
                //            ActiveFetchGuard drop → ACTIVE_FETCH_COUNT 回復。
                {
                    let slot = join_set_for_abort.lock().await;
                    if let Some(set_arc) = slot.as_ref() {
                        let mut set_guard = set_arc.lock().await;
                        set_guard.abort_all();
                        // abort_all は signal を出すだけ。実際の cancel 完了 (= permit/
                        // guard drop) を待つために、残った task を join_next で消費。
                        // abort されている task は即座に JoinError::is_cancelled() で
                        // return するので、ここでブロックすることはない。
                        while set_guard.join_next().await.is_some() {}
                    }
                }
                let active_after_abort = ACTIVE_FETCH_COUNT.load(Ordering::Relaxed);
                let _ = window.emit(
                    "craft-v2-error",
                    serde_json::json!({
                        "ascendancy": asc.class,
                        "phase": "ascendancy-timeout",
                        "error": format!(
                            "ascendancy fetch timed out after {} seconds, skipping (active_after_abort={})",
                            ASCENDANCY_TIMEOUT_SECS, active_after_abort
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

        // 2026-05-23: アセ完了時の累計リクエスト集計 (Cloudflare 1015 閾値実測用)。
        // 「N アセ取った時点で累計 X req、平均 Y req/sec」を eprintln! に残す。
        // 1015 を食らった瞬間との比較で「どのアセまでに何 req 出したら諦められたか」が分かる。
        let total_reqs = REQ_COUNTER.load(Ordering::Relaxed);
        let session_secs = SESSION_START
            .get_or_init(Instant::now)
            .elapsed()
            .as_secs();
        let avg_rate = total_reqs as f64 / session_secs.max(1) as f64;
        eprintln!(
            "[ascendancy_done] {} — cumulative {} req in {}s (avg {:.2} req/sec)",
            asc.class, total_reqs, session_secs, avg_rate
        );

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

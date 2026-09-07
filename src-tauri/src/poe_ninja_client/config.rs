//! レート制限・並列度・タイムアウト等の定数と、意図的除外 inventoryId
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。


// ============================================================================
// 定数
// ============================================================================

pub(crate) const NINJA_BASE: &str = "https://poe.ninja";

/// User-Agent: poe.ninja への礼儀として連絡先 + バージョン明記
pub(crate) const USER_AGENT: &str = "ExileDesk/0.1.4 (POE2 craft discovery; contact: nekodori0612@gmail.com)";

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
/// 2026-05-23 第4回: コミュニティ情報で GGG 公式の rate limit が判明:
///   短期 12秒/5回 (= 0.42 req/sec 上限)
///   中期 62秒/15回 (= 0.24 req/sec 上限)
///   長期 302秒/30回 (= 0.099 req/sec 上限)
/// 500ms (2.0 req/sec) は全制限超過 → 2500ms (0.4 req/sec) に緩和、
/// 短期制限ぎりぎりクリア。長期制限は超えるが poe.ninja キャッシュサーバは
/// GGG より緩い説があり、まず試す。510 req × 2.5秒 = 21 分。
pub(crate) const MIN_REQUEST_INTERVAL_MS: u64 = 2500;

/// キャラ並列 fetch の上限 (Semaphore のキャパシティ)。
/// 2026-05-23 第2回: 2→1 に減らして完全シリアル送信、burst ゼロ。
/// 同時に複数 in-flight しないので Cloudflare の short window 集中検出を
/// 確実に回避できる。
/// 2026-05-23 ON/OFF サイクル: 1→4 に復活 (ON 期間 15 秒だけ並列 4、その後 10 秒休止)。
/// 累積 req/sec は 75 req / 25 秒 = 3.0 req/sec で、シリアル 500ms の 2.0 req/sec
/// より一見高いが、10 秒の完全休止が token bucket をリセットさせる狙い。
/// 2026-05-23 第3回: ON 中の burst で 1015 食らうため 4→1 に戻す。
/// 完全シリアル + 500ms 間隔 = 2 req/sec で安定動作を狙う。
pub(crate) const CONCURRENT_FETCH_LIMIT: usize = 1;

/// ON/OFF サイクル: ON 期間の長さ (ms)。
/// この期間内は MIN_REQUEST_INTERVAL_MS 間隔で並列 CONCURRENT_FETCH_LIMIT 件まで送信。
/// 15 秒間 × 200ms 間隔 = 最大 75 req/サイクル。
pub(crate) const ON_PERIOD_MS: u64 = 15_000;

/// ON/OFF サイクル: OFF 期間の長さ (ms)。
/// この期間中は全送信ブロック (acquire が次サイクル開始まで sleep)。
/// 10 秒 = Cloudflare の per-IP token bucket がリセットされると経験的に期待される長さ。
/// 短すぎると bucket がフルにならない、長すぎると無駄なアイドル。
/// 2026-05-23 第3回: 0 に設定して ON/OFF 機構を実質無効化 (= 常時 ON、シリアル送信のみ)。
/// 機構自体はコードに残置、将来再有効化する場合は 10_000 等に戻す。
pub(crate) const OFF_PERIOD_MS: u64 = 0;

/// 429 受信時の exponential backoff 初期値 (ms)
/// 2026-05-22 Phase θ: 2s → 3s に延長
pub(crate) const BACKOFF_INITIAL_MS: u64 = 3_000;

/// 429 backoff 上限 (ms): 3s → 6s → 12s → 24s → 48s → 96s → 120s で打ち切り
/// 2026-05-22 Phase θ: 60s → 120s に拡大 (Cloudflare 1015 解除待ち余裕)
pub(crate) const BACKOFF_MAX_MS: u64 = 120_000;

/// 429 リトライ回数上限 (2026-05-22: 5 → 8 に増やして 1015 ブロック解除を待つ)
pub(crate) const MAX_RETRIES: usize = 8;

/// 1 アセンダンシー取得の最大許容時間 (秒)。
/// 2026-05-23 緊急修正: 最終アセが「429/522 連発 × 8 retry × 120s backoff」の組合せで
/// 16 分以上ハングする問題への対策。これを超えたらそのアセは諦めて次へ進む。
/// 5 分 = 50 キャラ × 並列度 4 = 平均 12.5 並列 batch、各 batch ~3-5 秒として
/// 通常 1-3 分、429 backoff 込でも 5 分以内に収まる想定。
pub(crate) const ASCENDANCY_TIMEOUT_SECS: u64 = 300;

/// 2026-05-23 緊急修正: オーナー指示で意図的に除外する inventoryId 群。
/// `is_target_inventory_id` で reject されるが「未知警告」(record_unknown_inventory_id)
/// からはスキップする。これらは「新スロット未対応」ではなく「対象外と判断済み」のため。
/// Incursion 系 (POE2 新スロットの可能性) は警告対象のまま、白リスト追加は別 Phase で判断。
pub(crate) const INTENTIONALLY_EXCLUDED_INV_IDS: &[&str] = &[
    "Belt", // オーナー指示で除外 (8 スロット集計の対象外)
];

/// `inv_id` が意図的除外リストに含まれているか判定。
pub(crate) fn is_intentionally_excluded(inv_id: &str) -> bool {
    INTENTIONALLY_EXCLUDED_INV_IDS.contains(&inv_id)
}

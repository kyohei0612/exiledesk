//! HTTP ヘルパ: client builder / 429・5xx backoff 付き GET / 簡易 URL encode
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// HTTP ヘルパ: User-Agent + 429 backoff
// ============================================================================

/// 共通 client builder (User-Agent 設定)
pub(crate) fn build_client() -> Result<Client, String> {
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
pub(crate) async fn http_get_with_backoff(
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
// 簡易 URL encode (trade2.rs と同方針: 標準依存を増やさない)
// ============================================================================

pub(crate) fn url_encode(s: &str) -> String {
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

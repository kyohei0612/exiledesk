//! POE2 公式 trade2 API クライアント (Tauri command)。
//!
//! オーナー判断 (2026-05-10): trade2 search API は CORS 制約でブラウザから直叩き不可、
//! また rate limit ヘッダ管理の都合で Rust 側に proxy を置く方針。
//!
//! 現状の機能:
//!   - `trade2_search`: query を POST、id / total / result(ID列) を含むレスポンス全体を返す
//!   - `trade2_search_count`: 上の `total` だけ取り出す軽量版（母集団件数表示用）
//!   - `trade2_fetch`: search で取った listing id 列（最大 10）を query_id 付きで照会、listing 詳細を返す
//!
//! rate limit: 成功時はレスポンスに `_ratelimit` (x-rate-limit-* ヘッダ) を足し、429 時はエラー文字列に
//!   `ratelimit={...}` を含める。フロント (services/trade2/pricing.ts) がサーバーの実カウントに合わせて待つ (2026-09-14)。
//!
//! User-Agent: ExileDesk/0.1 (連絡先 hardcode せず、必要なら env で渡す)

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// ============================================================================
// レートの門番 (2026-09-18 オーナー指示:「レート止まるね、どうにか止まらんようにしたい、一括で」)
// ============================================================================
//
// これまでは「送ってみて 429 を食らったら待つ」だったので、罰則 (retry-after) を食らうたびに
// 一括取得が数分〜20 分止まっていた。ここを通る全てのリクエスト (画面からの取得も、裏の一括取得も)
// を 1 か所で数え、**上限に当たる前に間隔を空ける**ようにする。罰則を食らわなければ止まらない。
//
// 規則はサーバーが毎回返す x-rate-limit-ip (上限:窓秒:罰則秒) をそのまま使い、
// x-rate-limit-ip-state (現在数:窓秒:残り罰則秒) で自分の記録とサーバーの数え方を突き合わせる
// (同じ IP から手で検索した分など、こちらの記録に無い呼び出しがあるため)。

/// 窓ごとの規則 (上限, 窓の長さ秒)
type Rule = (u32, i64);

#[derive(Default)]
struct Gate {
    /// 送った時刻 (ミリ秒)。窓の判定に使う
    sends: Vec<i64>,
    /// サーバーが返した規則。取れるまでは既定を使う
    rules: Vec<Rule>,
    /// 罰則などで送れない時刻 (ミリ秒)
    blocked_until: i64,
}

static GATES: StdMutex<Option<HashMap<String, Gate>>> = StdMutex::new(None);

/// 規則が取れるまでの控えめな既定 (search の公表値より 1 段きつめ)
fn default_rules() -> Vec<Rule> {
    vec![(4, 10), (12, 60), (24, 300)]
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// その窓で「あと何ミリ秒待てば 1 枠空くか」。空いていれば 0
fn wait_for_rules(g: &Gate, now: i64) -> i64 {
    let mut wait = (g.blocked_until - now).max(0);
    let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
    for (max, period) in rules {
        // 上限ぴったりまで使うと他の呼び出しとぶつかるので、少し残して止める
        let margin = if max >= 15 { 2 } else { 1 };
        let keep = max.saturating_sub(margin).max(1) as usize;
        let window_ms = period * 1000;
        let in_window: Vec<i64> = g.sends.iter().copied().filter(|t| *t > now - window_ms).collect();
        if in_window.len() >= keep {
            // 一番古い物が窓から出た瞬間に 1 枠空く
            let oldest = in_window[in_window.len() - keep];
            wait = wait.max(oldest + window_ms + 300 - now);
        }
    }
    wait
}

/// 送ってよくなるまで待って、送った記録を残す。全ての trade2 リクエストがここを通る
async fn gate_acquire(kind: &str) {
    loop {
        let wait = {
            let mut guard = match GATES.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let map = guard.get_or_insert_with(HashMap::new);
            let g = map.entry(kind.to_string()).or_default();
            let now = now_ms();
            g.sends.retain(|t| *t > now - 6 * 3600 * 1000);
            let wait = wait_for_rules(g, now);
            if wait <= 0 {
                g.sends.push(now);
            }
            wait
        };
        if wait <= 0 {
            return;
        }
        tokio::time::sleep(Duration::from_millis(wait.min(2000) as u64)).await;
    }
}

/// 応答のヘッダで規則と現在数を合わせる (罰則が残っていればその間は送らない)
fn gate_note(kind: &str, headers: &HeaderMap) {
    let get = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let rules_raw = get("x-rate-limit-ip");
    let state_raw = get("x-rate-limit-ip-state");
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    let g = map.entry(kind.to_string()).or_default();
    let now = now_ms();
    if let Some(raw) = rules_raw {
        let parsed: Vec<Rule> = raw
            .split(',')
            .filter_map(|part| {
                let mut it = part.split(':');
                let max = it.next()?.trim().parse::<u32>().ok()?;
                let period = it.next()?.trim().parse::<i64>().ok()?;
                Some((max, period))
            })
            .collect();
        if !parsed.is_empty() {
            g.rules = parsed;
        }
    }
    if let Some(raw) = state_raw {
        let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
        for (i, part) in raw.split(',').enumerate() {
            let nums: Vec<i64> = part.split(':').filter_map(|x| x.trim().parse::<i64>().ok()).collect();
            let (Some(&cur), Some(&period), Some(&restricted)) = (nums.first(), nums.get(1), nums.get(2)) else {
                continue;
            };
            // 罰則が残っていればその間は送らない
            if restricted > 0 {
                g.blocked_until = g.blocked_until.max(now + restricted * 1000 + 500);
                continue;
            }
            // サーバーの数えた現在数が上限に近い = 同じ IP の別経路 (手で開いた検索など) が使っている。
            // 窓がいつ始まったかは分からないので、窓の長さぶん待ってから再開する (フロントと同じ判断)。
            // ここで「送ったことにする」と、6 時間窓の差分が 10 秒窓にも乗って全部止まってしまう。
            let Some(&(max, _)) = rules.get(i) else { continue };
            let margin = if max >= 15 { 2 } else { 1 };
            if cur >= (max.saturating_sub(margin)) as i64 {
                g.blocked_until = g.blocked_until.max(now + period * 1000);
            }
        }
    }
    g.sends.sort_unstable();
}

/// 429 を食らった時の罰則を控える
fn gate_penalty(kind: &str, retry_after_secs: i64) {
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    let g = map.entry(kind.to_string()).or_default();
    g.blocked_until = g.blocked_until.max(now_ms() + retry_after_secs.max(1) * 1000 + 500);
}

/// 罰則 (429 や x-rate-limit-*-state の restricted) で送れない時の解除予定 (unix 秒)。
///
/// 上限に当たらないための**通常の間隔待ち**はここに入れない。数秒の間隔まで「レート制限中」と
/// 出すと画面のボタンがずっと押せなくなるため、止まっている時だけを出す。
pub fn gate_blocked_until_secs() -> i64 {
    let Ok(mut guard) = GATES.lock() else { return 0 };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let mut until = 0;
    for g in map.values() {
        if g.blocked_until > now {
            until = until.max(g.blocked_until / 1000);
        }
    }
    until
}

/// 次に送れるまでの秒数 (通常の間隔待ちを含む)。進捗表示用
pub fn gate_wait_secs() -> i64 {
    let Ok(mut guard) = GATES.lock() else { return 0 };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let mut wait = 0;
    for g in map.values() {
        wait = wait.max(wait_for_rules(g, now));
    }
    (wait + 999) / 1000
}

const TRADE2_BASE: &str = "https://www.pathofexile.com/api/trade2";
/// 日本語サイト。検索 ID の名前空間が www と別なので、JP サイトで開く検索は JP の API で作る (2026-09-12)
const TRADE2_BASE_JP: &str = "https://jp.pathofexile.com/api/trade2";

fn base_for(site: &Option<String>) -> &'static str {
    match site.as_deref() {
        Some("jp") => TRADE2_BASE_JP,
        _ => TRADE2_BASE,
    }
}
const USER_AGENT: &str =
    "ExileDesk/0.1 (POE2 personal economy dashboard, Tauri app)";

/// オーナー判断 (2026-05-19): 日本語固定で取得（日本語クライアント表記との整合性）
const ACCEPT_LANGUAGE_VALUE: &str = "ja,en;q=0.9";

/// 共通 reqwest::Client ビルダー。User-Agent と Accept-Language を一括設定。
pub(crate) fn build_client() -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static(ACCEPT_LANGUAGE_VALUE));
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .default_headers(headers)
        .build()
        .map_err(|e| format!("client build error: {e}"))
}

/// search レスポンスのうち、興味があるフィールド（total と id）。
#[derive(Debug, Deserialize)]
struct SearchResponse {
    id: Option<String>,
    total: Option<u64>,
    result: Option<Vec<String>>,
}

/// search request body (フロントエンドが組み立てる JSON をそのまま透過)。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRequest {
    pub league: String,
    /// "jp" なら jp.pathofexile.com の API を使う (既定 www)
    #[serde(default)]
    pub site: Option<String>,
    /// trade2 query 全体 (status/type/filters/sort 含む)。
    /// フロントで組み立てる JSON value をそのまま受け取って公式 API に POST する。
    pub query: serde_json::Value,
}

/// search を投げて total / id / 結果 ID 列を返す。
/// rate limit に当たった場合 Err。呼び側で適切に retry / throttle すること。
#[tauri::command]
pub async fn trade2_search(req: SearchRequest) -> Result<serde_json::Value, String> {
    let url = format!("{}/search/poe2/{}", base_for(&req.site), urlencode(&req.league));

    let client = build_client()?;

    // 上限に当たる前にここで待つ (画面の取得も裏の一括取得も同じ門を通る)
    gate_acquire("search").await;
    let res = client
        .post(&url)
        .json(&req.query)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    gate_note("search", res.headers());
    let status = res.status();
    // 429 は Retry-After を抽出してフロントで parse できる形で返す
    if status.as_u16() == 429 {
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        gate_penalty("search", retry_after.parse::<i64>().unwrap_or(60));
        let rl = rate_limit_headers(res.headers());
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 search HTTP 429 retry-after={} ratelimit={}: {}",
            retry_after,
            rl,
            body.chars().take(1000).collect::<String>()
        ));
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 search HTTP {}: {}",
            status,
            body.chars().take(1000).collect::<String>()
        ));
    }

    let rl = rate_limit_headers(res.headers());
    let mut body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("json parse error: {e}"))?;
    if let Some(obj) = body.as_object_mut() {
        obj.insert("_ratelimit".to_string(), rl);
    }
    Ok(body)
}

/// 件数だけを返す軽量版。`total` を取り出してフロントで使いやすく。
#[tauri::command]
pub async fn trade2_search_count(req: SearchRequest) -> Result<u64, String> {
    let body = trade2_search(req).await?;
    let parsed: SearchResponse =
        serde_json::from_value(body).map_err(|e| format!("response parse error: {e}"))?;
    Ok(parsed.total.unwrap_or(0))
}

/// fetch request: search 後に listing id 列を 10 件以下の batch で照会する。
/// query_id は search のレスポンス `id` フィールドを渡す（trade2 の慣習で fetch URL に付ける）。
#[derive(Debug, Serialize, Deserialize)]
pub struct FetchRequest {
    /// 取得したい listing ID 列（trade2 制約により最大 10 件）
    pub ids: Vec<String>,
    /// search レスポンスの `id`（fetch URL の ?query= に乗せる）
    #[serde(rename = "queryId")]
    pub query_id: String,
    /// search と同じサイト ("jp" / 既定 www)
    #[serde(default)]
    pub site: Option<String>,
}

/// listing 詳細を取得する。レスポンス全体（`{ result: [...] }`）をそのままフロントに返す。
/// rate limit は呼び側で sleep を挟むこと（実測 5-10 sec/req）。
#[tauri::command]
pub async fn trade2_fetch(req: FetchRequest) -> Result<serde_json::Value, String> {
    if req.ids.is_empty() {
        return Err("fetch ids is empty".to_string());
    }
    if req.ids.len() > 10 {
        return Err(format!(
            "fetch ids must be <= 10, got {}",
            req.ids.len()
        ));
    }
    let ids_csv = req.ids.join(",");
    let url = format!(
        "{}/fetch/{}?query={}",
        base_for(&req.site),
        ids_csv,
        urlencode(&req.query_id)
    );

    let client = build_client()?;

    gate_acquire("fetch").await;
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    gate_note("fetch", res.headers());
    let status = res.status();
    // 429 は Retry-After を抽出してフロントで parse できる形で返す
    if status.as_u16() == 429 {
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        gate_penalty("fetch", retry_after.parse::<i64>().unwrap_or(60));
        let rl = rate_limit_headers(res.headers());
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 fetch HTTP 429 retry-after={} ratelimit={}: {}",
            retry_after,
            rl,
            body.chars().take(1000).collect::<String>()
        ));
    }
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 fetch HTTP {}: {}",
            status,
            body.chars().take(1000).collect::<String>()
        ));
    }

    let rl = rate_limit_headers(res.headers());
    let mut body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("json parse error: {e}"))?;
    if let Some(obj) = body.as_object_mut() {
        obj.insert("_ratelimit".to_string(), rl);
    }
    Ok(body)
}

/// x-rate-limit-* ヘッダをそのまま JSON にする (2026-09-14)。
/// フロントの擬似レート制限がサーバー側の実カウント (同じ IP の手動検索も含む) に合わせるために使う。
pub(crate) fn rate_limit_headers(h: &HeaderMap) -> serde_json::Value {
    let mut m = serde_json::Map::new();
    for (k, v) in h.iter() {
        let name = k.as_str();
        if name.starts_with("x-rate-limit-") {
            if let Ok(s) = v.to_str() {
                m.insert(name.to_string(), serde_json::Value::String(s.to_string()));
            }
        }
    }
    serde_json::Value::Object(m)
}

/// 簡易 URL encode (Rust 標準は無いので手書き、ASCII + - _ . ~ 以外はパーセント符号化)。
pub(crate) fn urlencode(s: &str) -> String {
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

#[cfg(test)]
mod rate_tests {
    use super::*;

    fn gate(sends: Vec<i64>, rules: Vec<Rule>, blocked_until: i64) -> Gate {
        Gate { sends, rules, blocked_until }
    }

    /// 枠が余っていれば待たない
    #[test]
    fn free_slot_does_not_wait() {
        let now = 1_000_000;
        let g = gate(vec![now - 9_000], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now), 0);
    }

    /// 上限の手前 (余裕 1) まで使ったら、一番古い送信が窓から出るまで待つ
    #[test]
    fn waits_until_oldest_leaves_the_window() {
        let now = 1_000_000;
        // 上限 5 / 10 秒 → 余裕 1 なので 4 件で止める。一番古いのは 3 秒前
        let sends = vec![now - 3_000, now - 2_000, now - 1_000, now - 500];
        let g = gate(sends, vec![(5, 10)], 0);
        // 3 秒前の分が窓 (10 秒) から出るまで = あと 7 秒 + 余白 0.3 秒
        assert_eq!(wait_for_rules(&g, now), 7_300);
    }

    /// 窓が複数ある時は一番長く待つ物に合わせる
    #[test]
    fn takes_the_longest_wait_of_all_windows() {
        let now = 1_000_000;
        let mut sends: Vec<i64> = (0..13).map(|i| now - 50_000 + i * 100).collect();
        sends.push(now - 500);
        let g = gate(sends, vec![(5, 10), (15, 60)], 0);
        // 60 秒窓 (上限 15、余裕 2 → 13 件) の方が長い
        assert!(wait_for_rules(&g, now) > 9_000);
    }

    /// 罰則中はその解除まで待つ
    #[test]
    fn penalty_blocks_until_it_clears() {
        let now = 1_000_000;
        let g = gate(vec![], vec![(5, 10)], now + 30_000);
        assert_eq!(wait_for_rules(&g, now), 30_000);
    }
}

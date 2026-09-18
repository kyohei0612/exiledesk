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
//! rate limit: 全リクエストがこのファイルの門番 (gate_acquire) を通り、上限に当たる前に間隔を空ける (2026-09-18)。
//!   成功時はレスポンスに `_ratelimit` (x-rate-limit-* ヘッダ) を足し、429 時はエラー文字列に
//!   `ratelimit={...}` を含める (フロントはこれを表示と自分の記録の突き合わせに使う)。
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
    /// 同じ IP の別経路 (ブラウザのトレード検索や他のツール) を最後に見つけた時刻 (ミリ秒)。
    /// 2026-09-18: こちらは上限の半分も使っていないのに 429 (retry-after 600 秒) を食らった。
    /// サーバーの数えた回数がこちらの記録より多い = 別経路が枠を使っているので、その間は半分に抑える
    foreign_seen_at: i64,
}

static GATES: StdMutex<Option<HashMap<String, Gate>>> = StdMutex::new(None);

/// 送信記録の保存先 (アプリを閉じても覚えておくため)。起動時に `load_gates` で入れる。
///
/// 2026-09-18 オーナー報告「一括でやった時に死ぬほどレート引っかかる」:
/// 記録がメモリだけだったので、アプリを再起動するたびに「まだ 1 回も送っていない」状態に戻り、
/// 上限いっぱいまで一気に投げて → サーバ側の枠を使い切って長い待ちに入る、を繰り返していた。
/// 今日は更新で 4 回再起動しているので、そのたびにバーストしていたことになる。
static GATE_STORE: StdMutex<Option<std::path::PathBuf>> = StdMutex::new(None);

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct StoredGate {
    sends: Vec<i64>,
    rules: Vec<Rule>,
    blocked_until: i64,
    #[serde(default)]
    foreign_seen_at: i64,
}

/// 起動時に 1 回。保存してあった送信記録を読み込む
pub fn load_gates(path: std::path::PathBuf) {
    if let Ok(mut g) = GATE_STORE.lock() {
        *g = Some(path.clone());
    }
    let Ok(raw) = std::fs::read_to_string(&path) else { return };
    let Ok(stored) = serde_json::from_str::<HashMap<String, StoredGate>>(&raw) else { return };
    let now = now_ms();
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    for (kind, st) in stored {
        let sends: Vec<i64> = st.sends.into_iter().filter(|t| *t > now - 6 * 3600 * 1000).collect();
        let e = map.entry(kind).or_default();
        e.sends = sends;
        e.rules = st.rules;
        e.blocked_until = st.blocked_until;
        e.foreign_seen_at = st.foreign_seen_at;
    }
}

/// 送信記録を保存する (GATES の lock を持っている間に呼ぶ)
fn save_gates_locked(map: &HashMap<String, Gate>) {
    let Some(path) = GATE_STORE.lock().ok().and_then(|g| g.clone()) else { return };
    let stored: HashMap<&String, StoredGate> = map
        .iter()
        .map(|(k, g)| {
            (
                k,
                StoredGate {
                    sends: g.sends.clone(),
                    rules: g.rules.clone(),
                    blocked_until: g.blocked_until,
                    foreign_seen_at: g.foreign_seen_at,
                },
            )
        })
        .collect();
    if let Ok(json) = serde_json::to_string(&stored) {
        let _ = std::fs::write(path, json);
    }
}

/// 規則が取れるまでの控えめな既定 (search の公表値より 1 段きつめ)
fn default_rules() -> Vec<Rule> {
    vec![(4, 10), (12, 60), (24, 300)]
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// 同じ IP の別経路を見つけてから、控えめに投げ続ける時間
const FOREIGN_QUIET_MS: i64 = 10 * 60 * 1000;
/// どの送信も最低これだけは空ける (3 発を 1 秒以内に出すような burst を作らない)
const MIN_SPACING_MS: i64 = 2_000;

/// その窓で「あと何ミリ秒待てば 1 枠空くか」。空いていれば 0
fn wait_for_rules(g: &Gate, now: i64) -> i64 {
    let mut wait = (g.blocked_until - now).max(0);
    // 直前の送信からは最低 MIN_SPACING_MS 空ける (窓に余裕があっても burst にしない)
    if let Some(last) = g.sends.last() {
        wait = wait.max(last + MIN_SPACING_MS - now);
    }
    // 同じ IP の別経路 (ブラウザのトレード検索など) が見えている間は、枠を半分しか使わない
    let shy = now - g.foreign_seen_at < FOREIGN_QUIET_MS;
    let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
    for (max, period) in rules {
        // 上限ぴったりまで使うと他の呼び出しとぶつかるので、少し残して止める
        let margin = if shy { max / 2 } else if max >= 15 { 2 } else { 1 };
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
                save_gates_locked(map);
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
            // サーバーの数えた現在数が**こちらの記録より多く**、かつ上限に近い = 同じ IP の別経路
            // (手で開いた検索など) が使っている。自分の送信だけで上限近くまで使った時は
            // wait_for_rules が正確に待つので、ここでは止めない。
            // 「送ったことにする」のも駄目: 6 時間窓の差分が 10 秒窓にも乗って全部止まる。
            let Some(&(max, _)) = rules.get(i) else { continue };
            let margin = if max >= 15 { 2 } else { 1 };
            let keep = max.saturating_sub(margin).max(1) as i64;
            let own = g.sends.iter().filter(|t| **t > now - period * 1000).count() as i64;
            if cur > own {
                // 別経路が同じ IP の枠を使っている。しばらく控えめにする
                g.foreign_seen_at = now;
            }
            if cur > own && cur >= keep {
                // 窓は滑って動くので、平均すると period/max ごとに 1 枠空く。
                // 超過ぶんだけ待てば上限を下回る (窓の長さぶん丸ごと止めると、
                // 8 銘柄ほどで 5 分止まる = オーナー報告「8 銘柄くらいしか取れない」2026-09-18)。
                let slot_ms = (period * 1000 / max.max(1) as i64).max(1);
                let excess = cur - keep + 1;
                g.blocked_until = g.blocked_until.max(now + slot_ms * excess);
            }
        }
    }
    g.sends.sort_unstable();
    save_gates_locked(map);
}

/// 429 を食らった時の罰則を控える
fn gate_penalty(kind: &str, retry_after_secs: i64) {
    crate::app_log::line_static(&format!(
        "[trade2] {kind} で 429 を受けました (retry-after {retry_after_secs} 秒)"
    ));
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    let g = map.entry(kind.to_string()).or_default();
    g.blocked_until = g.blocked_until.max(now_ms() + retry_after_secs.max(1) * 1000 + 500);
    save_gates_locked(map);
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

/// search レスポンスのうち、件数だけ (trade2_search_count 用)
#[derive(Debug, Deserialize)]
struct SearchResponse {
    total: Option<u64>,
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
/// rate limit は門番 (gate_acquire) が待つので、呼び側で sleep は要らない。
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
        Gate { sends, rules, blocked_until, foreign_seen_at: 0 }
    }

    /// 枠が余っていれば待たない (ただし直前の送信からは最低 MIN_SPACING_MS 空ける)
    #[test]
    fn free_slot_does_not_wait() {
        let now = 1_000_000;
        let g = gate(vec![now - 9_000], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now), 0);
    }

    /// 枠が空いていても 1 秒以内に連発はしない (2026-09-18: 手動の再取得が 3 発を 1 秒で出していた)
    #[test]
    fn burst_is_spaced_out() {
        let now = 1_000_000;
        let g = gate(vec![now - 500], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now), 1_500, "直前の送信から 2 秒空ける");
    }

    /// 別経路が枠を使っている間は半分しか使わない
    #[test]
    fn foreign_traffic_halves_the_budget() {
        let now = 1_000_000;
        let mut g = gate((0..3).map(|i| now - 9_000 + i * 1_000).collect(), vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now), 0, "普段は 4 件まで使える");
        g.foreign_seen_at = now - 1_000;
        assert!(wait_for_rules(&g, now) > 0, "別経路が見えている間は 3 件目で止める");
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

    /// 自分の送信だけで上限近くまで使っても、state ヘッダの現在数で余計に止めない
    /// (止めていた頃は 28 件ごとに 300 秒止まった。2026-09-18 レビュー指摘)
    #[test]
    fn own_sends_do_not_trigger_the_foreign_block() {
        let now = now_ms();
        let key = "test-own";
        {
            let mut guard = GATES.lock().unwrap();
            let map = guard.get_or_insert_with(HashMap::new);
            let g = map.entry(key.to_string()).or_default();
            g.rules = vec![(5, 10)];
            g.sends = vec![now - 3_000, now - 2_000, now - 1_000, now - 500];
            g.blocked_until = 0;
        }
        let mut h = HeaderMap::new();
        h.insert("x-rate-limit-ip", HeaderValue::from_static("5:10:60"));
        // サーバーもこちらと同じ 4 件を数えている = 別経路は無い
        h.insert("x-rate-limit-ip-state", HeaderValue::from_static("4:10:0"));
        gate_note(key, &h);
        let blocked = GATES.lock().unwrap().as_ref().unwrap()[key].blocked_until;
        assert_eq!(blocked, 0, "自分の送信ぶんでは止めない");
        // サーバーの方が多い (手で検索した分がある) 時は、超過ぶんの枠が空くまで止める
        // (上限 5 / 10 秒 なら 1 枠 = 2 秒。窓の長さぶん丸ごとは止めない)
        h.insert("x-rate-limit-ip-state", HeaderValue::from_static("5:10:0"));
        gate_note(key, &h);
        let blocked = GATES.lock().unwrap().as_ref().unwrap()[key].blocked_until;
        assert!(blocked >= now + 2_000 && blocked <= now + 6_000, "超過ぶんだけ待つ (blocked={blocked}, now={now})");
    }

    /// 罰則中はその解除まで待つ
    #[test]
    fn penalty_blocks_until_it_clears() {
        let now = 1_000_000;
        let g = gate(vec![], vec![(5, 10)], now + 30_000);
        assert_eq!(wait_for_rules(&g, now), 30_000);
    }
}

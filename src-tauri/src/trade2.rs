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

//! ## このモジュールの地図 (2026-09-19 に 1066 行から分割)
//!
//!   gate.rs     送信の帳簿と順番待ち。窓ごとの規則 / 最低間隔 / gate_acquire / GateStatus
//!   pace.rs     **どの速さで送るか**。合計の上限 (429 で下がる) とトークンバケット
//!   headers.rs  サーバーの応答を読む。規則 / 現在数 / 罰則 / 別経路の検知
//!   (ここ)      HTTP を投げる (search / fetch、サイトの使い分け、POESESSID)
//!
//! 待ち方を変える時は pace.rs、サーバーの言い分の扱いは headers.rs。

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

mod gate;
mod pace;
mod headers;
mod util;
pub use gate::*;
pub use pace::*;
pub use headers::*;
pub(crate) use util::*;

/// テスト共通の道具 (GATES は 1 つしか無いので、そこを触るテストは順番に走らせる)
#[cfg(test)]
pub(crate) mod testutil {
    use super::*;
    /// テスト用の最低間隔 (search 相当)
    pub const SPACING: i64 = 10_500;
    pub static GLOBAL_TEST_LOCK: StdMutex<()> = StdMutex::new(());
    pub fn gate(sends: Vec<i64>, rules: Vec<Rule>, blocked_until: i64) -> Gate {
        Gate { sends, rules, blocked_until, ..Default::default() }
    }
}

/// ログインしていれば POESESSID を乗せる。
///
/// 2026-09-19 の調査。GGG スタッフ「レート制限はサイトが受け取ったリクエストが多すぎる時に起きる。
/// たいていは同じネットワークのサードパーティ製ツールが原因」= **IP 単位**。
/// コミュニティ側の対処として「トレードサイトに手でログインしておくと枠が増える」が挙がっている
/// (ログインすると匿名の IP 枠ではなく account の枠で数えられる)。
/// 取引履歴で使っているログイン (WebView の POESESSID) をそのまま乗せて確かめる。
/// 効かない / 悪化する時は取引履歴の画面からログアウトすれば元に戻る。
fn with_session(rb: reqwest::RequestBuilder, session: &Option<String>) -> reqwest::RequestBuilder {
    match session {
        Some(v) => rb.header(reqwest::header::COOKIE, format!("POESESSID={v}")),
        None => rb,
    }
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
    /// 裏の巡回からの呼び出し = 枠が空くまで長く待ってよい (画面の取得は 90 秒で諦める)
    #[serde(default)]
    pub patient: bool,
}

/// search を投げて total / id / 結果 ID 列を返す。
/// rate limit に当たった場合 Err。呼び側で適切に retry / throttle すること。
#[tauri::command]
pub async fn trade2_search(app: tauri::AppHandle, req: SearchRequest) -> Result<serde_json::Value, String> {
    trade2_search_with(crate::trade_history::session_value(&app), req).await
}

/// 本体。session はログイン中の POESESSID (無ければ匿名)。
/// 診断プローブ (examples) は AppHandle を持てないのでこちらを直接呼ぶ
pub async fn trade2_search_with(session: Option<String>, req: SearchRequest) -> Result<serde_json::Value, String> {
    let url = format!("{}/search/poe2/{}", base_for(&req.site), urlencode(&req.league));

    let client = build_client()?;

    // 上限に当たる前にここで待つ (画面の取得も裏の一括取得も同じ門を通る)
    gate_acquire_with("search", if req.patient { PATIENT_MAX_WAIT_MS } else { MAX_GATE_WAIT_MS }).await?;
    let res = with_session(client.post(&url), &session)
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
        let rl = rate_limit_headers(res.headers());
        let body = res.text().await.unwrap_or_default();
        gate_penalty("search", retry_after.parse::<i64>().unwrap_or(60), &rl, &body);
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
pub async fn trade2_search_count(app: tauri::AppHandle, req: SearchRequest) -> Result<u64, String> {
    let body = trade2_search(app, req).await?;
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
    /// 裏の巡回からの呼び出し = 枠が空くまで長く待ってよい
    #[serde(default)]
    pub patient: bool,
}

/// listing 詳細を取得する。レスポンス全体（`{ result: [...] }`）をそのままフロントに返す。
/// rate limit は門番 (gate_acquire) が待つので、呼び側で sleep は要らない。
#[tauri::command]
pub async fn trade2_fetch(app: tauri::AppHandle, req: FetchRequest) -> Result<serde_json::Value, String> {
    trade2_fetch_with(crate::trade_history::session_value(&app), req).await
}

/// 本体 (trade2_search_with と同じ理由で分けてある)
pub async fn trade2_fetch_with(session: Option<String>, req: FetchRequest) -> Result<serde_json::Value, String> {
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

    gate_acquire_with("fetch", if req.patient { PATIENT_MAX_WAIT_MS } else { MAX_GATE_WAIT_MS }).await?;
    let res = with_session(client.get(&url), &session)
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
        let rl = rate_limit_headers(res.headers());
        let body = res.text().await.unwrap_or_default();
        gate_penalty("fetch", retry_after.parse::<i64>().unwrap_or(60), &rl, &body);
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

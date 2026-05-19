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
//! 今後の予定:
//!   - rate limit ヘッダパース + 自動 throttle（現状はフロント側で sleep 吸収）
//!
//! User-Agent: ExileDesk/0.1 (連絡先 hardcode せず、必要なら env で渡す)

use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE};
use serde::{Deserialize, Serialize};

const TRADE2_BASE: &str = "https://www.pathofexile.com/api/trade2";
const USER_AGENT: &str =
    "ExileDesk/0.1 (POE2 personal economy dashboard, Tauri app)";

/// オーナー判断 (2026-05-19): 日本語固定で取得（日本語クライアント表記との整合性）
const ACCEPT_LANGUAGE_VALUE: &str = "ja,en;q=0.9";

/// 共通 reqwest::Client ビルダー。User-Agent と Accept-Language を一括設定。
fn build_client() -> Result<reqwest::Client, String> {
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
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub league: String,
    /// trade2 query 全体 (status/type/filters/sort 含む)。
    /// フロントで組み立てる JSON value をそのまま受け取って公式 API に POST する。
    pub query: serde_json::Value,
}

/// search を投げて total / id / 結果 ID 列を返す。
/// rate limit に当たった場合 Err。呼び側で適切に retry / throttle すること。
#[tauri::command]
pub async fn trade2_search(req: SearchRequest) -> Result<serde_json::Value, String> {
    let url = format!("{}/search/poe2/{}", TRADE2_BASE, urlencode(&req.league));

    let client = build_client()?;

    let res = client
        .post(&url)
        .json(&req.query)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = res.status();
    // 429 は Retry-After を抽出してフロントで parse できる形で返す
    if status.as_u16() == 429 {
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 search HTTP 429 retry-after={}: {}",
            retry_after,
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

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("json parse error: {e}"))?;
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
        TRADE2_BASE,
        ids_csv,
        urlencode(&req.query_id)
    );

    let client = build_client()?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = res.status();
    // 429 は Retry-After を抽出してフロントで parse できる形で返す
    if status.as_u16() == 429 {
        let retry_after = res
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "trade2 fetch HTTP 429 retry-after={}: {}",
            retry_after,
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

    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("json parse error: {e}"))?;
    Ok(body)
}

/// 簡易 URL encode (Rust 標準は無いので手書き、ASCII + - _ . ~ 以外はパーセント符号化)。
fn urlencode(s: &str) -> String {
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

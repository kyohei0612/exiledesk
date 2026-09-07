//! index-state (snapshot meta) と economyLeagues の取得
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

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

    // snapshotVersions[] からリーグ別 entry を探す。
    //
    // 2026-09-07 修正: 旧実装は `economyLeagues[].snapshotName` で突き合わせていたが、
    // economyLeagues のエントリに snapshotName フィールドは存在しない
    // (実際のキーは name / url / displayName / hardcore / indexed)。
    // その結果 join キーが常に None になり、無条件で snapshotVersions[0] に
    // フォールバックしていた。つまり **リーグを選んでも version / snapshot_name は
    // 常に先頭リーグのもの** という不整合が起きていた
    // (league_url だけ選択リーグ、実データは別リーグ)。
    //
    // snapshotVersions[] 側は economyLeagues と同じ `url` を持っているので、
    // これを正しい join キーとして使う。
    let snapshot_versions = body
        .get("snapshotVersions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "index-state: snapshotVersions[] が空または消えている、poe.ninja API 構造変更の可能性"
                .to_string()
        })?;

    let snap = snapshot_versions
        .iter()
        .find(|s| s.get("url").and_then(|u| u.as_str()) == Some(league_url.as_str()))
        .ok_or_else(|| {
            format!(
                "index-state: snapshotVersions[] にリーグ '{league_url}' の entry が無い、\
                 poe.ninja API 構造変更の可能性"
            )
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
        // 2026-09-07 修正: 旧実装は URL 規約を「prefix」と誤認していた
        //   (誤) "hcvaal" / "ssfvaal"   ← そんな URL は実在しない
        //   (正) "vaalhc" / "vaalssf" / "forbiddenriteshc" / "runesofaldurhcssf"
        // = HC/SSF は **suffix**。さらに name 側も "Hardcore ..." ではなく
        // "HC Forbidden Rites" 表記なので `contains("hardcore")` も外れており、
        // 結果 HC リーグが全部ソフトコア扱いになっていた。
        //
        // 現在の index-state は各エントリに `hardcore` 真偽値を持っているので、
        // それを一次ソースにし、無い場合だけ suffix / 表記から推定する。
        let is_hardcore = entry
            .get("hardcore")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| {
                lower_url == "hardcore"
                    || lower_url.ends_with("hc")
                    || lower_url.ends_with("hcssf")
                    || lower_name.starts_with("hc ")
                    || lower_name.contains("hardcore")
            });
        // SSF は真偽値フィールドが無いので suffix / 表記から判定する。
        let is_ssf = lower_url.ends_with("ssf")
            || lower_name.starts_with("ssf ")
            || lower_name.contains(" ssf ");
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

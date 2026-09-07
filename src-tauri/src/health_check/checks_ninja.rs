//! poe.ninja index-state のスキーマ確認と search レスポンスの protobuf パース確認
//!
//! health_check.rs (714 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// 1. poe.ninja API スキーマチェック
// ============================================================================

/// `/poe2/api/data/index-state` を 1 回 GET し、必須フィールドを確認する。
///
/// 必須:
///   - `economyLeagues` が配列で 1 件以上
///   - 各 economyLeagues[].url が文字列
///   - `snapshotVersions` が配列で 1 件以上
///   - 各 snapshotVersions[].version と snapshotName が文字列
pub(crate) async fn check_poe_ninja_schema(client: &Client) -> Result<(), String> {
    let resp = client
        .get(POE_NINJA_INDEX_STATE_URL)
        .send()
        .await
        .map_err(|e| format!("poe.ninja index-state network error: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(format!(
            "poe.ninja index-state HTTP {status}: 構造変更/障害の可能性"
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("poe.ninja index-state json parse error: {e}"))?;

    // economyLeagues チェック
    let leagues = body
        .get("economyLeagues")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "poe.ninja: フィールド 'economyLeagues' が消えている、API 構造変更の可能性"
                .to_string()
        })?;
    if leagues.is_empty() {
        return Err(
            "poe.ninja: 'economyLeagues' が空配列、リーグ未定義/構造変更の可能性"
                .to_string(),
        );
    }
    for (i, entry) in leagues.iter().enumerate() {
        if entry.get("url").and_then(|v| v.as_str()).is_none() {
            return Err(format!(
                "poe.ninja: economyLeagues[{i}].url 欠落、構造変更の可能性"
            ));
        }
    }

    // snapshotVersions チェック
    let snaps = body
        .get("snapshotVersions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            "poe.ninja: フィールド 'snapshotVersions' が消えている、API 構造変更の可能性"
                .to_string()
        })?;
    if snaps.is_empty() {
        return Err(
            "poe.ninja: 'snapshotVersions' が空配列、構造変更の可能性".to_string()
        );
    }
    for (i, entry) in snaps.iter().enumerate() {
        if entry.get("version").and_then(|v| v.as_str()).is_none() {
            return Err(format!(
                "poe.ninja: snapshotVersions[{i}].version 欠落、構造変更の可能性"
            ));
        }
        if entry
            .get("snapshotName")
            .and_then(|v| v.as_str())
            .is_none()
        {
            return Err(format!(
                "poe.ninja: snapshotVersions[{i}].snapshotName 欠落、構造変更の可能性"
            ));
        }
    }

    // search レスポンス (protobuf) のパース検証。
    //
    // 2026-09-07 追加の背景:
    //   index-state / build-index-state は素直な JSON なのでフィールド検査で守れるが、
    //   「上位プレイヤーMOD一覧」の中核である search は .proto を持たない
    //   リバースエンジニアリング実装で、**一番壊れやすいのにノーチェックだった**。
    //   実際 2026-09 のリーグ切替でカラムのフィールド番号が変わり、パースが
    //   全件 0 件を返してこの機能が丸ごと無言で死んだ (HTTP は 200 のまま)。
    //   スキーマ検査を通り抜ける以上、実際にパースして確かめるしかない。
    let current_league_url = leagues[0]
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let snap = snaps
        .iter()
        .find(|s| s.get("url").and_then(|u| u.as_str()) == Some(current_league_url));
    if let Some(snap) = snap {
        let version = snap.get("version").and_then(|v| v.as_str()).unwrap_or("");
        let overview = snap
            .get("snapshotName")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        check_poe_ninja_search_parse(client, version, overview).await?;
    }

    Ok(())
}

/// search エンドポイントを 1 回だけ叩き、`name` / `account` カラムが
/// 実際に取り出せるかを確認する。
///
/// `class` を指定しない全体検索を使う (リーグごとに変わるアセンダンシー名に
/// 依存させないため、かつ build-index-state への追加リクエストを避けるため)。
pub(crate) async fn check_poe_ninja_search_parse(
    client: &Client,
    version: &str,
    overview: &str,
) -> Result<(), String> {
    if version.is_empty() || overview.is_empty() {
        return Ok(());
    }
    let url =
        format!("https://poe.ninja/poe2/api/builds/{version}/search?overview={overview}&sort=dps");

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("poe.ninja search network error: {e}"))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("poe.ninja search HTTP {status}: 障害/仕様変更の可能性"));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("poe.ninja search bytes read error: {e}"))?;

    let columns = crate::poe_ninja_client::extract_search_columns(&bytes);
    let names = columns.get("name").map(Vec::len).unwrap_or(0);
    let accounts = columns.get("account").map(Vec::len).unwrap_or(0);
    if names == 0 || accounts == 0 {
        let mut found: Vec<&str> = columns.keys().map(String::as_str).collect();
        found.sort_unstable();
        return Err(format!(
            "poe.ninja search: name/account カラムを抽出できない \
             (name={names}, account={accounts}, 検出カラム=[{}])。\
             protobuf 構造変更のため『上位プレイヤーMOD一覧』が空になります",
            found.join(", ")
        ));
    }

    Ok(())
}

// ============================================================================
// 2. POE2DB HTML 構造チェック
// ============================================================================

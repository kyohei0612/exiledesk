//! 忍者ビルドコピー: poe.ninja のビルドページの URL からキャラクターを読む (2026-09-26)
//!
//! オーナー:「URL からも読めるようにして」。URL は
//! `https://poe.ninja/poe2/builds/<リーグ>/character/<アカウント>/<キャラ名>?…`。
//! リーグの今のスナップショット (index-state) を引いてから、上位プレイヤーMOD一覧と同じ character の API を 1 回叩く。
//! 応答はそのまま画面に返す (PoB のコードが入っていればそれを使い、無ければ items / skills から組み立てる)。
//! 送信は他の poe.ninja 取得と同じゲート (global_gate) を通す。

use super::*;

#[tauri::command]
pub async fn ninja_build_character(league_url: String, account: String, name: String) -> Result<serde_json::Value, String> {
    let client = build_client()?;
    let gate = global_gate();
    let snapshot = fetch_index_state(&client, &gate, Some(&league_url)).await?;
    let url = format!(
        "{NINJA_BASE}/poe2/api/builds/{version}/character?account={account}&name={name}&overview={overview}&timeMachine=",
        version = url_encode(&snapshot.version),
        account = url_encode(&account),
        name = url_encode(&name),
        overview = url_encode(&snapshot.snapshot_name),
    );
    let resp = http_get_with_backoff(&client, &gate, &url).await?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("character json parse error: {e}"))
}

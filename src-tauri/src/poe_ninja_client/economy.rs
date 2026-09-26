//! poe.ninja の相場 (ユニーク装備の一覧と 1 件の価格推移) (2026-09-26)
//!
//! オーナー:「忍者とどっちがいいかな ユニーク装備の価格推移は」「丁度忍者使ってるしな」。
//! poe2scout はユニークの点がまばらだったので、ユニーク装備価格推移は poe.ninja に乗せ換える。
//! 一覧 (overview) 1 回で 7 日の推移と出品数まで入っているので、1 件ずつ履歴を取りに行くのは行を開いた時だけ。
//! 送信は他の poe.ninja 取得と同じゲート (global_gate) を通す。中身は画面側で読むので JSON のまま返す。

use super::*;

/// 受け付ける種類 (poe.ninja の type)。ここに無い物は投げない
const KINDS: &[&str] = &[
    "UniqueWeapons",
    "UniqueArmours",
    "UniqueAccessories",
    "UniqueFlasks",
    "UniqueCharms",
    "UniqueJewels",
    "UniqueSanctumRelics",
    "UniqueTablets",
];

fn check_kind(kind: &str) -> Result<(), String> {
    if KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(format!("unknown kind: {kind}"))
    }
}

async fn get_json(url: String) -> Result<serde_json::Value, String> {
    let client = build_client()?;
    let gate = global_gate();
    let resp = http_get_with_backoff(&client, &gate, &url).await?;
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("json parse error on {url}: {e}"))
}

/// 1 種類の一覧 (値段・7 日の推移・出品数)
#[tauri::command]
pub async fn ninja_economy_overview(league: String, kind: String) -> Result<serde_json::Value, String> {
    check_kind(&kind)?;
    get_json(format!(
        "{NINJA_BASE}/poe2/api/economy/stash/current/item/overview?league={}&type={kind}",
        url_encode(&league)
    ))
    .await
}

/// 1 件の日ごとの推移 ([{ daysAgo, value, count }])
#[tauri::command]
pub async fn ninja_economy_history(league: String, kind: String, id: i64) -> Result<serde_json::Value, String> {
    check_kind(&kind)?;
    get_json(format!(
        "{NINJA_BASE}/poe2/api/economy/stash/current/item/history?league={}&type={kind}&id={id}",
        url_encode(&league)
    ))
    .await
}

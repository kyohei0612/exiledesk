//! キャッシュ (CachedCharacter) <-> CharacterItems の相互変換
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。
//! 2026-09-26 に 300 行ルールで分割: キャッシュへの縮小は to_cached.rs、復元は from_cached.rs。

use super::*;
mod from_cached;
mod to_cached;
pub(crate) use from_cached::*;
pub(crate) use to_cached::*;

// ============================================================================
// キャッシュ <-> CharacterItems 変換
// ============================================================================

pub(crate) fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 8 スロット対象の inventoryId だけ true。
/// (TS 側 inventoryIdToSlot のミラー、Belt 等は除外)
pub(crate) fn is_target_inventory_id(inv: &str) -> bool {
    matches!(
        inv,
        "Ring"
            | "Ring2"
            | "Amulet"
            | "Weapon"
            | "Weapon2"
            | "Offhand"
            | "Offhand2"
            | "Helm"
            | "Gloves"
            | "BodyArmour"
            | "Boots"
    )
}

/// poe.ninja のジェム properties から数値を 1 つ読む ("Level" → 21、"[Quality]" → "+23%" の 23)。
/// 名前に `Quality` を含む property の数値。種類つきの品質 (カタリスト) 用の受け皿。
fn quality_any(props: Option<&serde_json::Value>) -> Option<i64> {
    for p in props?.as_array()? {
        let name = p.get("name").and_then(|v| v.as_str())?;
        if !name.contains("Quality") {
            continue;
        }
        let raw = p
            .get("values")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())?;
        let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = digits.parse::<i64>() {
            return Some(n);
        }
    }
    None
}

pub(crate) fn gem_property_number(props: Option<&serde_json::Value>, key: &str) -> Option<i64> {
    for p in props?.as_array()? {
        if p.get("name").and_then(|v| v.as_str()) != Some(key) {
            continue;
        }
        let raw = p
            .get("values")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())?;
        let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
        return digits.parse::<i64>().ok();
    }
    None
}

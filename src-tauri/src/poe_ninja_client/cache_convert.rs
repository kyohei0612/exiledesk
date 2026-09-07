//! キャッシュ (CachedCharacter) <-> CharacterItems の相互変換
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// キャッシュ <-> CharacterItems 変換
// ============================================================================

pub(crate) fn now_unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// character endpoint の生 items[] から、キャッシュ用縮小形式を抽出する。
/// rare (frameType=2) + unique (frameType=3) の最小サブセットだけ拾う。
pub(crate) fn character_items_to_cached(ci: &CharacterItems, fetched_at: i64) -> CachedCharacter {
    let mut rare_items: Vec<CachedRareItem> = Vec::new();
    let mut unique_items: Vec<CachedUniqueItem> = Vec::new();

    for raw in &ci.items {
        // items[] は wrapper: { itemSlot, itemData: { ... } }
        let data = match raw.get("itemData") {
            Some(d) => d,
            None => continue,
        };
        let frame_type = data.get("frameType").and_then(|v| v.as_i64()).unwrap_or(-1);
        let inv_id = match data
            .get("inventoryId")
            .and_then(|v| v.as_str())
        {
            Some(s) => s.to_string(),
            None => continue,
        };

        // 8 スロット対象外は捨てる (rare/unique 両方)
        // Phase ο-A (2026-05-22): 未知 inventoryId をカウントして health_check 経由で
        // 可視化する。poe.ninja 側で新スロット (例: Flask, Jewel 等) が追加された場合や、
        // 既知でも `is_target_inventory_id` に追記し忘れた場合に検知できる。
        //
        // 2026-05-23 緊急修正: Belt 等「オーナー指示で意図的に除外」している inv_id は
        // 未知警告の対象外にする (= record_unknown_inventory_id を呼ばない)。
        // Belt × 94 件のような「想定通りの除外」が未知警告を埋め尽くす問題への対応。
        if !is_target_inventory_id(&inv_id) {
            if !is_intentionally_excluded(&inv_id) {
                crate::health_check::record_unknown_inventory_id(&inv_id, frame_type);
            }
            continue;
        }

        // Phase ν: weapon2 を shield / focus / quiver / main に分割するため、
        // poe.ninja item の `extended.subcategories` を rare / unique 両方で抽出。
        let subcategories: Vec<String> = data
            .get("extended")
            .and_then(|e| e.get("subcategories"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        if frame_type == 2 {
            // rare
            let explicit_mods = data
                .get("explicitMods")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            // 2026-06-28: ベース別使用率集計用に baseType を保存 (ユニーク側と同抽出)
            let base_type = data
                .get("baseType")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            rare_items.push(CachedRareItem {
                inventory_id: inv_id,
                explicit_mods,
                subcategories: subcategories.clone(),
                base_type,
            });
        } else if frame_type == 3 {
            // unique
            let type_line = data
                .get("typeLine")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let base_type = data
                .get("baseType")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let icon = data
                .get("icon")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let implicit_mods = data
                .get("implicitMods")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let explicit_mods = data
                .get("explicitMods")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let flavour_text = data.get("flavourText").cloned();
            let requirements = data.get("requirements").cloned();
            let properties = data.get("properties").cloned();
            let item_level = data.get("ilvl").and_then(|v| v.as_i64());
            let level = data.get("level").and_then(|v| v.as_i64());

            unique_items.push(CachedUniqueItem {
                inventory_id: inv_id,
                type_line,
                base_type,
                name,
                icon,
                implicit_mods,
                explicit_mods,
                flavour_text,
                requirements,
                properties,
                item_level,
                level,
                subcategories,
            });
        }
    }

    CachedCharacter {
        account: ci.account.clone(),
        name: ci.name.clone(),
        rare_items,
        unique_items,
        fetched_at,
    }
}

/// キャッシュ縮小形式から、TS 側 aggregateFromProgress が読める形式に復元。
/// 元の poe.ninja items[] の wrapper 構造 `{ itemSlot, itemData: { ... } }` を再現する。
pub(crate) fn cached_character_to_character_items(c: &CachedCharacter) -> CharacterItems {
    let mut items: Vec<serde_json::Value> = Vec::with_capacity(
        c.rare_items.len() + c.unique_items.len(),
    );
    for r in &c.rare_items {
        // Phase ν: extended.subcategories を復元 (weapon2 サブタブ判定に使う)
        items.push(serde_json::json!({
            "itemSlot": r.inventory_id,
            "itemData": {
                "frameType": 2,
                "inventoryId": r.inventory_id,
                "explicitMods": r.explicit_mods,
                // 2026-06-28: ベース別使用率集計用に baseType を復元
                "baseType": r.base_type,
                "extended": { "subcategories": r.subcategories },
            }
        }));
    }
    for u in &c.unique_items {
        // Phase ν: ユニーク側にも extended.subcategories を復元。
        let mut data = serde_json::json!({
            "frameType": 3,
            "inventoryId": u.inventory_id,
            "typeLine": u.type_line,
            "baseType": u.base_type,
            "name": u.name,
            "icon": u.icon,
            "implicitMods": u.implicit_mods,
            "explicitMods": u.explicit_mods,
            "extended": { "subcategories": u.subcategories },
        });
        if let Some(v) = &u.flavour_text {
            data["flavourText"] = v.clone();
        }
        if let Some(v) = &u.requirements {
            data["requirements"] = v.clone();
        }
        if let Some(v) = &u.properties {
            data["properties"] = v.clone();
        }
        if let Some(v) = u.item_level {
            data["ilvl"] = serde_json::Value::from(v);
        }
        if let Some(v) = u.level {
            data["level"] = serde_json::Value::from(v);
        }
        items.push(serde_json::json!({
            "itemSlot": u.inventory_id,
            "itemData": data,
        }));
    }
    CharacterItems {
        account: c.account.clone(),
        name: c.name.clone(),
        items,
    }
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

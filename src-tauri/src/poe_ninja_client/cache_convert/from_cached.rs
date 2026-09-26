//! poe_ninja_client/cache_convert/from_cached.rs — キャッシュの縮小形式を poe.ninja の形 (CharacterItems) に戻す
//!
//! cache_convert.rs から分割 (2026-09-26)。
use super::*;

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
                // 2026-09-12: 付与スキル / 装着ジェムを poe.ninja の形に戻す (TS 側 ingest が同じ経路で読む)
                "grantedSkills": r.granted_skills.iter().map(|s| serde_json::json!({ "name": "Grants Skill", "values": [[s, 25]] })).collect::<Vec<_>>(),
                "socketedItems": [{ "socketedItems": r.socketed_gems.iter().map(|g| serde_json::json!({ "typeLine": g })).collect::<Vec<_>>() }],
                // 2026-09-22: 品質も poe.ninja の形に戻す (TS 側が同じ経路で読めるように)
                "properties": r.quality.map(|q| serde_json::json!([{ "name": "[Quality]", "values": [[format!("+{q}%"), 1]] }])).unwrap_or(serde_json::json!([])),
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
    // 2026-09-12: スキルグループを poe.ninja の形 (allGems[].name / itemData.support、dps[].dps) に戻す
    let skills: Vec<serde_json::Value> = c
        .skills
        .iter()
        .map(|g| {
            let mut gems: Vec<serde_json::Value> = g
                .mains
                .iter()
                .map(|gem| {
                    // poe.ninja と同じ properties の形に戻す (TS 側の解析を 1 本にするため)
                    let mut props: Vec<serde_json::Value> = Vec::new();
                    if let Some(l) = gem.level {
                        props.push(serde_json::json!({ "name": "Level", "values": [[l.to_string(), 0]] }));
                    }
                    if let Some(q) = gem.quality {
                        props.push(serde_json::json!({ "name": "[Quality]", "values": [[format!("+{q}%"), 1]] }));
                    }
                    serde_json::json!({ "name": gem.name, "itemData": { "support": false, "properties": props } })
                })
                .collect();
            gems.extend(g.supports.iter().map(|n| serde_json::json!({ "name": n, "itemData": { "support": true } })));
            serde_json::json!({ "allGems": gems, "dps": [{ "dps": g.dps }] })
        })
        .collect();
    CharacterItems {
        account: c.account.clone(),
        name: c.name.clone(),
        items,
        skills,
    }
}

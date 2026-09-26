//! poe_ninja_client/cache_convert/to_cached.rs — character endpoint の items[] / skills[] をキャッシュ用の縮小形式にする
//!
//! cache_convert.rs から分割 (2026-09-26)。
use super::*;

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
            // 2026-09-12: 付与スキル ("Level 20 Cast on Critical") と、その穴に入ったジェム名。
            let granted_skills: Vec<String> = data
                .get("grantedSkills")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|g| {
                            g.get("values")?
                                .as_array()?
                                .first()?
                                .as_array()?
                                .first()?
                                .as_str()
                                .map(|s| s.to_string())
                        })
                        .collect()
                })
                .unwrap_or_default();
            let socketed_gems: Vec<String> = data
                .get("socketedItems")
                .and_then(|v| v.as_array())
                .map(|holders| {
                    holders
                        .iter()
                        .flat_map(|h| {
                            h.get("socketedItems")
                                .and_then(|v| v.as_array())
                                .cloned()
                                .unwrap_or_default()
                        })
                        .filter_map(|g| g.get("typeLine").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .filter(|s| !s.is_empty())
                        .collect()
                })
                .unwrap_or_default();
            // 2026-09-22: 品質。最大品質の MOD を途中で消す作り方を見分けるのと、
            // カタリストで底上げされた表示値を素の値に戻すのに要る。
            //
            // 装飾品はカタリストで**種類つきの品質**が乗る (ゲームの表示は「品質 (マナモッド): +20%」)。
            // その時 properties の名前が `[Quality]` ちょうどとは限らないので、
            // 完全一致で拾えなければ「Quality を含む名前」で拾い直す。
            let quality = gem_property_number(data.get("properties"), "[Quality]")
                .or_else(|| quality_any(data.get("properties")));
            rare_items.push(CachedRareItem {
                inventory_id: inv_id,
                explicit_mods,
                subcategories: subcategories.clone(),
                base_type,
                granted_skills,
                socketed_gems,
                quality,
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

    // 2026-09-12: スキルグループ (allGems[] の name と itemData.support、dps[].dps の最大)
    // 2026-09-16: メインジェムは properties の Level / Quality も拾う (レベル 21 / 品質 23% のランキング用)
    let skills: Vec<CachedSkillGroup> = ci
        .skills
        .iter()
        .filter_map(|g| {
            let gems = g.get("allGems")?.as_array()?;
            let mut mains: Vec<CachedGem> = Vec::new();
            let mut supports = Vec::new();
            for gem in gems {
                let name = match gem.get("name").and_then(|v| v.as_str()) {
                    Some(n) if !n.is_empty() => n.to_string(),
                    _ => continue,
                };
                let item_data = gem.get("itemData");
                let is_support = item_data
                    .and_then(|d| d.get("support"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if is_support {
                    supports.push(name);
                } else {
                    let props = item_data.and_then(|d| d.get("properties"));
                    mains.push(CachedGem {
                        name,
                        level: gem_property_number(props, "Level"),
                        quality: gem_property_number(props, "[Quality]"),
                    });
                }
            }
            if mains.is_empty() {
                return None;
            }
            let dps = g
                .get("dps")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|d| d.get("dps").and_then(|x| x.as_f64())).fold(0.0_f64, f64::max))
                .unwrap_or(0.0);
            Some(CachedSkillGroup { mains, supports, dps })
        })
        .collect();

    CachedCharacter {
        account: ci.account.clone(),
        name: ci.name.clone(),
        rare_items,
        unique_items,
        fetched_at,
        skills,
    }
}

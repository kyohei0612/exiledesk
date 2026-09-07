//! Lua 側 API 呼び出し (loadBuildFromXML / stat / 装備 slot 操作 / socket group / snapshot)
//!
//! __tmp_src.rs (812 行) から機械分割 (2026-09-07 R3)。

use super::*;

pub(crate) fn call_load_build_xml(lua: &Lua, xml: &str) -> mlua::Result<()> {
    let func: Function = lua.globals().get("loadBuildFromXML")?;
    func.call::<()>((xml.to_string(), "imported"))?;
    // 計算実行（calcsTab.UpdateCalcs 相当を OnFrame で走らせる）
    let _ = lua
        .load(r#"if runCallback then runCallback("OnFrame") end"#)
        .exec();
    Ok(())
}

pub(crate) fn call_get_stat(lua: &Lua, key: &str) -> mlua::Result<f64> {
    // PoB 内部: build.calcsTab.calcsEnv.player.output.<key>
    let script = format!(
        r#"
        local b = build
        if not b or not b.calcsTab or not b.calcsTab.calcsEnv or not b.calcsTab.calcsEnv.player or not b.calcsTab.calcsEnv.player.output then
            return nil
        end
        local v = b.calcsTab.calcsEnv.player.output[{:?}]
        if type(v) == "number" then return v else return nil end
        "#,
        key
    );
    let v: Option<f64> = lua.load(&script).eval()?;
    Ok(v.unwrap_or(0.0))
}

/// 装備テキストを slot にセット。slot=None なら primary slot に自動推定。
/// 1. new("Item", raw) で Item オブジェクト
/// 2. build.itemsTab:AddItem(item, true) で itemList に追加（auto-equip しない）
/// 3. slot 名を解決して build.itemsTab.slots[slotName]:SetSelItemId(item.id)
/// 4. build.buildFlag = true; runCallback("OnFrame") で再計算
pub(crate) fn call_set_item_in_slot(lua: &Lua, slot: Option<&str>, raw: &str) -> mlua::Result<String> {
    let slot_arg = slot.unwrap_or("");
    let script = format!(
        r#"
        local raw = {raw_lit}
        local explicit_slot = {slot_lit}
        local item = new("Item", raw)
        if not item or not item.base then
            error("Invalid item text — Item.new could not parse it")
        end
        build.itemsTab:AddItem(item, true)
        local slot_name = explicit_slot
        if slot_name == "" or not slot_name then
            slot_name = item:GetPrimarySlot()
        end
        if not build.itemsTab.slots[slot_name] then
            error("Unknown slot: " .. tostring(slot_name))
        end
        build.itemsTab.slots[slot_name]:SetSelItemId(item.id)
        build.buildFlag = true
        if runCallback then runCallback("OnFrame") end
        return slot_name
        "#,
        raw_lit = lua_string_literal(raw),
        slot_lit = lua_string_literal(slot_arg),
    );
    let slot_name: String = lua.load(&script).eval()?;
    Ok(slot_name)
}

pub(crate) fn call_clear_slot(lua: &Lua, slot: &str) -> mlua::Result<()> {
    let script = format!(
        r#"
        local slot = build.itemsTab.slots[{slot_lit}]
        if not slot then error("Unknown slot: " .. {slot_lit}) end
        slot:SetSelItemId(0)
        build.buildFlag = true
        if runCallback then runCallback("OnFrame") end
        "#,
        slot_lit = lua_string_literal(slot),
    );
    lua.load(&script).exec()?;
    Ok(())
}

pub(crate) fn call_get_equipped_items(lua: &Lua) -> mlua::Result<Vec<EquippedItemInfo>> {
    let script = r#"
        local result = {}
        if not build or not build.itemsTab or not build.itemsTab.slots then
            return result
        end
        -- orderedSlots があれば順序を保つ。なければ pairs で取る。
        local slot_iter
        if build.itemsTab.orderedSlots then
            slot_iter = function()
                local i = 0
                local arr = build.itemsTab.orderedSlots
                return function()
                    i = i + 1
                    if arr[i] then return arr[i].slotName, arr[i] end
                end
            end
        else
            slot_iter = function()
                return pairs(build.itemsTab.slots)
            end
        end
        for slot_name, slot in slot_iter() do
            local entry = {
                slot_name = slot_name,
                has_item = false,
                base_name = "",
                title = "",
                rarity = "",
            }
            local id = slot.selItemId
            if id and id ~= 0 then
                local item = build.itemsTab.items[id]
                if item then
                    entry.has_item = true
                    entry.base_name = item.baseName or ""
                    entry.title = item.title or ""
                    entry.rarity = item.rarity or ""
                end
            end
            table.insert(result, entry)
        end
        return result
    "#;
    let arr: mlua::Table = lua.load(script).eval()?;
    let mut out = Vec::new();
    for pair in arr.sequence_values::<mlua::Table>() {
        let t = pair?;
        out.push(EquippedItemInfo {
            slot_name: t.get::<String>("slot_name").unwrap_or_default(),
            has_item: t.get::<bool>("has_item").unwrap_or(false),
            base_name: t.get::<String>("base_name").unwrap_or_default(),
            title: t.get::<String>("title").unwrap_or_default(),
            rarity: t.get::<String>("rarity").unwrap_or_default(),
        });
    }
    Ok(out)
}

pub(crate) fn call_get_skill_groups(lua: &Lua) -> mlua::Result<Vec<SkillGroupInfo>> {
    let script = r#"
        local result = {}
        if not build or not build.skillsTab or not build.skillsTab.socketGroupList then
            return result
        end
        local main_idx = build.mainSocketGroup or 0
        for i, sg in ipairs(build.skillsTab.socketGroupList) do
            local label = sg.label or sg.displayLabel or ("Group " .. i)
            local main_skill = ""
            for _, g in ipairs(sg.gemList or {}) do
                if g.enabled ~= false and g.gemData and g.gemData.name then
                    if not g.gemData.tags or not g.gemData.tags.support then
                        main_skill = g.gemData.name
                        break
                    end
                end
            end
            if main_skill == "" then
                for _, g in ipairs(sg.gemList or {}) do
                    if g.gemData and g.gemData.name then
                        main_skill = g.gemData.name
                        break
                    end
                end
            end
            table.insert(result, {
                index = i,
                label = label,
                main_skill_name = main_skill,
                gem_count = #(sg.gemList or {}),
                is_main = (i == main_idx),
            })
        end
        return result
    "#;
    let arr: mlua::Table = lua.load(script).eval()?;
    let mut out = Vec::new();
    for pair in arr.sequence_values::<mlua::Table>() {
        let t = pair?;
        out.push(SkillGroupInfo {
            index: t.get::<u32>("index").unwrap_or(0),
            label: t.get::<String>("label").unwrap_or_default(),
            main_skill_name: t.get::<String>("main_skill_name").unwrap_or_default(),
            gem_count: t.get::<u32>("gem_count").unwrap_or(0),
            is_main: t.get::<bool>("is_main").unwrap_or(false),
        });
    }
    Ok(out)
}

pub(crate) fn call_set_main_socket_group(lua: &Lua, index: u32) -> mlua::Result<()> {
    let script = format!(
        r#"
        if not build or not build.skillsTab or not build.skillsTab.socketGroupList then
            error("build/skillsTab not ready")
        end
        if not build.skillsTab.socketGroupList[{idx}] then
            error("invalid socket group index: " .. tostring({idx}))
        end
        build.mainSocketGroup = {idx}
        build.buildFlag = true
        if runCallback then runCallback("OnFrame") end
        "#,
        idx = index
    );
    lua.load(&script).exec()?;
    Ok(())
}

/// build XML を dump。装備差替え前に呼んで restore_snapshot で戻せる。
pub(crate) fn call_snapshot(lua: &Lua) -> mlua::Result<String> {
    let script = r#"
        if not build or not build.dbFileName and not build.SaveDB then
            -- SaveDB が無いシステムだと unsupported
        end
        if build.SaveDB then
            return build:SaveDB() or ""
        end
        return ""
    "#;
    let xml: String = lua.load(script).eval().unwrap_or_else(|_| String::new());
    Ok(xml)
}

/// Lua の文字列リテラルとして安全に埋め込む（"long bracket" 形式 [=[ ... ]=] を使用、
/// raw に長いブラケット相当が含まれる場合は等号レベルを自動増加）。
pub(crate) fn lua_string_literal(s: &str) -> String {
    let mut level = 0;
    loop {
        let close = format!("]{}]", "=".repeat(level));
        if !s.contains(&close) {
            let eq = "=".repeat(level);
            // 改行から始まる場合は 1 行目を保持するためにパディングを入れる
            let prefix = if s.starts_with('\n') { "" } else { "\n" };
            return format!("[{eq}[{prefix}{s}]{eq}]");
        }
        level += 1;
        if level > 16 {
            // pathological case: fall back to escaped string
            let escaped = s
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
                .replace('\r', "\\r");
            return format!("\"{}\"", escaped);
        }
    }
}

pub(crate) fn call_get_stats_all(lua: &Lua) -> mlua::Result<HashMap<String, f64>> {
    let script = r#"
        local b = build
        if not b or not b.calcsTab or not b.calcsTab.calcsEnv or not b.calcsTab.calcsEnv.player or not b.calcsTab.calcsEnv.player.output then
            return {}
        end
        local out = {}
        for k, v in pairs(b.calcsTab.calcsEnv.player.output) do
            if type(v) == "number" then out[k] = v end
        end
        return out
    "#;
    let tbl: Table = lua.load(script).eval()?;
    let mut map = HashMap::new();
    for pair in tbl.pairs::<String, f64>() {
        if let Ok((k, v)) = pair {
            map.insert(k, v);
        }
    }
    Ok(map)
}

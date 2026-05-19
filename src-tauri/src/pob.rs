//! PoB-PoE2 ヘッドレス連携 — Phase 2 最小実装
//!
//! 設計: `.company/engineering/docs/pob-headless-wrapper.md`（B 案ベース統合版）
//!
//! Worker thread に LuaJIT を閉じ込め、Tauri command から mpsc 経由で
//! ジョブ投入する。lua_test.rs の boot_pob ロジックを移植し、共通 stub /
//! polyfill / file-loader override を集約する。

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use flate2::read::ZlibDecoder;
use mlua::{Function, Lua, Table, Value};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::thread;

// ---------------------------------------------------------------------------
// Lua state setup（lua_test.rs から移植・共通化）
// ---------------------------------------------------------------------------

const UTF8_POLYFILL: &str = r#"
utf8 = {
    char = string.char,
    byte = string.byte,
    sub = string.sub,
    len = string.len,
    find = string.find,
    match = string.match,
    gmatch = string.gmatch,
    gsub = string.gsub,
    reverse = string.reverse,
    upper = string.upper,
    lower = string.lower,
    rep = string.rep,
    format = string.format,
    next = function(s, i, dir)
        i = i or 1
        dir = dir or 1
        local n = i + dir
        if n < 1 or n > #s + 1 then return nil end
        return n
    end,
    offset = function(s, i, j) return (j or 1) + (i or 0) end,
    codepoint = function(s, i, j) return string.byte(s, i or 1, j or i or 1) end,
    charpattern = "[\0-\127\194-\244][\128-\191]*",
}
package.preload['lua-utf8'] = function() return utf8 end
"#;

const ERROR_TRAP: &str = r#"
-- string.format に tostring fallback を仕込む（PoB の PCall が userdata を error として
-- 投げる場面で、Launch.lua の ShowErrMsg(string.format) が二次エラーになるのを防ぐ）
local _format = string.format
local _pcall = pcall
string.format = function(fmt, ...)
    local ok, result = _pcall(_format, fmt, ...)
    if ok then return result end
    local args = {...}
    local strs = {}
    for i = 1, select('#', ...) do strs[i] = tostring(args[i]) end
    local ok2, result2 = _pcall(_format, fmt, unpack(strs))
    if ok2 then return result2 end
    return tostring(fmt) .. " | " .. table.concat(strs, " ")
end
"#;

fn strip_shebang(content: String) -> String {
    if content.starts_with('#') {
        if let Some(idx) = content.find('\n') {
            content[idx + 1..].to_string()
        } else {
            String::new()
        }
    } else {
        content
    }
}

fn resolve_path(p: &str) -> PathBuf {
    let path = Path::new(p);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map(|d| d.join(path))
            .unwrap_or_else(|_| path.to_path_buf())
    }
}

/// loadfile / dofile を Rust 経由のファイル読み込みに置換。
/// 日本語パス対応（保険、ASCII パス運用でも残しておく）+ shebang strip 自動。
fn override_file_loaders(lua: &Lua) -> mlua::Result<()> {
    let loadfile = lua.create_function(|lua, path: String| -> mlua::Result<Value> {
        let resolved = resolve_path(&path);
        let content = std::fs::read_to_string(&resolved).map_err(|e| {
            mlua::Error::external(format!(
                "loadfile fail '{}' (resolved={}): {}",
                path,
                resolved.display(),
                e
            ))
        })?;
        let content = strip_shebang(content);
        let func = lua.load(content).set_name(path).into_function()?;
        Ok(Value::Function(func))
    })?;
    lua.globals().set("loadfile", loadfile)?;

    let dofile =
        lua.create_function(|lua, path: String| -> mlua::Result<mlua::MultiValue> {
            let resolved = resolve_path(&path);
            let content = std::fs::read_to_string(&resolved).map_err(|e| {
                mlua::Error::external(format!(
                    "dofile read fail '{}' (resolved={}): {}",
                    path,
                    resolved.display(),
                    e
                ))
            })?;
            let content = strip_shebang(content);
            lua.load(content).set_name(path).eval::<mlua::MultiValue>()
        })?;
    lua.globals().set("dofile", dofile)?;
    Ok(())
}

/// PoB headless を起動し、`build` グローバルが table として取れるところまで持っていく。
/// 失敗箇所が出たらここでエラーを返す（呼出側はリトライ不能、worker を再起動する流れ）。
fn boot_pob(pob_src: &Path) -> Result<Lua> {
    std::env::set_current_dir(pob_src)
        .with_context(|| format!("set_current_dir to {}", pob_src.display()))?;

    let lua = Lua::new();
    override_file_loaders(&lua).map_err(|e| anyhow!("override_file_loaders: {}", e))?;
    lua.load(UTF8_POLYFILL)
        .exec()
        .map_err(|e| anyhow!("UTF8_POLYFILL: {}", e))?;
    lua.load(ERROR_TRAP)
        .exec()
        .map_err(|e| anyhow!("ERROR_TRAP: {}", e))?;
    lua.load(r#"arg = {}"#)
        .exec()
        .map_err(|e| anyhow!("arg setup: {}", e))?;

    // PoB 同梱の lua libs (xml, dkjson, base64, sha1, sha2, socket) を package.path に
    let lua_libs = pob_src
        .parent()
        .ok_or_else(|| anyhow!("pob_src has no parent"))?
        .join("runtime")
        .join("lua")
        .display()
        .to_string()
        .replace('\\', "/");
    let setup_path = format!(
        r#"package.path = '{libs}/?.lua;{libs}/?/init.lua;' .. package.path"#,
        libs = lua_libs
    );
    lua.load(&setup_path)
        .exec()
        .map_err(|e| anyhow!("package.path setup: {}", e))?;

    let headless_path = pob_src.join("HeadlessWrapper.lua");
    let headless_content = std::fs::read_to_string(&headless_path)
        .with_context(|| format!("read {}", headless_path.display()))?;
    let headless_content = strip_shebang(headless_content);
    lua.load(headless_content)
        .set_name("HeadlessWrapper.lua")
        .exec()
        .map_err(|e| anyhow!("HeadlessWrapper.lua execution: {}", e))?;

    // build グローバルが table として取れることを smoke check
    let build: Value = lua
        .globals()
        .get("build")
        .map_err(|e| anyhow!("get build global: {}", e))?;
    if !matches!(build, Value::Table(_)) {
        return Err(anyhow!(
            "PoB boot succeeded but `build` global is not a table (got: {})",
            build.type_name()
        ));
    }
    Ok(lua)
}

// ---------------------------------------------------------------------------
// PoB share code decode
// ---------------------------------------------------------------------------

/// PoB share code（base64-url-safe encoded zlib-deflated XML）を decode して
/// プレーン XML にする。`+`/`/` の代わりに `-`/`_` を使う url-safe variant に対応。
pub fn decode_pob_code(code: &str) -> Result<String> {
    let cleaned: String = code
        .trim()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    let compressed = URL_SAFE_NO_PAD
        .decode(&cleaned)
        .or_else(|_| base64::engine::general_purpose::STANDARD.decode(&cleaned))
        .context("base64 decode of PoB code")?;
    let mut decoder = ZlibDecoder::new(&compressed[..]);
    let mut xml = String::new();
    decoder
        .read_to_string(&mut xml)
        .context("zlib inflate of PoB code")?;
    Ok(xml)
}

// ---------------------------------------------------------------------------
// Worker thread
// ---------------------------------------------------------------------------

type Reply<T> = mpsc::Sender<Result<T, String>>;

pub enum PobJob {
    LoadBuildXml { xml: String, reply: Reply<()> },
    GetStat { key: String, reply: Reply<f64> },
    GetStatsAll { reply: Reply<HashMap<String, f64>> },
    SetItemInSlot { slot: Option<String>, raw: String, reply: Reply<String> },
    ClearSlot { slot: String, reply: Reply<()> },
    Snapshot { reply: Reply<String> },
    RestoreSnapshot { xml: String, reply: Reply<()> },
    GetEquippedItems { reply: Reply<Vec<EquippedItemInfo>> },
    GetSkillGroups { reply: Reply<Vec<SkillGroupInfo>> },
    SetMainSocketGroup { index: u32, reply: Reply<()> },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EquippedItemInfo {
    pub slot_name: String,
    pub has_item: bool,
    pub base_name: String,
    pub title: String,
    pub rarity: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillGroupInfo {
    pub index: u32,            // 1-based、PoB の build.mainSocketGroup と同じ
    pub label: String,         // socketGroup.label or "Group N"
    pub main_skill_name: String, // 最初の有効な gem の name
    pub gem_count: u32,
    pub is_main: bool,         // build.mainSocketGroup == index か
}

pub struct PobWorker {
    tx: mpsc::Sender<PobJob>,
}

impl PobWorker {
    pub fn spawn(pob_src: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel::<PobJob>();
        thread::Builder::new()
            .name("pob-worker".into())
            .spawn(move || worker_loop(pob_src, rx))
            .expect("spawn pob worker thread");
        Self { tx }
    }

    pub fn load_build_xml(&self, xml: String) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::LoadBuildXml { xml, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn get_stat(&self, key: String) -> Result<f64, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetStat { key, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn get_stats_all(&self) -> Result<HashMap<String, f64>, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetStatsAll { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    /// 装備テキストを slot にセット。slot=None なら item:GetPrimarySlot() で自動推定。
    /// 戻り値は実際にセットされた slot 名（"Helmet" 等）。
    pub fn set_item_in_slot(
        &self,
        slot: Option<String>,
        raw: String,
    ) -> Result<String, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::SetItemInSlot { slot, raw, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn clear_slot(&self, slot: String) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::ClearSlot { slot, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    /// build を XML で snapshot。装備差替え前に呼んで、後で restore できるように。
    pub fn snapshot(&self) -> Result<String, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::Snapshot { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn restore_snapshot(&self, xml: String) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::RestoreSnapshot { xml, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    /// 現在 build の各 slot に何が装備されているかを取得。
    /// 空 slot も has_item=false で返す。Vue 側で slot プルダウン構築用。
    pub fn get_equipped_items(&self) -> Result<Vec<EquippedItemInfo>, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetEquippedItems { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn get_skill_groups(&self) -> Result<Vec<SkillGroupInfo>, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetSkillGroups { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn set_main_socket_group(&self, index: u32) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::SetMainSocketGroup { index, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }
}

fn worker_loop(pob_src: PathBuf, rx: mpsc::Receiver<PobJob>) {
    let lua = match boot_pob(&pob_src) {
        Ok(lua) => lua,
        Err(e) => {
            // 起動失敗。以降の job はすべて失敗で返す。
            eprintln!("[pob worker] boot_pob failed: {:#}", e);
            for job in rx {
                let msg = format!("PoB boot failed: {:#}", e);
                match job {
                    PobJob::LoadBuildXml { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetStat { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetStatsAll { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::SetItemInSlot { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::ClearSlot { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::Snapshot { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::RestoreSnapshot { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetEquippedItems { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetSkillGroups { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::SetMainSocketGroup { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                }
            }
            return;
        }
    };

    for job in rx {
        match job {
            PobJob::LoadBuildXml { xml, reply } => {
                let r = call_load_build_xml(&lua, &xml).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetStat { key, reply } => {
                let r = call_get_stat(&lua, &key).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetStatsAll { reply } => {
                let r = call_get_stats_all(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::SetItemInSlot { slot, raw, reply } => {
                let r =
                    call_set_item_in_slot(&lua, slot.as_deref(), &raw).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::ClearSlot { slot, reply } => {
                let r = call_clear_slot(&lua, &slot).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::Snapshot { reply } => {
                let r = call_snapshot(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::RestoreSnapshot { xml, reply } => {
                let r = call_load_build_xml(&lua, &xml).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetEquippedItems { reply } => {
                let r = call_get_equipped_items(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetSkillGroups { reply } => {
                let r = call_get_skill_groups(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::SetMainSocketGroup { index, reply } => {
                let r = call_set_main_socket_group(&lua, index).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
        }
    }
}

fn call_load_build_xml(lua: &Lua, xml: &str) -> mlua::Result<()> {
    let func: Function = lua.globals().get("loadBuildFromXML")?;
    func.call::<()>((xml.to_string(), "imported"))?;
    // 計算実行（calcsTab.UpdateCalcs 相当を OnFrame で走らせる）
    let _ = lua
        .load(r#"if runCallback then runCallback("OnFrame") end"#)
        .exec();
    Ok(())
}

fn call_get_stat(lua: &Lua, key: &str) -> mlua::Result<f64> {
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
fn call_set_item_in_slot(lua: &Lua, slot: Option<&str>, raw: &str) -> mlua::Result<String> {
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

fn call_clear_slot(lua: &Lua, slot: &str) -> mlua::Result<()> {
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

fn call_get_equipped_items(lua: &Lua) -> mlua::Result<Vec<EquippedItemInfo>> {
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

fn call_get_skill_groups(lua: &Lua) -> mlua::Result<Vec<SkillGroupInfo>> {
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

fn call_set_main_socket_group(lua: &Lua, index: u32) -> mlua::Result<()> {
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
fn call_snapshot(lua: &Lua) -> mlua::Result<String> {
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
fn lua_string_literal(s: &str) -> String {
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

fn call_get_stats_all(lua: &Lua) -> mlua::Result<HashMap<String, f64>> {
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

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn pob_load_build_code(
    state: tauri::State<'_, PobWorker>,
    code: String,
) -> Result<(), String> {
    let xml = decode_pob_code(&code).map_err(|e| format!("decode failed: {:#}", e))?;
    state.load_build_xml(xml)
}

#[tauri::command]
pub fn pob_load_build_xml(
    state: tauri::State<'_, PobWorker>,
    xml: String,
) -> Result<(), String> {
    state.load_build_xml(xml)
}

#[tauri::command]
pub fn pob_get_stat(
    state: tauri::State<'_, PobWorker>,
    key: String,
) -> Result<f64, String> {
    state.get_stat(key)
}

#[tauri::command]
pub fn pob_get_stats_all(
    state: tauri::State<'_, PobWorker>,
) -> Result<HashMap<String, f64>, String> {
    state.get_stats_all()
}

#[tauri::command]
pub fn pob_set_item_in_slot(
    state: tauri::State<'_, PobWorker>,
    slot: Option<String>,
    raw: String,
) -> Result<String, String> {
    state.set_item_in_slot(slot, raw)
}

#[tauri::command]
pub fn pob_clear_slot(
    state: tauri::State<'_, PobWorker>,
    slot: String,
) -> Result<(), String> {
    state.clear_slot(slot)
}

#[tauri::command]
pub fn pob_snapshot(state: tauri::State<'_, PobWorker>) -> Result<String, String> {
    state.snapshot()
}

#[tauri::command]
pub fn pob_restore_snapshot(
    state: tauri::State<'_, PobWorker>,
    xml: String,
) -> Result<(), String> {
    state.restore_snapshot(xml)
}

#[tauri::command]
pub fn pob_get_equipped_items(
    state: tauri::State<'_, PobWorker>,
) -> Result<Vec<EquippedItemInfo>, String> {
    state.get_equipped_items()
}

#[tauri::command]
pub fn pob_get_skill_groups(
    state: tauri::State<'_, PobWorker>,
) -> Result<Vec<SkillGroupInfo>, String> {
    state.get_skill_groups()
}

#[tauri::command]
pub fn pob_set_main_socket_group(
    state: tauri::State<'_, PobWorker>,
    index: u32,
) -> Result<(), String> {
    state.set_main_socket_group(index)
}

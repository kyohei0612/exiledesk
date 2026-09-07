//! LuaJIT state の初期化: utf8 polyfill / error trap / file-loader override / boot_pob
//!
//! __tmp_src.rs (812 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ---------------------------------------------------------------------------
// Lua state setup（lua_test.rs から移植・共通化）
// ---------------------------------------------------------------------------

pub(crate) const UTF8_POLYFILL: &str = r#"
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

pub(crate) const ERROR_TRAP: &str = r#"
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

pub(crate) fn strip_shebang(content: String) -> String {
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

pub(crate) fn resolve_path(p: &str) -> PathBuf {
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
pub(crate) fn override_file_loaders(lua: &Lua) -> mlua::Result<()> {
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
pub(crate) fn boot_pob(pob_src: &Path) -> Result<Lua> {
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

    // PoB 同梱の lua libs (xml, dkjson, base64, sha1, sha2, socket) を package.path に。
    // 同梱版 (resources/pob) はフラット配置で `<pob>/lua`、vendor submodule は `<src>/../runtime/lua`。
    let flat_libs = pob_src.join("lua");
    let lua_libs = if flat_libs.is_dir() {
        flat_libs
    } else {
        pob_src
            .parent()
            .ok_or_else(|| anyhow!("pob_src has no parent"))?
            .join("runtime")
            .join("lua")
    }
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

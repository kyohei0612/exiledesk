//! mlua + PoB-PoE2 HeadlessWrapper smoke test (日本語パス対応版)
//!
//! Lua の loadfile/dofile は C の fopen を ANSI コードページで呼ぶため、
//! 日本語パスを正しく開けない。Rust 側で std::fs::read_to_string を使って
//! UTF-8 経由で読み込み、loadfile/dofile を override する。

use mlua::{Lua, Value};
use std::env;
use std::path::{Path, PathBuf};

/// PoB の PCall は pcall の error を素通しで戻す。
/// error 自体が table/userdata だと Launch.lua の ShowErrMsg(string.format) で二次エラー。
/// error 関数を hook して raise 内容を tostring で stdout に出す。
const ERROR_TRAP: &str = r#"
local _error = error
local _pcall = pcall
function error(msg, level)
    io.stderr:write("[POB error()]: type=" .. type(msg) .. " value=" .. tostring(msg) .. "\n")
    if type(msg) == "table" then
        for k, v in pairs(msg) do
            io.stderr:write("  ." .. tostring(k) .. " = " .. tostring(v) .. "\n")
        end
    end
    return _error(msg, level)
end
-- ShowErrMsg を後で hook するため、Launch.lua 実行後に launch object が出来たら override する
-- フックは HeadlessWrapper の最後で実行される runCallback("OnInit") の内側で main.Init が
-- 失敗した瞬間。そのため Launch.lua 17 行目以降に launch が定義された直後にフックを仕掛ける
-- 別方法として string.format を tostring fallback 付きに置換する
local _format = string.format
string.format = function(fmt, ...)
    local ok, result = _pcall(_format, fmt, ...)
    if ok then return result end
    -- format failed: tostring fallback
    local args = {...}
    local strs = {}
    for i = 1, select('#', ...) do
        strs[i] = tostring(args[i])
    end
    local ok2, result2 = _pcall(_format, fmt, unpack(strs))
    if ok2 then return result2 end
    -- still failed: just concat
    return tostring(fmt) .. " | " .. table.concat(strs, " ")
end
"#;

/// luautf8 (https://github.com/starwing/luautf8) の最小 stub。
/// PoB は utf8.match/next/reverse/gsub/find/sub を使う。ASCII 範囲なら string.* で代替可能。
/// 日本語データを扱う処理（Common.lua の number formatting、EditControl の caret）は
/// ASCII 操作にしか使われないので問題なし。
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
    -- luautf8 固有: utf8.next(s, i, dir) -- byte 単位で代替
    next = function(s, i, dir)
        i = i or 1
        dir = dir or 1
        local n = i + dir
        if n < 1 or n > #s + 1 then return nil end
        return n
    end,
    offset = function(s, i, j)
        return (j or 1) + (i or 0)
    end,
    codepoint = function(s, i, j) return string.byte(s, i or 1, j or i or 1) end,
    charpattern = "[\0-\127\194-\244][\128-\191]*",
}
package.preload['lua-utf8'] = function() return utf8 end
"#;

/// LuaJIT 内蔵 bit ライブラリのピュア Lua polyfill。
/// PoB は bit.band/bor/bxor/rshift/lshift/tohex/tobit を使う。
/// 動作確認用。本番では LuaJIT or 高速な C 実装に差替え推奨。
const BIT_POLYFILL: &str = r#"
local floor = math.floor
local function tobit(n)
    n = n % 0x100000000
    if n >= 0x80000000 then n = n - 0x100000000 end
    return floor(n)
end
local function band(a, b)
    local r, bv = 0, 1
    a, b = a % 0x100000000, b % 0x100000000
    for i = 0, 31 do
        if a % 2 == 1 and b % 2 == 1 then r = r + bv end
        a, b, bv = floor(a / 2), floor(b / 2), bv * 2
    end
    return r
end
local function bor(a, b)
    local r, bv = 0, 1
    a, b = a % 0x100000000, b % 0x100000000
    for i = 0, 31 do
        if a % 2 == 1 or b % 2 == 1 then r = r + bv end
        a, b, bv = floor(a / 2), floor(b / 2), bv * 2
    end
    return r
end
local function bxor(a, b)
    local r, bv = 0, 1
    a, b = a % 0x100000000, b % 0x100000000
    for i = 0, 31 do
        if (a % 2) ~= (b % 2) then r = r + bv end
        a, b, bv = floor(a / 2), floor(b / 2), bv * 2
    end
    return r
end
local function bnot(a) return tobit(0xFFFFFFFF - a % 0x100000000) end
local function lshift(a, n) return tobit(a * (2 ^ n)) end
local function rshift(a, n) return floor((a % 0x100000000) / (2 ^ n)) end
local function arshift(a, n)
    local v = tobit(a)
    if v < 0 then return floor(v / (2 ^ n)) end
    return floor(v / (2 ^ n))
end
local function tohex(n, l)
    l = l or 8
    n = tobit(n) % 0x100000000
    return string.format("%0" .. l .. "x", n)
end
local function rol(a, n) return tobit(lshift(a, n) + rshift(a, 32 - n)) end
local function ror(a, n) return tobit(rshift(a, n) + lshift(a, 32 - n)) end
local function bswap(n)
    local b1 = band(rshift(n, 0), 0xFF)
    local b2 = band(rshift(n, 8), 0xFF)
    local b3 = band(rshift(n, 16), 0xFF)
    local b4 = band(rshift(n, 24), 0xFF)
    return tobit(b1 * 0x1000000 + b2 * 0x10000 + b3 * 0x100 + b4)
end

bit = {
    band = band, bor = bor, bxor = bxor, bnot = bnot,
    lshift = lshift, rshift = rshift, arshift = arshift,
    tobit = tobit, tohex = tohex, rol = rol, ror = ror, bswap = bswap,
}
"#;

/// Lua 5.1 は loadfile 経由でファイルを読むときに先頭の "#" シェバン行を
/// 自動スキップする (lauxlib.c の loadfile 内部)。
/// Rust 側で内容を文字列としてロードするとこの自動スキップが効かないので、
/// 先頭が '#' なら最初の改行までを除去する。
/// PoB の HeadlessWrapper.lua は "#@" で始まる。
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

fn pob_src_dir() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .expect("src-tauri parent")
        .join("vendor")
        .join("PathOfBuilding-PoE2")
        .join("src")
}

/// Lua の loadfile / dofile / LoadModule を Rust 経由のファイル読み込みに置換。
/// これで日本語パス問題を回避できる。
fn override_file_loaders(lua: &Lua) -> mlua::Result<()> {
    // loadfile(path) -> chunk function
    let loadfile = lua.create_function(|lua, path: String| -> mlua::Result<Value> {
        let resolved = resolve_path(&path);
        match std::fs::read_to_string(&resolved) {
            Ok(content) => {
                let content = strip_shebang(content);
                let func = lua.load(content).set_name(path.clone()).into_function()?;
                Ok(Value::Function(func))
            }
            Err(e) => {
                // Lua 側に nil + error message のタプルを返したい所だが、
                // mlua では multi-return が必要。ここではシンプルに error。
                Err(mlua::Error::external(format!(
                    "loadfile fail '{}' (resolved={}): {}",
                    path,
                    resolved.display(),
                    e
                )))
            }
        }
    })?;
    lua.globals().set("loadfile", loadfile)?;

    // dofile(path) -> result of executing
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

fn resolve_path(p: &str) -> PathBuf {
    // 絶対パスならそのまま、相対なら cwd 基準
    let path = Path::new(p);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir()
            .map(|d| d.join(path))
            .unwrap_or_else(|_| path.to_path_buf())
    }
}

fn main() -> mlua::Result<()> {
    let pob_src = pob_src_dir();
    println!("=== PoB src dir: {} ===", pob_src.display());

    // PoB の src/ を cwd にすることで、HeadlessWrapper.lua の dofile("Launch.lua") が
    // pob_src/Launch.lua を見る
    env::set_current_dir(&pob_src).expect("set_current_dir to pob src");
    println!("cwd set to: {}", env::current_dir().unwrap().display());

    println!("\n=== Stage 1: Lua state (LuaJIT) + setup ===");
    let lua = Lua::new();
    override_file_loaders(&lua)?;
    // LuaJIT は bit/jit を内蔵しているので polyfill 不要。lua-utf8 は外部 lib なので stub。
    lua.load(UTF8_POLYFILL).exec()?;
    lua.load(ERROR_TRAP).exec()?;
    // arg は通常 Lua インタプリタ起動時に CLI 引数 table として入る。
    // mlua では自動定義されないので空 table で初期化する。
    lua.load(
        r#"
        arg = {}
        print("[lua] LuaJIT version: " .. tostring(jit and jit.version or "nojit"))
        print("[lua] jit stub + bit polyfill installed")
    "#,
    )
    .exec()?;
    lua.load(r#"print("[lua] hello from mlua + Lua 5.1 (loaders overridden)")"#)
        .exec()?;

    println!("\n=== Stage 2: Direct read of HeadlessWrapper.lua ===");
    let headless_path = pob_src.join("HeadlessWrapper.lua");
    let headless_content = std::fs::read_to_string(&headless_path)
        .expect("HeadlessWrapper.lua should be readable from Rust");
    println!(
        "  read OK: {} bytes",
        headless_content.len()
    );

    println!("\n=== Stage 3: Execute HeadlessWrapper.lua ===");
    println!("  This will load Launch.lua and try to initialize all of PoB.");
    println!("  Errors are expected; we are mapping the dependency surface.");

    let headless_content = strip_shebang(headless_content);
    // PoB submodule 内の runtime/lua/ には sha1, sha2, xml, dkjson, base64, socket 等の
    // 純 Lua ライブラリが揃っている（tmp 解凍不要）。これを package.path に追加。
    let lua_libs_path = pob_src
        .parent()
        .unwrap()
        .join("runtime")
        .join("lua")
        .display()
        .to_string()
        .replace('\\', "/");
    let setup_path = format!(
        r#"
        package.path = '{libs}/?.lua;{libs}/?/init.lua;' .. package.path
        print("[lua] lua libs path added: {libs}")
    "#,
        libs = lua_libs_path
    );
    lua.load(&setup_path).exec()?;

    let result: Result<Value, mlua::Error> = lua
        .load(headless_content)
        .set_name("HeadlessWrapper.lua")
        .eval();

    match result {
        Ok(v) => {
            println!("\n=== Stage 3: SUCCESS, returned {:?} ===", v.type_name());

            // build オブジェクトが取れるか確認
            let build: Value = lua.globals().get("build")?;
            println!("  globals.build = {:?}", build.type_name());

            // mainObject が取れるか
            let main_obj: Value = lua.globals().get("mainObject")?;
            println!("  globals.mainObject = {:?}", main_obj.type_name());
        }
        Err(e) => {
            println!("\n=== Stage 3: FAIL — {} ===", e);
            println!("  これは想定内。失敗箇所から PoB が必要とする stub を特定できる。");
        }
    }

    println!("\n=== Done. ===");
    Ok(())
}

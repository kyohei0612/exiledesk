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

// モジュール構成 (2026-09-07 R3: 808 行の単一ファイルを分割):
//   - `lua_boot`   LuaJIT state の初期化 (polyfill / file-loader override / boot_pob)
//   - `worker`     PobWorker (mpsc job queue) と worker thread ループ
//   - `lua_calls`  Lua 側 API 呼び出し (loadBuildFromXML / stat 取得 / 装備操作 / snapshot)
//   - `commands`   Tauri command (pob_*)
// 各子モジュールは `use super::*;` でここの import と兄弟の pub(crate) item を共有する。
mod commands;
mod lua_boot;
mod lua_calls;
mod worker;

pub use commands::*;
pub(crate) use lua_boot::*;
pub(crate) use lua_calls::*;
pub use worker::*;

// ---------------------------------------------------------------------------
// PoB share code decode
// ---------------------------------------------------------------------------

/// PoB share code（base64-url-safe encoded zlib-deflated XML）を decode して
/// プレーン XML にする。`+`/`/` の代わりに `-`/`_` を使う url-safe variant に対応。
pub fn decode_pob_code(code: &str) -> Result<String> {
    let cleaned: String = code
        .trim()
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '=')
        // url-safe と標準が混ざった物 (末尾の = 付きの url-safe など、PoB2 の書き出し) も読めるように寄せる
        .map(|c| match c {
            '+' => '-',
            '/' => '_',
            c => c,
        })
        .collect();
    let compressed = URL_SAFE_NO_PAD
        .decode(&cleaned)
        .context("base64 decode of PoB code")?;
    let mut decoder = ZlibDecoder::new(&compressed[..]);
    let mut xml = String::new();
    match decoder.read_to_string(&mut xml) {
        Ok(_) => Ok(xml),
        Err(e) => inflate_raw_lenient(&compressed).ok_or_else(|| anyhow!(e).context("zlib inflate of PoB code")),
    }
}

/// チャットなどを経て末尾 (チェックサム) が崩れたコードの救済 (2026-10-02 火力チェック)。
/// zlib の頭 2 バイトと尻 4 バイトを除いて生の deflate として読めるところまで読み、XML が閉じていれば使う。
fn inflate_raw_lenient(compressed: &[u8]) -> Option<String> {
    if compressed.len() < 7 {
        return None;
    }
    let mut d = flate2::read::DeflateDecoder::new(&compressed[2..compressed.len() - 4]);
    let mut buf = Vec::new();
    let mut chunk = [0u8; 16384];
    loop {
        match d.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
    let xml = String::from_utf8_lossy(&buf).into_owned();
    // 根が PoE2 の PoB で、かつ閉じタグまで読めている (途中で切れた物は使わない)
    (check_pob2_xml(&xml).is_ok() && xml.trim_end().ends_with("</PathOfBuilding2>")).then_some(xml)
}

/// 貼られた XML が PoE2 の PoB のビルドか (根の要素が `<PathOfBuilding2>`) を Rust 側で確かめる (2026-10-02)。
///
/// PoB の `loadBuildFromXML` → `LoadDB` は根が違うと `ShowErrMsg` + `CloseBuild` で**黙って**空のビルドに戻る
/// (vendor/PathOfBuilding-PoE2/src/Modules/Build.lua の LoadDB)。ヘッドレスでは ShowErrMsg が画面に出ないので、
/// PoE1 のコード (根が `<PathOfBuilding>`) や PoB でない XML を貼っても「読み込み成功」になっていた。
/// `pob_load_build_code` の decode 後・`pob_load_saved_build` の読み込み後・`inflate_raw_lenient` の 3 箇所で使う
pub fn check_pob2_xml(xml: &str) -> Result<(), String> {
    let mut rest = xml.trim_start_matches('\u{feff}').trim_start();
    // 先頭の <?xml ...?> 宣言とコメントは読み飛ばす
    loop {
        if rest.starts_with("<?") {
            let Some(end) = rest.find("?>") else { break };
            rest = rest[end + 2..].trim_start();
        } else if rest.starts_with("<!--") {
            let Some(end) = rest.find("-->") else { break };
            rest = rest[end + 3..].trim_start();
        } else {
            break;
        }
    }
    let Some(tag) = rest.strip_prefix('<') else {
        return Err("PoB のビルドではありません (XML ではない物を貼っています)".into());
    };
    let name: String = tag.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == ':').collect();
    match name.as_str() {
        "PathOfBuilding2" => Ok(()),
        // PoE1 の PoB は根が <PathOfBuilding>。PoE2 の PoB では読めない
        "PathOfBuilding" => Err("PoE1 の PoB コードです (PoE2 の PoB のコードを貼ってください)".into()),
        _ => Err(format!("PoB のビルドではありません (根の要素: <{}>)", name.chars().take(40).collect::<String>())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_pob2_xml_accepts_poe2_root() {
        assert!(check_pob2_xml("<PathOfBuilding2><Build/></PathOfBuilding2>").is_ok());
        assert!(check_pob2_xml("\u{feff}<?xml version=\"1.0\"?>\n<PathOfBuilding2>\n</PathOfBuilding2>").is_ok());
    }

    #[test]
    fn check_pob2_xml_rejects_poe1_and_others() {
        assert!(check_pob2_xml("<PathOfBuilding><Build/></PathOfBuilding>").unwrap_err().contains("PoE1"));
        assert!(check_pob2_xml("<html></html>").unwrap_err().contains("PoB のビルドではありません"));
        assert!(check_pob2_xml("ただの文").is_err());
        assert!(check_pob2_xml("").is_err());
    }
}

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

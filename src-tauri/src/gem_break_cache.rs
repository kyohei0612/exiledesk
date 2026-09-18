//! 使用率ランキングのキャラ別キャッシュ (2026-09-18)
//!
//! オーナー報告:「上位 MOD アセ、すぐレートが制限になって取るのにかなり時間くう」。
//!
//! 使用率ランキングはキャラ 1 人 = poe.ninja に 1 リクエストで、100 人ぶんを毎回ゼロから
//! 取り直していた。429 を食らうと Retry-After が 40〜50 分返ってくることもあり、
//! そこまでに取れていた分も次回に引き継がれずに捨てていた。
//!
//! ここでキャラごとのジェム情報を保存して、
//!   - 次に取る時はキャッシュに無い人だけ取る (上位 100 人の顔ぶれは日々そんなに入れ替わらない)
//!   - 途中でレート制限に当たっても、取れた分はそのまま残る (続きから再開できる)
//! ようにする。上位プレイヤーMOD一覧 (craft_v2_storage) の差分モードと同じ考え方。
//!
//! 保存先: `<app_data_dir>/gem_break_cache.json`
//! 捨てる条件: poe.ninja の snapshot version が変わった時 (別の集計になる) と、7 日より古いキャラ。

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 形式を変えた時に上げる (合わないキャッシュは捨てて取り直す)
const SCHEMA: u32 = 1;
/// これより古いキャラは捨てる (装備やジェムが変わっている可能性が上がるため)
const MAX_AGE_SECS: i64 = 7 * 24 * 3600;

/// キャラ 1 人ぶん。ジェムは poe.ninja の**表示値のまま**持つ
/// (装備の「+1 to Level of Skills」を引く計算は集計時にやるので、ここでは加工しない)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedGem {
    pub name: String,
    pub level: i64,
    pub quality: i64,
    pub corrupted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedChar {
    pub fetched_at: i64,
    pub gems: Vec<CachedGem>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct GemBreakCache {
    #[serde(default)]
    pub schema: u32,
    /// poe.ninja の snapshot version。変わったら全部捨てる
    #[serde(default)]
    pub snapshot_version: String,
    /// "アカウント|キャラ名" → ジェム
    #[serde(default)]
    pub characters: HashMap<String, CachedChar>,
}

pub fn char_key(account: &str, name: &str) -> String {
    format!("{account}|{name}")
}

fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app.path().app_data_dir().map_err(|e| format!("app_data_dir error: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("gem_break_cache.json");
    Ok(dir)
}

/// 読み込む。形式違い / snapshot 違いなら空で返す (= 全部取り直し)
pub fn load(app: &tauri::AppHandle, snapshot_version: &str, now: i64) -> GemBreakCache {
    let empty = GemBreakCache {
        schema: SCHEMA,
        snapshot_version: snapshot_version.to_string(),
        characters: HashMap::new(),
    };
    let Ok(p) = path(app) else { return empty };
    let Ok(raw) = std::fs::read_to_string(&p) else { return empty };
    let Ok(mut c) = serde_json::from_str::<GemBreakCache>(&raw) else { return empty };
    if c.schema != SCHEMA || c.snapshot_version != snapshot_version {
        return empty;
    }
    c.characters.retain(|_, v| now - v.fetched_at < MAX_AGE_SECS);
    c
}

pub fn save(app: &tauri::AppHandle, cache: &GemBreakCache) {
    let Ok(p) = path(app) else { return };
    match serde_json::to_string(cache) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&p, json) {
                eprintln!("[gem_break_cache] 保存できません: {e}");
            }
        }
        Err(e) => eprintln!("[gem_break_cache] JSON 化できません: {e}"),
    }
}

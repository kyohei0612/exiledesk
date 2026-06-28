//! クラフト発見 V2 のディスクキャッシュ (Phase ζ)。
//!
//! オーナー指示 (2026-05-22):
//!   - 通貨ランキング ↔ 発見 V2 を行き来したら毎回読み込みが入る → メモリ + ディスクで持続化
//!   - 起動時はキャッシュ即時表示 → 差分更新 (人数変動 / 新規 / 消失キャラ反映)
//!
//! 設計:
//!   - 保存先: `<app_data_dir>/craft_v2_cache.json`
//!   - データ構造は `CraftV2Cache` (snapshot_version でリーグ更新検知)
//!   - 容量縮小のため、character endpoint の items[] 全保持はしない。
//!     rare 装備 (frameType=2、8 スロット) の explicit_mods + inventory_id、
//!     ユニーク (frameType=3) の代表表示に必要な最小フィールドのみ。
//!
//! 既存パターン: `craft_discovery_storage.rs` を踏襲 (app_data_dir / async command / Tauri Manager).
//!
//! @author craft-discovery 君B (Phase ζ)
//! @date 2026-05-22

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use serde::{Deserialize, Serialize};

// ============================================================================
// キャッシュデータ構造
// ============================================================================

/// craft_v2 キャッシュ本体。`snapshot_version` の一致で差分モード判定。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CraftV2Cache {
    /// 例: "1623-20260521-21119"  (poe.ninja index-state の snapshotVersions[0].version)
    pub snapshot_version: String,
    /// 例: "vaal"  (economyLeagues[0].url)
    pub league_url: String,
    /// 例: "fate-of-the-vaal"  (snapshotVersions[0].snapshotName)
    pub snapshot_name: String,
    /// unix timestamp (seconds、保存時刻)
    pub saved_at: i64,
    /// 取得済アセンダンシー (使用率降順)
    pub ascendancies: Vec<CachedAscendancy>,
}

/// アセンダンシー単位のキャッシュ。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedAscendancy {
    /// 英語クラス名 ("Blood Mage" 等、search の class パラメタにそのまま渡せる)
    pub class: String,
    /// build-index-state より、使用率 (0.0〜100.0)
    pub percentage: f64,
    /// キャラ集合 (取得成功分のみ、search の上位順)
    pub characters: Vec<CachedCharacter>,
}

/// キャラ単位のキャッシュ (rare + unique のみ縮小保存)。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedCharacter {
    pub account: String,
    pub name: String,
    /// rare 装備 (frameType=2、8 スロット内のもの) を縮小保存
    pub rare_items: Vec<CachedRareItem>,
    /// ユニーク装備 (frameType=3) を縮小保存
    pub unique_items: Vec<CachedUniqueItem>,
    /// unix timestamp (seconds、fetch_character 完了時刻)
    pub fetched_at: i64,
}

/// rare 装備の最低限フィールド。MOD 集計に必要な情報のみ。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedRareItem {
    /// poe.ninja 生値 ("Ring" / "Ring2" / "Weapon" / "BodyArmour" 等)
    pub inventory_id: String,
    /// explicit MOD テキスト (例: "+47 to maximum Life")
    pub explicit_mods: Vec<String>,
    /// 2026-06-28: ベース別使用率集計用の baseType (例: "Sapphire Ring")。
    /// 古いキャッシュとの互換のため `#[serde(default)]` (= 空文字フォールバック)。
    #[serde(default)]
    pub base_type: String,
    /// Phase ν: poe.ninja item の `extended.subcategories` (例: `["shield"]`,
    /// `["focus"]`, `["quiver"]`, `["bow"]`, `["onesword"]`, `["wand"]`)。
    /// weapon2 バケットをサブ武器 / 盾 / フォーカス / クィーバーに分割するために使う。
    /// 古いキャッシュとの互換のため `#[serde(default)]`。
    #[serde(default)]
    pub subcategories: Vec<String>,
}

/// ユニーク装備の縮小保存。ホバーオーバーレイ表示に必要な最小サブセット。
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedUniqueItem {
    pub inventory_id: String,
    pub type_line: String,
    pub base_type: String,
    pub name: String,
    pub icon: String,
    pub implicit_mods: Vec<String>,
    pub explicit_mods: Vec<String>,
    /// JSON のまま保持 (string / array 両ケースあるため)
    pub flavour_text: Option<serde_json::Value>,
    /// JSON のまま保持 ({ name, values, ... } 構造)
    pub requirements: Option<serde_json::Value>,
    /// JSON のまま保持
    pub properties: Option<serde_json::Value>,
    pub item_level: Option<i64>,
    pub level: Option<i64>,
    /// Phase ν: ユニーク側も `extended.subcategories` を持たせて weapon2 分割で使う。
    /// (e.g. ユニーク盾は `["shield"]` を持つので `weapon2_shield` に振り分けたい)
    /// 古いキャッシュとの互換のため `#[serde(default)]`。
    #[serde(default)]
    pub subcategories: Vec<String>,
}

// ============================================================================
// ファイルパス
// ============================================================================

/// `<app_data_dir>/craft_v2_cache.json` の絶対パス。親 dir も作成する。
fn cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("craft_v2_cache.json");
    Ok(dir)
}

// ============================================================================
// Tauri commands
// ============================================================================

/// Phase ν: スキーマ更新を検知するためのプレフィックス。
/// 保存時に `snapshot_version` の頭に付与、読込時にこのプレフィックスが
/// 無いキャッシュは「旧スキーマ」とみなして破棄する。
///
/// 古いキャッシュには `extended.subcategories` が無いため、weapon2 サブタブ
/// (shield / focus / quiver / main) の分割が機能しない → 強制再取得する。
/// ν2 (2026-06-28): rare アイテムの `base_type` 追加。旧キャッシュは base_type が
/// 無く、差分モードで流用されるとベース別使用率が過小カウントになるため、
/// 一度だけフル再取得を強制して即座に完全化する。
const SCHEMA_PREFIX: &str = "ν2-";

/// 保存済キャッシュを読込む。ファイル無し or パース失敗時は Ok(None)。
///
/// パース失敗を Err にしないのは、スキーマ変更時の自動 reset を許容するため。
/// ログ出力もしない (Tauri runtime の stderr は通常クライアント側に届かない)。
///
/// Phase ν: `snapshot_version` 先頭の `SCHEMA_PREFIX` をチェックし、
/// 不一致なら旧スキーマとして Ok(None) を返してフル再取得を促す。
#[tauri::command]
pub fn craft_v2_cache_load(app: tauri::AppHandle) -> Result<Option<CraftV2Cache>, String> {
    let path = cache_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let mut cache: CraftV2Cache = match serde_json::from_str::<CraftV2Cache>(&text) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    // Phase ν: スキーマプレフィックスチェック。
    // 不一致 = subcategories 未収集の旧キャッシュ → 破棄して再取得。
    if !cache.snapshot_version.starts_with(SCHEMA_PREFIX) {
        return Ok(None);
    }
    // プレフィックスを剥がしておくことで、Rust 内部の snapshot_version 比較
    // (poe.ninja 側の生 version 文字列との突合) が透明に動く。
    //
    // Medium-M4 修正 (2026-05-22): `trim_start_matches` は同じプレフィックスを
    // 繰り返し剥がすため、SCHEMA_PREFIX が後続のデータ中にも現れた場合に過剰除去する
    // 可能性があった。`strip_prefix` は厳密に 1 回だけ剥がし、無ければ None を返すので
    // 「あれば 1 回剥がす、無ければそのまま」の意図に正確に一致する。
    // (上の `starts_with` 分岐で None 側は到達しないが、`map(to_string)` で借用衝突回避。)
    if let Some(stripped) = cache.snapshot_version.strip_prefix(SCHEMA_PREFIX).map(str::to_string) {
        cache.snapshot_version = stripped;
    }
    Ok(Some(cache))
}

/// キャッシュを保存。tempfile + rename で原子的に書き込む。
///
/// Phase ν: 保存時に `snapshot_version` 先頭へ `SCHEMA_PREFIX` を付与
/// (二重付与防止)。これで次回ロード時に新スキーマと識別できる。
///
/// Rust-H6 修正: `fs::write` 単独は非 atomic で、checkpoint 連発で書き込み中断 →
/// JSON 破損 → 次起動で全リセット の事故が起こり得た。
/// tempfile に書いてから `fs::rename` で差し替えることで、同一ボリューム内では
/// Windows / Unix 共に atomic な置換になる (途中で殺されても旧ファイルが残るだけ)。
#[tauri::command]
pub fn craft_v2_cache_save(app: tauri::AppHandle, cache: CraftV2Cache) -> Result<(), String> {
    let path = cache_path(&app)?;
    let mut cache_to_write = cache;
    if !cache_to_write.snapshot_version.starts_with(SCHEMA_PREFIX) {
        cache_to_write.snapshot_version =
            format!("{SCHEMA_PREFIX}{}", cache_to_write.snapshot_version);
    }
    let text = serde_json::to_string(&cache_to_write).map_err(|e| format!("serialize: {e}"))?;
    // path は ".../craft_v2_cache.json" なので with_extension("json.tmp") で
    // ".../craft_v2_cache.json.tmp" となる。同一ディレクトリ・同一ボリュームを保証。
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, text).map_err(|e| format!("write tmp {tmp_path:?}: {e}"))?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("rename {tmp_path:?} -> {path:?}: {e}"))?;
    Ok(())
}

/// キャッシュを削除 (UI の「キャッシュ削除 + 全取得」ボタン用)。
#[tauri::command]
pub fn craft_v2_cache_clear(app: tauri::AppHandle) -> Result<(), String> {
    let path = cache_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("remove {path:?}: {e}"))?;
    }
    Ok(())
}

//! `settings.rs` — アプリ全体の永続化設定 (Phase 1.6+ / 設定画面)
//! ===========================================================================
//!
//! オーナー要望 (2026-05-23):
//!   > ディスコードみたいにスタートアプリだけど、裏で起動してる感じ
//!   > 設定画面、スタートアプリ ON/OFF、閉じるで最小化、1 日 3 回 (6 時間ごと) 取得
//!
//! 責務:
//!   - `AppSettings` 構造体 = 永続化対象 (autostart / close_to_tray / auto-refetch)
//!   - `<app_data_dir>/settings.json` への atomic write (tempfile + rename)
//!   - `Mutex<AppSettings>` を Tauri state として管理し、起動時 load・コマンドで更新
//!   - `settings_load` / `settings_save` の 2 コマンドを export
//!
//! 設計判断 (オーナー指示の "妥協なし設計" に従う):
//!   - `craft_v2_storage.rs` の atomic write パターンを踏襲 (json.tmp → rename)。
//!   - 読込失敗時は `Default` でリセット (ユーザーに警告は出さない、ログ重視)。
//!   - 設定値は `Mutex` で in-memory cache。`on_window_event` (× ボタン) は
//!     同期コンテキストなので、毎回 disk 読込しないよう state 参照のみで判断する。
//!   - 値域チェック: `auto_refetch_interval_secs` は 0 (無効) または 600..=86400 に丸める。
//!     UI 側で 0/1..=24 時間 を選ばせるが、Rust 側でも防御的にバリデート。
//!
//! @author secretary (Phase 設定画面)
//! @date 2026-05-23

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

// ============================================================================
// AppSettings 構造体
// ============================================================================

/// 永続化される全アプリ設定。
///
/// `Default` は「初回起動時 / 設定ファイル破損時」のフォールバック値。
/// Discord 風 (autostart=false / close_to_tray=true / 6h 間隔) をデフォルトに置く。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AppSettings {
    /// Windows ログイン時に自動起動するか。
    /// `tauri-plugin-autostart` 側の状態と同期する (UI 側で enable/disable() を呼ぶ)。
    pub autostart_enabled: bool,
    /// × ボタンで「最小化 (タスクトレイへ)」か「通常終了」か。
    /// true = Discord 風 hide、false = 完全終了。
    pub close_to_tray: bool,
    /// 自動再取得の間隔 (秒)。0 で無効。デフォ 6 * 3600 = 21600 秒 (1 日 4 回相当)。
    pub auto_refetch_interval_secs: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            autostart_enabled: false,
            close_to_tray: true, // Discord 風がデフォ (オーナー指示)
            auto_refetch_interval_secs: 6 * 3600,
        }
    }
}

impl AppSettings {
    /// 値域に収まらない場合に防御的に丸める。
    ///
    /// - `auto_refetch_interval_secs`:
    ///   - 0 → そのまま (無効化)
    ///   - 1..=599 → 600 (最低 10 分、誤入力で連打しないように)
    ///   - 86400+ → 86400 (上限 24 時間)
    fn normalized(mut self) -> Self {
        let s = self.auto_refetch_interval_secs;
        self.auto_refetch_interval_secs = if s == 0 {
            0
        } else if s < 600 {
            600
        } else if s > 86_400 {
            86_400
        } else {
            s
        };
        self
    }
}

// ============================================================================
// state: Mutex<AppSettings> ラッパー
// ============================================================================

/// Tauri state として `app.manage()` に渡す。`on_window_event` 等の同期文脈から
/// 即座に値を引きたいので Mutex 一段でラップする (頻度は秒 1 件以下、競合無視可)。
#[derive(Default)]
pub struct AppSettingsState(pub Mutex<AppSettings>);

impl AppSettingsState {
    pub fn get(&self) -> AppSettings {
        // poisoned Mutex 時は Default に倒す。設定 1 個壊れて起動不能 < 既定値で続行。
        match self.0.lock() {
            Ok(g) => g.clone(),
            Err(poisoned) => poisoned.into_inner().clone(),
        }
    }
    pub fn set(&self, new_value: AppSettings) {
        if let Ok(mut g) = self.0.lock() {
            *g = new_value;
        }
    }
}

// ============================================================================
// ファイルパス & atomic I/O
// ============================================================================

/// `<app_data_dir>/settings.json` の絶対パス。親 dir も作成する。
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir {dir:?}: {e}"))?;
    dir.push("settings.json");
    Ok(dir)
}

/// 同期 disk 読込 (起動時 setup と command 双方から呼ぶ用)。
///
/// ファイル無し / JSON 破損 / I/O エラー時は `AppSettings::default()` を返す。
/// 「設定読めなくて起動できない」事故より「既定値で続行 + 後から保存し直し」を優先。
pub fn load_from_disk(app: &tauri::AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };
    if !path.exists() {
        return AppSettings::default();
    }
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return AppSettings::default(),
    };
    serde_json::from_str::<AppSettings>(&text)
        .unwrap_or_default()
        .normalized()
}

/// 同期 disk 書込 (atomic: tempfile + rename)。
///
/// `craft_v2_storage.rs` と同じパターン: 同一ディレクトリの `.json.tmp` に書いて
/// `fs::rename` で差し替える。Windows / Unix とも同一ボリュームでは atomic。
fn save_to_disk(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings).map_err(|e| format!("serialize: {e}"))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, text).map_err(|e| format!("write tmp {tmp_path:?}: {e}"))?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("rename {tmp_path:?} -> {path:?}: {e}"))?;
    Ok(())
}

// ============================================================================
// Tauri commands
// ============================================================================

/// 現在の設定を取得 (state cache 経由、disk 読込はしない)。
///
/// state は setup 時に disk から 1 回 load 済 + save 時に同期して更新される。
#[tauri::command]
pub fn settings_load(state: tauri::State<'_, AppSettingsState>) -> Result<AppSettings, String> {
    Ok(state.get())
}

/// 設定を更新して disk へ atomic 書込み + state cache 更新。
///
/// 値域は `normalized()` で安全側に丸める。
#[tauri::command]
pub fn settings_save(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    settings: AppSettings,
) -> Result<(), String> {
    let normalized = settings.normalized();
    save_to_disk(&app, &normalized)?;
    state.set(normalized);
    Ok(())
}

/// 現在のビルドが debug ビルドかを返す。
///
/// UI 側 (Settings.vue) が「dev ビルド中は autostart toggle を無効化」する
/// 判定に使う。debug ビルドの exe は CUI subsystem (= 起動時に黒コンソール窓が出る)
/// で、`tauri-plugin-autostart::enable()` を呼ぶと `std::env::current_exe()` の
/// debug 絶対パスが HKCU\Run に焼き付き、PC 起動時にちらつきの原因になる。
/// UI 側で構造的に enable させないことで再発を防ぐ (2026-05-25 解析)。
#[tauri::command]
pub fn is_debug_build() -> bool {
    cfg!(debug_assertions)
}

// ============================================================================
// tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_matches_discord_style() {
        let d = AppSettings::default();
        assert!(!d.autostart_enabled);
        assert!(d.close_to_tray);
        assert_eq!(d.auto_refetch_interval_secs, 21_600);
    }

    #[test]
    fn normalized_clamps_too_short_interval() {
        let s = AppSettings {
            auto_refetch_interval_secs: 1,
            ..Default::default()
        }
        .normalized();
        assert_eq!(s.auto_refetch_interval_secs, 600);
    }

    #[test]
    fn normalized_keeps_zero_as_disabled() {
        let s = AppSettings {
            auto_refetch_interval_secs: 0,
            ..Default::default()
        }
        .normalized();
        assert_eq!(s.auto_refetch_interval_secs, 0);
    }

    #[test]
    fn normalized_clamps_too_long_interval() {
        let s = AppSettings {
            auto_refetch_interval_secs: 1_000_000,
            ..Default::default()
        }
        .normalized();
        assert_eq!(s.auto_refetch_interval_secs, 86_400);
    }

    #[test]
    fn json_roundtrip_preserves_values() {
        let original = AppSettings {
            autostart_enabled: true,
            close_to_tray: false,
            auto_refetch_interval_secs: 3 * 3600,
        };
        let text = serde_json::to_string(&original).unwrap();
        let restored: AppSettings = serde_json::from_str(&text).unwrap();
        assert_eq!(original, restored);
    }
}

//! 同梱 PoB (Path of Building Community – PoE2) の起動 (2026-09-07)
//!
//! 左ナビ「PoB」から、インストーラに同梱した PoB を外部プロセスとして開く。
//! 同梱物は `scripts/build-pob-bundle.mjs` が vendor submodule から
//! `src-tauri/resources/pob/` に組み立て、Tauri の bundle.resources で配布される
//! (サブ PC でも別途 PoB のインストールは不要)。
//!
//! 同じディレクトリを mlua ヘッドレス PoB (`pob` モジュール) のスクリプト元にも使う。
//! 旧実装は `CARGO_MANIFEST_DIR` 固定 (= 開発機の vendor パス) だったため、
//! リリースビルドではヘッドレス PoB が起動できなかった。

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::Manager;

/// 同梱 PoB の実行体ファイル名 (公式 runtime と同じ)
pub const POB_EXE_NAME: &str = "Path of Building-PoE2.exe";

/// 同梱 PoB ディレクトリの候補を順に探し、`Launch.lua` がある最初のものを返す。
///
/// - リリース: `<resource_dir>/resources/pob` (tauri.conf.json の `resources/pob/**/*`)
/// - 開発 (`tauri dev`): `src-tauri/resources/pob` (build-pob-bundle.mjs の出力)
pub fn bundled_pob_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.join("resources").join("pob"));
        candidates.push(res.join("pob"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("pob"),
    );
    candidates
        .into_iter()
        .find(|d| d.join("Launch.lua").is_file())
}

/// ヘッドレス PoB (mlua) 用のスクリプトディレクトリ。
/// 同梱版があればそれ、無ければ開発用に vendor submodule の `src/` に倒す。
pub fn headless_src_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(d) = bundled_pob_dir(app) {
        return d;
    }
    let fallback = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("vendor").join("PathOfBuilding-PoE2").join("src"))
        .unwrap_or_default();
    eprintln!(
        "[pob_launcher] bundled PoB not found, falling back to vendor src: {}",
        fallback.display()
    );
    fallback
}

/// `exiledesk-pob.json` (build-pob-bundle.mjs が書く同梱メタ)
#[derive(serde::Deserialize, Default)]
struct BundleMeta {
    version: Option<String>,
    tree: Option<String>,
}

/// UI 向けの同梱 PoB 状態
#[derive(Serialize, Clone, Debug, Default)]
pub struct PobLauncherStatus {
    /// 実行体まで揃っていて起動できる
    pub available: bool,
    pub dir: Option<String>,
    pub exe: Option<String>,
    /// 同梱 PoB のバージョン (公式 manifest の Version number)
    pub version: Option<String>,
    /// 同梱ツリーバージョン (例: "0_5")
    pub tree: Option<String>,
    /// available=false のときの理由 / 起動失敗の理由
    pub message: Option<String>,
}

fn build_status(app: &tauri::AppHandle) -> PobLauncherStatus {
    let Some(dir) = bundled_pob_dir(app) else {
        return PobLauncherStatus {
            message: Some(
                "同梱 PoB が見つかりません (開発時: node scripts/build-pob-bundle.mjs を実行)".to_string(),
            ),
            ..Default::default()
        };
    };
    let exe = dir.join(POB_EXE_NAME);
    let meta: BundleMeta = std::fs::read_to_string(dir.join("exiledesk-pob.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let available = exe.is_file();
    PobLauncherStatus {
        available,
        dir: Some(dir.display().to_string()),
        exe: Some(exe.display().to_string()),
        version: meta.version,
        tree: meta.tree,
        message: if available {
            None
        } else {
            Some(format!("実行体が見つかりません: {}", exe.display()))
        },
    }
}

/// 同梱 PoB の状態 (存在 / バージョン) を返す。
#[tauri::command]
pub fn pob_launcher_status(app: tauri::AppHandle) -> PobLauncherStatus {
    build_status(&app)
}

/// 同梱 PoB を別プロセスで起動する。既に起動していても新しいウィンドウを増やすだけ
/// (PoB 自身は多重起動を許容する)。
#[tauri::command]
pub fn pob_launcher_open(app: tauri::AppHandle) -> Result<PobLauncherStatus, String> {
    let status = build_status(&app);
    if !status.available {
        return Err(status
            .message
            .clone()
            .unwrap_or_else(|| "同梱 PoB を起動できません".to_string()));
    }
    let dir = PathBuf::from(status.dir.as_deref().unwrap_or_default());
    let exe = PathBuf::from(status.exe.as_deref().unwrap_or_default());
    // cwd を PoB ディレクトリにする: Launch.lua / manifest.xml / installed.cfg は
    // 相対パスで開かれるため (SimpleGraphic は exe の場所ではなく cwd 基準)。
    Command::new(&exe)
        .current_dir(&dir)
        .spawn()
        .map_err(|e| format!("PoB の起動に失敗: {} ({})", e, exe.display()))?;
    Ok(status)
}

//! PoB 同梱物の別配布 (2026-09-08)
//!
//! これまで PoB (約 190 MB) をインストーラに同梱していたため、アプリ更新のたびに 120 MB を落としていた。
//! PoB を GitHub Release の固定タグ `pob-bundle` (rolling) に zip + manifest として置き、
//! アプリは `<app_local_data_dir>/pob/` に展開して使う。
//!   - 起動時: インストール済みなら前回チェックから 30 日空いたときだけ manifest を見に行き、
//!     contentHash が変わっていれば自動で入れ替える (オーナー指示: 起動のたびに取りに行かない)
//!   - 未インストール: PoB 画面で案内し、ボタンでダウンロード (手動)
//!   - 手動「更新を確認」はいつでも可
//! manifest / zip は `scripts/publish-pob-bundle.mjs` (CI) が作る。

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

/// manifest の URL (rolling release `pob-bundle`)
pub const POB_BUNDLE_MANIFEST_URL: &str =
    "https://github.com/kyohei0612/ExileDesk/releases/download/pob-bundle/pob-bundle.json";
/// 自動チェックの間隔 (30 日)
pub const POB_BUNDLE_CHECK_INTERVAL_SECS: u64 = 30 * 24 * 3600;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct PobBundleManifest {
    pub version: Option<String>,
    pub tree: Option<String>,
    pub jp: Option<String>,
    /// 同梱物の内容ハッシュ (builtAt を除く)。これが変わったときだけ入れ替える
    #[serde(rename = "contentHash")]
    pub content_hash: String,
    #[serde(rename = "zipSha256")]
    pub zip_sha256: String,
    #[serde(rename = "zipSize")]
    pub zip_size: u64,
    #[serde(rename = "builtAt")]
    pub built_at: Option<String>,
    pub url: String,
}

/// `<data>/pob/pob-state.json`
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
struct PobBundleState {
    content_hash: Option<String>,
    installed_at: Option<u64>,
    checked_at: Option<u64>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct PobBundleStatus {
    /// `<data>/pob/Launch.lua` がある
    pub installed: bool,
    pub dir: String,
    pub version: Option<String>,
    pub jp: Option<String>,
    pub content_hash: Option<String>,
    pub installed_at: Option<u64>,
    pub checked_at: Option<u64>,
    /// 次回の自動チェック予定 (epoch 秒)。未インストールなら None
    pub next_check_at: Option<u64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PobBundleCheck {
    pub manifest: PobBundleManifest,
    pub update_needed: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    received: u64,
    total: u64,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// `<app_local_data_dir>/pob`
pub fn pob_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|d| d.join("pob"))
        .map_err(|e| format!("app_local_data_dir: {e}"))
}

fn state_path(dir: &Path) -> PathBuf {
    dir.join("pob-state.json")
}

fn read_state(dir: &Path) -> PobBundleState {
    std::fs::read_to_string(state_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_state(dir: &Path, st: &PobBundleState) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(state_path(dir), serde_json::to_string_pretty(st).unwrap()).map_err(|e| e.to_string())
}

#[derive(Deserialize, Default)]
struct BundleMeta {
    version: Option<String>,
    jp: Option<String>,
}

fn build_status(app: &tauri::AppHandle) -> Result<PobBundleStatus, String> {
    let dir = pob_data_dir(app)?;
    let installed = dir.join("Launch.lua").is_file();
    let st = read_state(&dir);
    let meta: BundleMeta = std::fs::read_to_string(dir.join("exiledesk-pob.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    Ok(PobBundleStatus {
        installed,
        dir: dir.display().to_string(),
        version: meta.version,
        jp: meta.jp,
        content_hash: st.content_hash.clone(),
        installed_at: st.installed_at,
        checked_at: st.checked_at,
        next_check_at: if installed { Some(st.checked_at.unwrap_or(0) + POB_BUNDLE_CHECK_INTERVAL_SECS) } else { None },
    })
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("ExileDesk/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

/// manifest URL (環境変数 EXILEDESK_POB_MANIFEST_URL でローカル検証用に差し替え可)
pub fn manifest_url() -> String {
    std::env::var("EXILEDESK_POB_MANIFEST_URL").unwrap_or_else(|_| POB_BUNDLE_MANIFEST_URL.to_string())
}

pub async fn fetch_manifest() -> Result<PobBundleManifest, String> {
    let resp = http_client()?
        .get(manifest_url())
        .send()
        .await
        .map_err(|e| format!("manifest の取得に失敗: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("manifest の取得に失敗: HTTP {}", resp.status()));
    }
    resp.json::<PobBundleManifest>().await.map_err(|e| format!("manifest の解析に失敗: {e}"))
}

/// インストール状態 (ネットワークなし)
#[tauri::command]
pub fn pob_bundle_status(app: tauri::AppHandle) -> Result<PobBundleStatus, String> {
    build_status(&app)
}

/// manifest を見に行って更新の要否を返す。checked_at を更新する。
#[tauri::command]
pub async fn pob_bundle_check(app: tauri::AppHandle) -> Result<PobBundleCheck, String> {
    let dir = pob_data_dir(&app)?;
    let manifest = fetch_manifest().await?;
    let mut st = read_state(&dir);
    st.checked_at = Some(now());
    write_state(&dir, &st)?;
    let installed = dir.join("Launch.lua").is_file();
    let update_needed = !installed || st.content_hash.as_deref() != Some(manifest.content_hash.as_str());
    Ok(PobBundleCheck { manifest, update_needed })
}

/// ダウンロード → sha256 検証 → `pob.new` に展開 → `<parent>/pob` と入れ替え → state 書き込み。
/// AppHandle に依存しないので examples/pob_bundle_probe.rs からも呼べる。
pub async fn install_from_manifest(
    parent: &Path,
    manifest: &PobBundleManifest,
    on_progress: &(dyn Fn(&'static str, u64, u64) + Sync),
) -> Result<PathBuf, String> {
    let dir = parent.join("pob");
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    // --- download ---
    let zip_path = parent.join("pob-bundle.download.zip");
    let client = http_client()?;
    let mut resp = client
        .get(&manifest.url)
        .send()
        .await
        .map_err(|e| format!("ダウンロード開始に失敗: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ダウンロードに失敗: HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(manifest.zip_size);
    let mut file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut last_emit: u64 = 0;
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("ダウンロード中に失敗: {e}"))? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        if received - last_emit >= 1_000_000 || received == total {
            last_emit = received;
            on_progress("download", received, total);
        }
    }
    drop(file);
    let digest = format!("{:x}", hasher.finalize());
    if !manifest.zip_sha256.is_empty() && digest != manifest.zip_sha256 {
        let _ = std::fs::remove_file(&zip_path);
        return Err(format!("ダウンロードしたファイルのハッシュが一致しません ({digest} ≠ {})", manifest.zip_sha256));
    }

    // --- extract (blocking) ---
    on_progress("extract", 0, 0);
    let new_dir = parent.join("pob.new");
    let old_dir = parent.join("pob.old");
    let zip_for_task = zip_path.clone();
    let new_for_task = new_dir.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if new_for_task.exists() {
            std::fs::remove_dir_all(&new_for_task).map_err(|e| e.to_string())?;
        }
        let f = std::fs::File::open(&zip_for_task).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(f).map_err(|e| format!("zip を開けません: {e}"))?;
        archive.extract(&new_for_task).map_err(|e| format!("展開に失敗: {e}"))
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&zip_path);
    if !new_dir.join("Launch.lua").is_file() {
        return Err("展開した中身に Launch.lua がありません".to_string());
    }

    // --- swap ---
    if old_dir.exists() {
        let _ = std::fs::remove_dir_all(&old_dir);
    }
    if dir.exists() {
        std::fs::rename(&dir, &old_dir).map_err(|e| format!("旧 PoB の退避に失敗 (PoB が起動中?): {e}"))?;
    }
    std::fs::rename(&new_dir, &dir).map_err(|e| format!("新 PoB の配置に失敗: {e}"))?;
    let _ = std::fs::remove_dir_all(&old_dir);

    write_state(
        &dir,
        &PobBundleState { content_hash: Some(manifest.content_hash.clone()), installed_at: Some(now()), checked_at: Some(now()) },
    )?;
    on_progress("done", total, total);
    Ok(dir)
}

/// zip をダウンロード → 検証 → 展開 → 入れ替え → ヘッドレス PoB を再起動。
/// 進捗は `pob-bundle-progress` {phase, received, total} で emit。
#[tauri::command]
pub async fn pob_bundle_install(app: tauri::AppHandle, window: tauri::Window) -> Result<PobBundleStatus, String> {
    let dir = pob_data_dir(&app)?;
    let parent = dir.parent().map(Path::to_path_buf).ok_or("data dir")?;
    let manifest = fetch_manifest().await?;
    let w = window.clone();
    let emit = move |phase: &'static str, received: u64, total: u64| {
        let _ = w.emit("pob-bundle-progress", Progress { phase, received, total });
    };
    let installed = install_from_manifest(&parent, &manifest, &emit).await?;
    // ヘッドレス PoB (DPS 計算) を新しいディレクトリで起動し直す
    if let Some(worker) = app.try_state::<crate::pob::PobWorker>() {
        worker.restart(installed);
    }
    build_status(&app)
}

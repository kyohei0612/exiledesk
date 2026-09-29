//! 画像パック (2026-09-29)
//!
//! オーナー「画像ビルドとコードビルドで完全に分けたら」「1 発目だけ配って、画像は 1 回配ったら再配布なし」。
//! 画像はインストーラーに入れず、GitHub Release の固定タグ `asset-packs` に `<pack>.zip` + `<pack>.json` (manifest) で置く
//! (scripts/asset-packs.mjs --publish が、画像が変わった時だけ上げる)。アプリは画面が要る版 (hash) と
//! `<app_local_data_dir>/assets/<pack>/.pack-state.json` を比べ、違う時だけ落として展開し直す。
//! 仕組みは PoB の別配布 (pob_bundle.rs) と同じ (sha256 検証 → `<pack>.new` に展開 → 入れ替え)。
//! 2026-09-29 オーナー「追加画像だけ落とす形」: 初回 (手元に無い) だけ zip。次からは manifest の files (名前 → ハッシュ) と
//! 手元を比べ、変わった・増えた画像だけを GitHub の中身 (manifest の commit の public/<pack>/) から 1 枚ずつ落とし、消えた画像は消す。
//! 手元の一覧が無い (v0.1.323 で zip だけ入れた) 時は、手元のファイルからハッシュを計算して比べる。多すぎる (400 枚超) 時は zip。

use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

const BASE_URL: &str = "https://github.com/kyohei0612/ExileDesk/releases/download/asset-packs";
/** 1 枚ずつ落とす時の取り先 (コミット・パック・ファイル名を後ろに付ける) */
const RAW_URL: &str = "https://raw.githubusercontent.com/kyohei0612/ExileDesk";
/** これより多く変わっていたら 1 枚ずつではなく zip で入れ直す */
const DIFF_LIMIT: usize = 400;

#[derive(Deserialize, Clone, Debug)]
struct PackManifest {
    #[serde(rename = "contentHash")]
    content_hash: String,
    #[serde(rename = "zipSha256")]
    zip_sha256: String,
    #[serde(rename = "zipSize")]
    zip_size: u64,
    url: String,
    /** 画像が入っているコミット (1 枚ずつ落とす時の取り先) */
    commit: Option<String>,
    /** ファイル名 → ハッシュ (sha256 の先頭 16 桁) */
    files: Option<HashMap<String, String>>,
}

#[derive(Serialize, Deserialize, Default)]
struct PackState {
    content_hash: Option<String>,
    #[serde(default)]
    files: Option<HashMap<String, String>>,
}

fn file_hash(bytes: &[u8]) -> String {
    let d = format!("{:x}", Sha256::digest(bytes));
    d[..16].to_string()
}

/// 手元の画像の一覧 (state に無い時はファイルから計算する)
fn local_files(dir: &Path, st: &PackState) -> HashMap<String, String> {
    if let Some(f) = &st.files {
        return f.clone();
    }
    let mut out = HashMap::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if let Ok(b) = std::fs::read(e.path()) {
                out.insert(name, file_hash(&b));
            }
        }
    }
    out
}

/// 差分: 公開の一覧 (remote) と手元 (local) を比べ、(落とす = 無い・中身が違う, 消す = 公開から消えた) を返す。名前順
fn diff_files(remote: &HashMap<String, String>, local: &HashMap<String, String>) -> (Vec<String>, Vec<String>) {
    let mut changed: Vec<String> = remote.iter().filter(|(k, v)| local.get(*k) != Some(*v)).map(|(k, _)| k.clone()).collect();
    let mut removed: Vec<String> = local.keys().filter(|k| !remote.contains_key(*k)).cloned().collect();
    changed.sort();
    removed.sort();
    (changed, removed)
}

fn write_state(dir: &Path, st: &PackState) -> Result<(), String> {
    std::fs::write(dir.join(".pack-state.json"), serde_json::to_string(st).unwrap()).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
struct Progress {
    pack: String,
    phase: &'static str,
    received: u64,
    total: u64,
}

fn packs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|d| d.join("assets")).map_err(|e| format!("app_local_data_dir: {e}"))
}

fn read_state(dir: &Path) -> PackState {
    std::fs::read_to_string(dir.join(".pack-state.json")).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("ExileDesk/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())
}

/// 画像パックの展開先。`hash` の版が入っていればそのまま、違えば落として入れ替える。
/// 落とせなかった時も、前に入れた物があればそれを返す (ネットが無くても前の画像は出る)。
/// 進捗は `asset-pack-progress` {pack, phase, received, total}。
#[tauri::command]
pub async fn asset_pack_ensure(app: tauri::AppHandle, pack: String, hash: String) -> Result<String, String> {
    if pack.is_empty() || !pack.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
        return Err(format!("パックの名前が変: {pack}"));
    }
    let root = packs_dir(&app)?;
    let dir = root.join(&pack);
    if read_state(&dir).content_hash.as_deref() == Some(hash.as_str()) && dir.is_dir() {
        return Ok(dir.display().to_string());
    }
    match install(&app, &root, &pack).await {
        Ok(got) => {
            if got != hash {
                crate::app_log::line_static(&format!("[画像パック] {pack}: 欲しい版 {hash} と公開済み {got} が違う (公開済みを使う)"));
            }
            Ok(dir.display().to_string())
        }
        Err(e) if dir.is_dir() => {
            crate::app_log::line_static(&format!("[画像パック] {pack}: 更新に失敗、前の画像を使う ({e})"));
            Ok(dir.display().to_string())
        }
        Err(e) => Err(e),
    }
}

/// manifest を見て、差分 (変わった画像だけ) か zip で入れる。入れた版 (contentHash) を返す
async fn install(app: &tauri::AppHandle, root: &Path, pack: &str) -> Result<String, String> {
    let client = http_client()?;
    let m: PackManifest = client
        .get(format!("{BASE_URL}/{pack}.json"))
        .send()
        .await
        .map_err(|e| format!("manifest の取得に失敗: {e}"))?
        .error_for_status()
        .map_err(|e| format!("manifest の取得に失敗: {e}"))?
        .json()
        .await
        .map_err(|e| format!("manifest の解析に失敗: {e}"))?;
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let dir = root.join(pack);
    if let (true, Some(files), Some(commit)) = (dir.is_dir(), &m.files, &m.commit) {
        let local = local_files(&dir, &read_state(&dir));
        let (changed, removed) = diff_files(files, &local);
        if changed.len() <= DIFF_LIMIT {
            let total = changed.len() as u64;
            for (i, name) in changed.iter().enumerate() {
                let _ = app.emit("asset-pack-progress", Progress { pack: pack.to_string(), phase: "files", received: i as u64, total });
                let bytes = client
                    .get(format!("{RAW_URL}/{commit}/public/{pack}/{name}"))
                    .send()
                    .await
                    .and_then(|r| r.error_for_status())
                    .map_err(|e| format!("{name} の取得に失敗: {e}"))?
                    .bytes()
                    .await
                    .map_err(|e| format!("{name} の取得に失敗: {e}"))?;
                if &file_hash(&bytes) != files.get(name).unwrap() {
                    return Err(format!("{name} のハッシュが合わない"));
                }
                let tmp = dir.join(format!("{name}.part"));
                std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
                std::fs::rename(&tmp, dir.join(name.as_str())).map_err(|e| e.to_string())?;
            }
            for name in &removed {
                let _ = std::fs::remove_file(dir.join(name.as_str()));
            }
            write_state(&dir, &PackState { content_hash: Some(m.content_hash.clone()), files: Some(files.clone()) })?;
            let _ = app.emit("asset-pack-progress", Progress { pack: pack.to_string(), phase: "done", received: total, total });
            crate::app_log::line_static(&format!("[画像パック] {pack}: 差分 {} 枚を落とし {} 枚を消した ({})", changed.len(), removed.len(), m.content_hash));
            return Ok(m.content_hash);
        }
    }
    let zip_path = root.join(format!("{pack}.download.zip"));
    let mut resp = client.get(&m.url).send().await.map_err(|e| format!("ダウンロードに失敗: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ダウンロードに失敗: HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(m.zip_size);
    let emit = |phase: &'static str, received: u64| {
        let _ = app.emit("asset-pack-progress", Progress { pack: pack.to_string(), phase, received, total });
    };
    let mut file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let (mut received, mut last) = (0u64, 0u64);
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("ダウンロード中に失敗: {e}"))? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        if received - last >= 1_000_000 {
            last = received;
            emit("download", received);
        }
    }
    drop(file);
    let digest = format!("{:x}", hasher.finalize());
    if digest != m.zip_sha256 {
        let _ = std::fs::remove_file(&zip_path);
        return Err(format!("ハッシュが合わない ({digest} ≠ {})", m.zip_sha256));
    }
    emit("extract", received);
    let new_dir = root.join(format!("{pack}.new"));
    let (zp, nd) = (zip_path.clone(), new_dir.clone());
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if nd.exists() {
            std::fs::remove_dir_all(&nd).map_err(|e| e.to_string())?;
        }
        let f = std::fs::File::open(&zp).map_err(|e| e.to_string())?;
        zip::ZipArchive::new(f).map_err(|e| format!("zip を開けない: {e}"))?.extract(&nd).map_err(|e| format!("展開に失敗: {e}"))
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = std::fs::remove_file(&zip_path);
    let old = root.join(format!("{pack}.old"));
    let _ = std::fs::remove_dir_all(&old);
    if dir.exists() {
        std::fs::rename(&dir, &old).map_err(|e| format!("前の画像の退避に失敗: {e}"))?;
    }
    std::fs::rename(&new_dir, &dir).map_err(|e| format!("画像の配置に失敗: {e}"))?;
    let _ = std::fs::remove_dir_all(&old);
    write_state(&dir, &PackState { content_hash: Some(m.content_hash.clone()), files: m.files.clone() })?;
    emit("done", received);
    crate::app_log::line_static(&format!("[画像パック] {pack}: {:.1} MB を入れた ({})", received as f64 / 1_048_576.0, m.content_hash));
    Ok(m.content_hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn diff_only_new_changed_and_removed() {
        let remote = map(&[("a.webp", "1"), ("b.webp", "2"), ("c.webp", "3")]);
        let local = map(&[("a.webp", "1"), ("b.webp", "old"), ("gone.webp", "9")]);
        let (changed, removed) = diff_files(&remote, &local);
        // a は同じなので落とさない。b は中身が違う、c は増えた。gone は公開から消えた
        assert_eq!(changed, vec!["b.webp", "c.webp"]);
        assert_eq!(removed, vec!["gone.webp"]);
    }

    #[test]
    fn diff_same_is_empty() {
        let remote = map(&[("a.webp", "1"), ("b.webp", "2")]);
        let (changed, removed) = diff_files(&remote, &remote.clone());
        assert!(changed.is_empty() && removed.is_empty());
    }

    #[test]
    fn file_hash_is_16_hex() {
        let h = file_hash(b"exiledesk");
        assert_eq!(h.len(), 16);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(h, file_hash(b"exiledesk"));
    }
}

//! client_log/find.rs — Client.txt を探す (Steam のライブラリも見る)
//!
//! 2026-09-19 に client_log.rs (732 行) から切り出した。
//! サブモジュールは private なので pub にしてもクレートの外には出ない。
use super::*;

/// Steam の libraryfolders.vdf から追加ライブラリのパスを拾う (サブ PC で D: に入れている場合用)
pub fn steam_library_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    for base in [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
    ] {
        let vdf = PathBuf::from(base).join("steamapps").join("libraryfolders.vdf");
        let Ok(text) = std::fs::read_to_string(&vdf) else { continue };
        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("\"path\"") {
                continue;
            }
            // "path"		"D:\\SteamLibrary"
            if let Some(v) = line.split('"').nth(3) {
                out.push(PathBuf::from(v.replace("\\\\", "\\")));
            }
        }
        out.push(PathBuf::from(base));
    }
    out
}

/// Client.txt の候補を順に探す。環境変数 `EXILEDESK_CLIENT_LOG` が最優先。
pub fn find_client_log() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("EXILEDESK_CLIENT_LOG") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    for root in steam_library_roots() {
        candidates.push(root.join("steamapps/common/Path of Exile 2/logs/Client.txt"));
    }
    for base in [
        r"C:\Program Files (x86)\Grinding Gear Games\Path of Exile 2",
        r"C:\Program Files\Grinding Gear Games\Path of Exile 2",
    ] {
        candidates.push(PathBuf::from(base).join("logs").join("Client.txt"));
    }
    candidates.into_iter().find(|p| p.is_file())
}

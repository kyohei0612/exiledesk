//! PoB 同梱物の別配布 (pob_bundle) をアプリ無しで通す診断プローブ。
//!
//! manifest URL (既定は GitHub の pob-bundle、環境変数 EXILEDESK_POB_MANIFEST_URL で差し替え) を読み、
//! 指定ディレクトリに download → sha256 検証 → 展開 → `<dir>/pob` 入れ替えを行う。
//!
//! Usage: cd src-tauri && cargo run --example pob_bundle_probe <parent-dir>
//!   ローカル検証: data-cache/pob-bundle を http.server で配り、EXILEDESK_POB_MANIFEST_URL=http://127.0.0.1:8765/pob-bundle.local.json

use exiledesk_lib::pob_bundle::{fetch_manifest, install_from_manifest};
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let parent = PathBuf::from(std::env::args().nth(1).expect("parent dir"));
    let manifest = fetch_manifest().await.expect("manifest");
    println!(
        "manifest: PoB {} / JP {} / zip {} MB / hash {}…",
        manifest.version.clone().unwrap_or_default(),
        manifest.jp.clone().unwrap_or_default(),
        manifest.zip_size / 1_048_576,
        &manifest.content_hash[..12]
    );
    let progress = |phase: &'static str, received: u64, total: u64| {
        if phase != "download" || received % 20_000_000 < 1_000_000 || received == total {
            println!("  {phase} {} / {} MB", received / 1_048_576, total / 1_048_576);
        }
    };
    let dir = install_from_manifest(&parent, &manifest, &progress).await.expect("install");
    println!("installed → {}", dir.display());
    for f in ["Launch.lua", "Path of Building-PoE2.exe", "exiledesk-pob.json", "pob-state.json"] {
        println!("  {} {}", if dir.join(f).is_file() { "ok " } else { "NG " }, f);
    }
    println!("state: {}", std::fs::read_to_string(dir.join("pob-state.json")).unwrap_or_default());
}

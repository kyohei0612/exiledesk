//! pob_eval — ビルドの XML を同梱のヘッドレス PoB に読み込んで、Lua を 1 本走らせて結果の文字を出す (2026-09-30、確かめ用)
//!
//!   cargo run -q --example pob_eval -- build.xml script.lua [out.txt]
//!
//! オーナー「あんまり火力系に関与してないノード外したい」: ノードを 1 つずつ外した時の DPS の変化 (PoB のノードの寄与と同じ計算) を
//! 出すのに使った。Lua は build (PoB のビルド) を触れる。最後に文字を return する (JSON など)。
use exiledesk_lib::pob::PobWorker;
use std::env;
use std::path::PathBuf;

fn pob_src_dir() -> PathBuf {
    if let Ok(p) = env::var("POB_SRC") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("vendor").join("PathOfBuilding-PoE2").join("src")
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let (xml_path, lua_path) = match (args.first(), args.get(1)) {
        (Some(a), Some(b)) => (a.clone(), b.clone()),
        _ => {
            eprintln!("使い方: pob_eval build.xml script.lua [out.txt]");
            std::process::exit(2);
        }
    };
    let xml = std::fs::read_to_string(&xml_path).expect("XML を読めない");
    let lua = std::fs::read_to_string(&lua_path).expect("Lua を読めない");
    let worker = PobWorker::spawn(pob_src_dir());
    worker.load_build_xml(xml).expect("ビルドを読み込めない");
    let out = worker.eval_string(lua).unwrap_or_else(|e| format!("ERR {e}"));
    match args.get(2) {
        Some(p) => std::fs::write(p, &out).expect("書けない"),
        None => println!("{out}"),
    }
}

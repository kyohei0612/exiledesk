//! ジェムの検索条件ごとの件数を比べる診断プローブ (2026-09-19)。
//!
//! オーナー「トランスミューテーション、くそあるやん」「そのジェムで品質なし・コラプト・
//! ダブルコラプトなしで検索してみて、インスタントで」。素材の現物が 1 件しか無いのは
//! アプリの検索条件のせいか、本当に出品が無いのかを切り分ける。
//!
//! search だけを投げる (fetch はしない = 値段は見ない、件数だけ)。
//! **門番の記録はアプリの物をコピーしてから読む**ので、罰則中は送らず最低間隔も守る。
//! 書き戻しはコピー側にしか行かないので、動いているアプリの帳簿を壊さない。
//!
//! Usage: cd src-tauri && cargo run --example gem_count_probe -- "Explosive Transmutation" ["リーグ名"]
use exiledesk_lib::trade2::{trade2_search_with, SearchRequest};
use serde_json::json;

fn query(gem: &str, corrupted: Option<bool>, quality_min: Option<u32>, sockets_min: Option<u32>) -> serde_json::Value {
    let mut type_filters = json!({ "category": { "option": "gem.activegem" } });
    if let Some(q) = quality_min {
        type_filters["quality"] = json!({ "min": q });
    }
    let mut misc = json!({ "twice_corrupted": { "option": "false" } });
    if let Some(c) = corrupted {
        misc["corrupted"] = json!({ "option": if c { "true" } else { "false" } });
    }
    if let Some(s) = sockets_min {
        misc["gem_sockets"] = json!({ "min": s });
    }
    json!({
        "query": {
            "status": { "option": "securable" },
            "type": { "discriminator": null, "option": gem },
            "filters": { "type_filters": { "filters": type_filters }, "misc_filters": { "filters": misc } }
        },
        "sort": { "price": "asc" }
    })
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let mut args = std::env::args().skip(1);
    let gem = args.next().unwrap_or_else(|| "Explosive Transmutation".to_string());
    let league = args.next().unwrap_or_else(|| "Forbidden Rites".to_string());

    // アプリの門番の記録をコピーして読む (罰則・窓の数は尊重、書き戻しはコピーへ)
    if let Some(dir) = std::env::var_os("APPDATA") {
        let live = std::path::Path::new(&dir).join("com.kyohei.exiledesk").join("trade2_rate.json");
        let copy = std::env::temp_dir().join("exiledesk_probe_rate.json");
        if live.exists() {
            let _ = std::fs::copy(&live, &copy);
            exiledesk_lib::trade2::load_gates(copy);
            println!("門番の記録をコピーして読みました ({})", live.display());
        }
    }

    let cases: Vec<(&str, serde_json::Value)> = vec![
        ("オーナー指定  コラプトあり / 品質なし / 二重なし / ソケットなし", query(&gem, Some(true), None, None)),
        ("アプリ 品質23% コラプトあり / 品質 23 以上 / 二重なし / 5 ソケ", query(&gem, Some(true), Some(23), Some(5))),
        ("同上 ソケット条件だけ外す                                    ", query(&gem, Some(true), Some(23), None)),
        ("アプリ 現物   コラプトなし / 品質なし / 二重なし / ソケットなし", query(&gem, Some(false), None, None)),
    ];
    println!("\nジェム: {gem} / リーグ: {league} / status=securable (インスタントバイアウト)\n");
    for (label, q) in cases {
        match trade2_search_with(None, SearchRequest { patient: false, league: league.clone(), query: q, site: None }).await {
            Ok(v) => println!("{label} -> {} 件", v["total"].as_u64().unwrap_or(0)),
            Err(e) => println!("{label} -> 失敗: {}", e.chars().take(160).collect::<String>()),
        }
    }
}

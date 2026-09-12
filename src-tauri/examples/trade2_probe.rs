//! trade2 の search → fetch を、クラフト収支 (services/trade2/pricing.ts) と同じクエリ形で叩く診断プローブ。
//!
//! 例: サファイアの指輪 / レア / 最大ライフ 52 以上 + 雷耐性 27 以上 + 火耐性 21 以上 の最安 10 件。
//!
//! Usage: cd src-tauri && cargo run --example trade2_probe [league]

use exiledesk_lib::trade2::{trade2_fetch, trade2_search, FetchRequest, SearchRequest};
use serde_json::json;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let league = std::env::args().nth(1).unwrap_or_else(|| "Forbidden Rites".to_string());
    // trade2-stat-mapping.json から: base_maximum_life / base_lightning_damage_resistance_% / base_fire_damage_resistance_%
    let mapping: serde_json::Value =
        serde_json::from_str(include_str!("../../src/i18n/trade2-stat-mapping.json")).expect("mapping json");
    let id = |k: &str| mapping[k].as_str().unwrap_or("").to_string();
    let stats = vec![
        json!({ "id": id("base_maximum_life"), "disabled": false, "value": { "min": 52 } }),
        json!({ "id": id("base_lightning_damage_resistance_%"), "disabled": false, "value": { "min": 27 } }),
        json!({ "id": id("base_fire_damage_resistance_%"), "disabled": false, "value": { "min": 21 } }),
    ];
    println!("stat ids: {:?}", stats.iter().map(|s| s["id"].clone()).collect::<Vec<_>>());
    let query = json!({
        "query": {
            "status": { "option": "securable" },
            "type": { "discriminator": null, "option": "Sapphire Ring" },
            "stats": [{ "type": "and", "filters": stats }],
            "filters": { "type_filters": { "filters": { "rarity": { "option": "rare" } } } }
        },
        "sort": { "price": "asc" }
    });
    let search = trade2_search(SearchRequest { league: league.clone(), query, site: None })
        .await
        .expect("search");
    let total = search["total"].as_u64().unwrap_or(0);
    let qid = search["id"].as_str().unwrap_or("").to_string();
    let ids: Vec<String> = search["result"]
        .as_array()
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).take(10).collect())
        .unwrap_or_default();
    println!("search: total={} id={} first={}", total, qid, ids.len());
    if ids.is_empty() {
        return;
    }
    tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
    let fetched = trade2_fetch(FetchRequest { ids, query_id: qid, site: None }).await.expect("fetch");
    for r in fetched["result"].as_array().unwrap_or(&vec![]) {
        println!(
            "  {} {} | {} {} | ilvl {}",
            r["listing"]["price"]["amount"],
            r["listing"]["price"]["currency"],
            r["item"]["name"].as_str().unwrap_or(""),
            r["item"]["typeLine"].as_str().unwrap_or(""),
            r["item"]["ilvl"]
        );
    }
}

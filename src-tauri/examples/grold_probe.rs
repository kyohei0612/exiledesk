//! grold_probe — グロルドのアイドルが手袋にはめられるかを取引所の出品で確かめる (2026-10-03、オーナー了承の上で 1 回だけ)。
//!
//! 説明文は「手袋またはセプター」、効果のデータは「靴 / セプター」で食い違う。はめた効果はルーンの行 (rune.stat_*) として出品に載るので、
//! 手袋 / 靴 にその行がある出品の数を比べる。検索 3 本だけ (門番の間隔で送る)。
//!
//! Usage: cd src-tauri && cargo run --example grold_probe [league]
use exiledesk_lib::trade2::{trade2_search_with, SearchRequest};
use serde_json::json;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let league = std::env::args().nth(1).unwrap_or_else(|| "Forbidden Rites".to_string());
    // warcry_monster_power_+% (靴の効果) / glory_generation_+% (靴の効果の 2 行目) を、はめた物の行 (rune.) で
    let cases = [
        ("armour.gloves", "rune.stat_2663359259", "手袋 × ウォークライのパワー"),
        ("armour.boots", "rune.stat_2663359259", "靴 × ウォークライのパワー (対照)"),
        ("armour.gloves", "rune.stat_3143918757", "手袋 × 栄光の獲得"),
    ];
    for (cat, stat, label) in cases {
        let query = json!({
            "query": {
                "status": { "option": "any" },
                "stats": [{ "type": "and", "filters": [{ "id": stat, "disabled": false }] }],
                "filters": { "type_filters": { "filters": { "category": { "option": cat } } } }
            },
            "sort": { "price": "asc" }
        });
        match trade2_search_with(None, SearchRequest { patient: false, league: league.clone(), query, site: None }).await {
            Ok(v) => println!("{label}: total={} id={}", v["total"], v["id"]),
            Err(e) => println!("{label}: ERR {e}"),
        }
    }
}

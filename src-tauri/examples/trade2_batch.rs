//! trade2 の search → fetch をクエリ列で直列実行する診断プローブ (クラフト収支の相場を CLI で再現する用)。
//!
//! 入力 JSON: { "league": "...", "queries": [ { "key": "...", "attempts": [ <search body>, ... ] } ] }
//!   attempts は先頭から順に search し、total > 0 になった時点で fetch (先頭 10 件) する。
//! 出力 JSON: [ { "key", "total", "id", "error", "listings": [ { amount, currency, account, name, typeLine, ilvl } ] } ]
//!
//! Usage: cd src-tauri && cargo run --example trade2_batch <queries.json> <out.json>

use exiledesk_lib::trade2::{trade2_fetch, trade2_search, FetchRequest, SearchRequest};
use serde_json::{json, Value};
use std::time::Duration;

fn gap() -> Duration {
    Duration::from_millis(std::env::var("TRADE2_GAP_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(4500))
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let path = std::env::args().nth(1).expect("queries json path");
    let out = std::env::args().nth(2).expect("output json path");
    let input: Value = serde_json::from_str(&std::fs::read_to_string(&path).expect("read queries")).expect("parse queries");
    let league = input["league"].as_str().expect("league").to_string();
    let queries = input["queries"].as_array().expect("queries array");
    let mut results: Vec<Value> = Vec::new();

    for (i, q) in queries.iter().enumerate() {
        let key = q["key"].clone();
        let mut rec = json!({ "key": key, "total": 0, "id": null, "error": null, "listings": [] });
        let mut ids: Vec<String> = Vec::new();
        let mut qid = String::new();
        for body in q["attempts"].as_array().cloned().unwrap_or_default() {
            tokio::time::sleep(gap()).await;
            match trade2_search(SearchRequest { league: league.clone(), query: body }).await {
                Ok(s) => {
                    let total = s["total"].as_u64().unwrap_or(0);
                    rec["total"] = json!(total);
                    if total > 0 {
                        qid = s["id"].as_str().unwrap_or("").to_string();
                        rec["id"] = json!(qid);
                        ids = s["result"]
                            .as_array()
                            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).take(10).collect())
                            .unwrap_or_default();
                        break;
                    }
                }
                Err(e) => {
                    rec["error"] = json!(format!("{:?}", e));
                    break;
                }
            }
        }
        if !ids.is_empty() {
            tokio::time::sleep(gap()).await;
            match trade2_fetch(FetchRequest { ids, query_id: qid }).await {
                Ok(f) => {
                    let listings: Vec<Value> = f["result"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .map(|r| {
                                    json!({
                                        "amount": r["listing"]["price"]["amount"],
                                        "currency": r["listing"]["price"]["currency"],
                                        "account": r["listing"]["account"]["name"],
                                        "name": r["item"]["name"],
                                        "typeLine": r["item"]["typeLine"],
                                        "ilvl": r["item"]["ilvl"],
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    rec["listings"] = json!(listings);
                }
                Err(e) => rec["error"] = json!(format!("{:?}", e)),
            }
        }
        eprintln!(
            "[{}/{}] {} total={} listings={} err={}",
            i + 1,
            queries.len(),
            rec["key"],
            rec["total"],
            rec["listings"].as_array().map(|a| a.len()).unwrap_or(0),
            rec["error"]
        );
        results.push(rec);
    }
    std::fs::write(&out, serde_json::to_string_pretty(&results).unwrap()).expect("write out");
}

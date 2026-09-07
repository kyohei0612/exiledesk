//! poe.ninja パイプライン疎通プローブ (調査用、製品コードからは参照されない)
//!
//! 実行: cargo run --example ninja_probe
//!
//! index-state → build-index-state → search の 3 段を実コードで叩き、
//! どこで壊れているかを切り分ける。

use exiledesk_lib::poe_ninja_client as ninja;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let client = reqwest::Client::builder()
        .user_agent("ExileDesk/0.1.4 (POE2 craft discovery; contact: nekodori0612@gmail.com)")
        .build()
        .expect("client");
    let gate = ninja::RateGate::new(2500);

    println!("=== 1. fetch_index_state(None) ===");
    let snap = match ninja::fetch_index_state(&client, &gate, None).await {
        Ok(s) => {
            println!("  league_url    = {}", s.league_url);
            println!("  snapshot_name = {}", s.snapshot_name);
            println!("  version       = {}", s.version);
            s
        }
        Err(e) => {
            println!("  ERROR: {e}");
            return;
        }
    };

    println!("=== 2. fetch_build_index_state({}) ===", snap.league_url);
    let ascs = match ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await {
        Ok(a) => {
            for x in a.iter().take(10) {
                println!("  {:>6.2}%  {}", x.percentage, x.class);
            }
            a
        }
        Err(e) => {
            println!("  ERROR: {e}");
            return;
        }
    };

    let Some(top) = ascs.first() else {
        println!("  no ascendancies");
        return;
    };

    println!("=== 3. fetch_economy_leagues_inner() ===");
    match ninja::fetch_economy_leagues_inner(&client, &gate).await {
        Ok(ls) => {
            for l in &ls {
                println!(
                    "  {:<20} hc={:<5} ssf={:<5} {}",
                    l.url, l.is_hardcore, l.is_ssf, l.name
                );
            }
        }
        Err(e) => println!("  ERROR: {e}"),
    }

    println!("=== 4. fetch_index_state(Some(\"runesofaldur\")) — リーグ指定の追従確認 ===");
    match ninja::fetch_index_state(&client, &gate, Some("runesofaldur")).await {
        Ok(s) => {
            println!("  league_url    = {}", s.league_url);
            println!("  snapshot_name = {}", s.snapshot_name);
            println!("  version       = {}", s.version);
            if s.snapshot_name != "runes-of-aldur" {
                println!("  >>> MISMATCH: 選択リーグと snapshot がずれている <<<");
            }
        }
        Err(e) => println!("  ERROR: {e}"),
    }

    println!("=== 5. fetch_search_top_n(class={}, n=5) ===", top.class);
    match ninja::fetch_search_top_n(&client, &gate, &snap, &top.class, 5).await {
        Ok(chars) => {
            println!("  got {} character refs", chars.len());
            for c in &chars {
                println!("    account={:<24} name={}", c.account, c.name);
            }
            if chars.is_empty() {
                println!("  >>> SEARCH PARSE BROKEN (0 refs) <<<");
                return;
            }

            println!("=== 6. fetch_character (先頭 2 名) — items 抽出確認 ===");
            for c in chars.iter().take(3) {
                match ninja::fetch_character(&client, &gate, &snap, c).await {
                    Ok(ci) => {
                        let mut slots: Vec<String> = Vec::new();
                        for raw in &ci.items {
                            let inv = raw
                                .get("itemData")
                                .and_then(|d| d.get("inventoryId"))
                                .and_then(|v| v.as_str());
                            if let Some(inv) = inv {
                                let frame = raw
                                    .get("itemData")
                                    .and_then(|d| d.get("frameType"))
                                    .and_then(|v| v.as_i64())
                                    .unwrap_or(-1);
                                slots.push(format!("{inv}(f{frame})"));
                            }
                        }
                        println!(
                            "  {}/{}: items={} 抽出可={} [{}]",
                            ci.account,
                            ci.name,
                            ci.items.len(),
                            slots.len(),
                            slots.join(" ")
                        );
                        if slots.is_empty() && !ci.items.is_empty() {
                            println!("  >>> ITEM 構造変更: itemData.inventoryId が取れない <<<");
                        }
                    }
                    Err(e) => println!("  {}/{}: ERROR {e}", c.account, c.name),
                }
            }
        }
        Err(e) => println!("  ERROR: {e}"),
    }
}

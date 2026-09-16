//! 限界突破ランキングの実データ確認 (2026-09-16、調査用、製品コードからは参照されない)
//!
//! 実行: cargo run --example ninja_gem_break_probe [アセ数] [1 アセあたりの人数]
//!
//! 上位アセンダンシー × 上位キャラの character を取り、allGems の Level / [Quality] から
//! 「レベル 21 以上 / 品質 23% 以上 / 両方」で使われているスキルを数える (アプリと同じ数え方)。

use std::collections::HashMap;
use std::io::Write;

use exiledesk_lib::poe_ninja_client as ninja;

/// properties から数値を 1 つ ("Level" → 21、"[Quality]" → "+23%" の 23)
fn prop_num(props: Option<&serde_json::Value>, key: &str) -> Option<i64> {
    for p in props?.as_array()? {
        if p.get("name").and_then(|v| v.as_str()) != Some(key) {
            continue;
        }
        let raw = p
            .get("values")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())?;
        let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
        return digits.parse::<i64>().ok();
    }
    None
}

#[derive(Default, Clone)]
struct Row {
    users: u32,
    lvl21: u32,
    q23: u32,
    both: u32,
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let asc_n: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(3);
    let per_asc: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(30);

    let client = reqwest::Client::builder()
        .user_agent("ExileDesk/0.1 (POE2 craft discovery; contact: nekodori0612@gmail.com)")
        .build()
        .expect("client");
    let gate = ninja::RateGate::new(1200);

    let snap = ninja::fetch_index_state(&client, &gate, None).await.expect("index-state");
    let ascs = ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await.expect("build-index-state");
    println!("league={} snapshot={}", snap.league_url, snap.snapshot_name);

    let mut table: HashMap<String, Row> = HashMap::new();
    let mut chars_done = 0usize;
    for asc in ascs.iter().take(asc_n) {
        let refs = match ninja::fetch_search_top_n(&client, &gate, &snap, &asc.class, per_asc).await {
            Ok(r) => r,
            Err(e) => {
                println!("  search {} ERROR: {e}", asc.class);
                continue;
            }
        };
        println!("== {} ({:.1}%) {} 人", asc.class, asc.percentage, refs.len());
        let _ = std::io::stdout().flush();
        for r in refs {
            let ci = match ninja::fetch_character(&client, &gate, &snap, &r).await {
                Ok(c) => c,
                Err(e) => {
                    println!("  character {} ERROR: {e}", r.name);
                    continue;
                }
            };
            chars_done += 1;
            if chars_done % 5 == 0 {
                print!("  {chars_done} 人
");
                let _ = std::io::stdout().flush();
            }
            // 同じキャラで同じスキルは 1 回だけ
            let (mut seen, mut seen_l, mut seen_q, mut seen_b) = (
                std::collections::HashSet::new(),
                std::collections::HashSet::new(),
                std::collections::HashSet::new(),
                std::collections::HashSet::new(),
            );
            for g in &ci.skills {
                let Some(gems) = g.get("allGems").and_then(|v| v.as_array()) else { continue };
                for gem in gems {
                    let Some(name) = gem.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else { continue };
                    let item = gem.get("itemData");
                    if item.and_then(|d| d.get("support")).and_then(|v| v.as_bool()).unwrap_or(false) {
                        continue;
                    }
                    let props = item.and_then(|d| d.get("properties"));
                    let lvl = prop_num(props, "Level").unwrap_or(0);
                    let q = prop_num(props, "[Quality]").unwrap_or(0);
                    let row = table.entry(name.to_string()).or_default();
                    if seen.insert(name.to_string()) {
                        row.users += 1;
                    }
                    if lvl >= 21 && seen_l.insert(name.to_string()) {
                        row.lvl21 += 1;
                    }
                    if q >= 23 && seen_q.insert(name.to_string()) {
                        row.q23 += 1;
                    }
                    if lvl >= 21 && q >= 23 && seen_b.insert(name.to_string()) {
                        row.both += 1;
                    }
                }
            }
        }
    }

    println!("\n取得キャラ {chars_done} 人 / スキル {} 種\n", table.len());
    let mut rows: Vec<(String, Row)> = table.into_iter().collect();
    for (label, key) in [("レベル 21 以上", 0), ("品質 23% 以上", 1), ("両方 (限界突破)", 2)] {
        rows.sort_by(|a, b| {
            let (x, y) = match key {
                0 => (a.1.lvl21, b.1.lvl21),
                1 => (a.1.q23, b.1.q23),
                _ => (a.1.both, b.1.both),
            };
            y.cmp(&x).then_with(|| b.1.users.cmp(&a.1.users))
        });
        println!("== {label}");
        for (name, r) in rows.iter().take(15) {
            let v = match key {
                0 => r.lvl21,
                1 => r.q23,
                _ => r.both,
            };
            if v == 0 {
                break;
            }
            println!("  {v:>3} / {:>3} 人 ({:>3.0}%)  {name}", r.users, v as f64 / r.users.max(1) as f64 * 100.0);
        }
        println!();
    }
}

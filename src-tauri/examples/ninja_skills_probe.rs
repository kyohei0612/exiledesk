//! poe.ninja のスキル使用率プローブ (2026-09-14、調査用、製品コードからは参照されない)
//!
//! 実行: cargo run --example ninja_skills_probe [クラス名] [JSON の出力先]
//!
//! index-state → build-index-state → search (1 クラス) → 辞書 の 4 回だけ叩き、
//! Main Skills / Spirit Skills / All Skills の上位を poe.ninja の画面と同じ % で出す。

use exiledesk_lib::poe_ninja_client as ninja;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let client = reqwest::Client::builder()
        .user_agent("ExileDesk/0.1.4 (POE2 craft discovery; contact: nekodori0612@gmail.com)")
        .build()
        .expect("client");
    let gate = ninja::RateGate::new(2500);

    let snap = match ninja::fetch_index_state(&client, &gate, None).await {
        Ok(s) => s,
        Err(e) => {
            println!("index-state ERROR: {e}");
            return;
        }
    };
    let class = match args.get(1) {
        Some(c) => c.clone(),
        None => match ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await {
            Ok(a) => a.first().map(|x| x.class.clone()).unwrap_or_default(),
            Err(e) => {
                println!("build-index-state ERROR: {e}");
                return;
            }
        },
    };
    println!("league={} snapshot={} version={} class={}", snap.league_url, snap.snapshot_name, snap.version, class);

    match ninja::fetch_skill_stats_for_class(&client, &gate, &snap, &class).await {
        Ok(Some(stats)) => {
            println!("total characters = {}", stats.total);
            for (label, list) in [("Main Skills", &stats.main), ("Spirit Skills", &stats.spirit), ("All Skills", &stats.all)] {
                println!("== {label} ({} 種)", list.len());
                for g in list.iter().take(10) {
                    println!("  {:>5.1}%  {:>6}  {}", g.count as f64 / stats.total.max(1) as f64 * 100.0, g.count, g.name);
                }
            }
            if let Some(path) = args.get(2) {
                let json = serde_json::json!({ "class": class, "skill_stats": stats });
                std::fs::write(path, serde_json::to_string(&json).expect("json")).expect("write");
                println!("wrote {path}");
            }
        }
        Ok(None) => println!("集計 (skills / spiritgems / allskills) が search に無い"),
        Err(e) => println!("ERROR: {e}"),
    }
}

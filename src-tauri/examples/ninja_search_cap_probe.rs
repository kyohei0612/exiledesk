//! search が何件まで返すかの確認 (2026-09-16、調査用)
//! 実行: cargo run --example ninja_search_cap_probe [クラス名]

use exiledesk_lib::poe_ninja_client as ninja;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let client = reqwest::Client::builder()
        .user_agent("ExileDesk/0.1 (POE2 research; contact nekodori0612@gmail.com)")
        .build()
        .expect("client");
    let gate = ninja::RateGate::new(1500);
    let snap = ninja::fetch_index_state(&client, &gate, None).await.expect("index-state");
    let class = match args.get(1) {
        Some(c) => c.clone(),
        None => ninja::fetch_build_index_state(&client, &gate, &snap.league_url)
            .await
            .expect("build-index-state")
            .first()
            .map(|a| a.class.clone())
            .unwrap_or_default(),
    };
    // 上限より十分大きい n を渡して、実際に何件返るか見る
    let refs = ninja::fetch_search_top_n(&client, &gate, &snap, &class, 100_000).await.expect("search");
    println!("class={class} returned={} 件", refs.len());
    if let (Some(f), Some(l)) = (refs.first(), refs.last()) {
        println!("先頭: {} / {}", f.account, f.name);
        println!("末尾: {} / {}", l.account, l.name);
    }
}

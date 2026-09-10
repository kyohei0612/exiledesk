//! ゲームログ診断 (client_log) をアプリ無しで実行する診断プローブ。
//!
//! Usage: cd src-tauri && cargo run --example client_log_probe [scan_mb]
//!   パスは環境変数 EXILEDESK_CLIENT_LOG で上書きできる。

use exiledesk_lib::client_log::{diagnose, find_client_log};

fn main() {
    let mb: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(64);
    let path = find_client_log().expect("Client.txt が見つかりません");
    println!("path: {}", path.display());
    let t = std::time::Instant::now();
    let d = diagnose(&path, mb).expect("diagnose");
    println!(
        "scanned {} MB / {} MB, {} 行, {:.2} 秒",
        d.scanned_bytes / 1_048_576,
        d.size_bytes / 1_048_576,
        d.lines,
        t.elapsed().as_secs_f64()
    );
    println!("期間: {:?} 〜 {:?}", d.first_ts, d.last_ts);
    println!("CRIT {} / WARN {} / INFO {} / DEBUG {}", d.crit, d.warn, d.info, d.debug);

    println!("\n=== 実害あり / 注意 ({}) ===", d.findings.len());
    for f in &d.findings {
        println!("[{:?}] {} — {} 件", f.severity, f.title, f.count);
        if let Some(a) = &f.advice {
            println!("    → {a}");
        }
        let tail: Vec<String> = f.daily.iter().rev().take(5).map(|x| format!("{} {}", &x.date[5..], x.count)).collect();
        if !tail.is_empty() {
            println!("    日別(新しい順): {}", tail.join(" / "));
        }
    }
    println!("\n=== 既知の無害 ({}) ===", d.noise.len());
    for f in &d.noise {
        println!("  {:>8} 件  {}", f.count, f.title);
    }
    println!("\n=== 未分類 ({}) ===", d.unknown.len());
    for u in &d.unknown {
        println!("  {:>8} 件  {}", u.count, u.text);
    }
}

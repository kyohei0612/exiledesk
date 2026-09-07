//! health_check_all() をコマンドラインから実行する調査用プローブ。
//!
//! 実行: cargo run --example health_probe

use exiledesk_lib::health_check;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    match health_check::health_check_all().await {
        Ok(r) => {
            println!("poe_ninja_schema_ok = {}", r.poe_ninja_schema_ok);
            println!("poe2db_html_ok      = {}", r.poe2db_html_ok);
            println!("trade2_api_ok       = {}", r.trade2_api_ok);
            println!("unknown inv ids     = {}", r.unknown_inventory_ids_count);
            if r.warnings.is_empty() {
                println!("warnings: (none)");
            } else {
                println!("warnings:");
                for w in &r.warnings {
                    println!("  - {w}");
                }
            }
        }
        Err(e) => println!("health_check_all ERROR: {e}"),
    }
}

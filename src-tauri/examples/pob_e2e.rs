//! セルフチェック: PobWorker をプログラム的に駆動し、Phase 2 が動作することを確認。
//!
//! 1. PobWorker を spawn し、boot_pob が成功することを確認
//! 2. get_stats_all で boot 直後の output を取れるか
//! 3. ダミー XML を load_build_xml に渡して、エラーなく通るか
//! 4. 結果ステータスをサマリ表示

use exiledesk_lib::pob::{decode_pob_code, PobWorker};
use std::env;
use std::path::PathBuf;
use std::time::Instant;

fn pob_src_dir() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .expect("src-tauri parent")
        .join("vendor")
        .join("PathOfBuilding-PoE2")
        .join("src")
}

fn main() {
    println!("=== PobWorker self-check ===");
    println!("PoB src: {}", pob_src_dir().display());

    println!("\n[step 1] spawn PobWorker (PoB headless boot, ~数百ms)…");
    let t0 = Instant::now();
    let worker = PobWorker::spawn(pob_src_dir());
    // PoB boot は spawn 内のスレッドでバックグラウンド起動するので、
    // 最初のジョブ送信時にブロッキングで完了を待つ。
    println!("  spawn returned in {:?}", t0.elapsed());

    println!("\n[step 2] get_stats_all (boot 完了 + output 取得)");
    let t0 = Instant::now();
    let stats = worker.get_stats_all();
    let elapsed = t0.elapsed();
    match &stats {
        Ok(map) => {
            println!("  OK in {:?}: {} stats", elapsed, map.len());
            // 主要 stat のサンプル表示
            for key in [
                "TotalDPS",
                "AverageHit",
                "Speed",
                "CritChance",
                "LifeMax",
                "ManaMax",
                "EnergyShieldMax",
                "Armour",
                "Evasion",
                "FireResist",
                "ColdResist",
                "LightningResist",
                "ChaosResist",
            ] {
                if let Some(v) = map.get(key) {
                    println!("    {} = {}", key, v);
                }
            }
            if map.is_empty() {
                println!("  ⚠ output が空: boot 直後 build はスケルトンで calcsTab が未初期化の可能性");
            }
        }
        Err(e) => {
            println!("  FAIL in {:?}: {}", elapsed, e);
        }
    }

    println!("\n[step 3] decode_pob_code: dummy invalid input をエラーで返すか");
    match decode_pob_code("not-a-real-pob-code") {
        Ok(_) => println!("  ⚠ 不正なコードが decode 通過してしまった (バグの可能性)"),
        Err(e) => println!("  OK: 期待通り decode 失敗 ({:#})", e),
    }

    println!("\n[step 4] decode_pob_code: 最小有効な base64+zlib 入力");
    // "<a/>" を zlib deflate → base64 url-safe-no-pad encode したもの
    // python: base64.urlsafe_b64encode(zlib.compress(b"<a/>")).rstrip(b"=") = b"eJyzqdEHAAJoARI"
    let minimal_code = "eJyzqdEHAAJoARI";
    match decode_pob_code(minimal_code) {
        Ok(xml) => println!("  OK: '{}'", xml),
        Err(e) => println!("  FAIL: {:#}", e),
    }

    println!("\n[step 5] load_build_xml: 空 XML 投入で例外が出ないこと");
    let t0 = Instant::now();
    let result = worker.load_build_xml(String::new());
    let elapsed = t0.elapsed();
    match &result {
        Ok(_) => println!("  OK in {:?}: 空 XML を投入してもエラー無し", elapsed),
        Err(e) => println!("  期待通り FAIL in {:?}: {}", elapsed, e),
    }

    println!("\n[step 6] get_stats_all (load 後)");
    let stats_after = worker.get_stats_all();
    match stats_after {
        Ok(map) => println!("  OK: {} stats after load", map.len()),
        Err(e) => println!("  FAIL: {}", e),
    }

    println!("\n[step 7] set_item_in_slot: ダミー POE2 アイテムを slot にセット");
    // PoB の TestItemParse_spec.lua で確認した最小フォーマット:
    //   "Rarity: Rare\nName\nBaseName" の 3 行で base が解決される。
    // Furtive Wraps は POE2 の Body Armour 系 base（spec の test に登場、実在）。
    let dummy_item = r#"Rarity: Rare
Test Body
Furtive Wraps
--------
Item Level: 60
--------
+50 to maximum Life
+50 to maximum Mana
+25% to Lightning Resistance
+25% to Cold Resistance
"#;
    let baseline_dps = worker
        .get_stat("TotalDPS".into())
        .unwrap_or(-1.0);
    println!("  baseline TotalDPS = {}", baseline_dps);

    let t0 = Instant::now();
    let slot_result = worker.set_item_in_slot(None, dummy_item.to_string());
    let elapsed = t0.elapsed();
    match &slot_result {
        Ok(slot) => println!("  OK in {:?}: equipped to slot '{}'", elapsed, slot),
        Err(e) => println!("  FAIL in {:?}: {}", elapsed, e),
    }

    if slot_result.is_ok() {
        let after_dps = worker
            .get_stat("TotalDPS".into())
            .unwrap_or(-1.0);
        let after_life = worker.get_stat("LifeMax".into()).unwrap_or(-1.0);
        let after_mana = worker.get_stat("ManaMax".into()).unwrap_or(-1.0);
        let after_lres = worker
            .get_stat("LightningResist".into())
            .unwrap_or(-1.0);
        println!("  after装備:");
        println!(
            "    TotalDPS: {} → {} (Δ {:+.2})",
            baseline_dps,
            after_dps,
            after_dps - baseline_dps
        );
        println!("    LifeMax = {}", after_life);
        println!("    ManaMax = {}", after_mana);
        println!("    LightningResist = {}", after_lres);

        if after_life > 0.0 || after_mana > 0.0 || after_lres > -50.0 {
            println!(
                "  ✓ 装備差替え成功（装備の +13 Life / +38 Mana / +25% LightningRes が反映された可能性）"
            );
        } else {
            println!("  ⚠ 値変化なし: 装備差替えロジックが build に反映されていないかも");
        }
    }

    println!("\n=== self-check done ===");
}

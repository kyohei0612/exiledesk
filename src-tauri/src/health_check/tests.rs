//! ユニットテスト
//!
//! health_check.rs (714 行) から機械分割 (2026-09-07 R3)。

use super::*;

#[test]
fn unknown_inv_id_counter_increments() {
    let before = UNKNOWN_INV_ID_COUNT.load(Ordering::Relaxed);
    record_unknown_inventory_id("MysterySlot", 2);
    record_unknown_inventory_id("MysterySlot2", -1);
    let after = UNKNOWN_INV_ID_COUNT.load(Ordering::Relaxed);
    assert!(after >= before + 2);
}

#[test]
fn health_check_result_serializes() {
    let r = HealthCheckResult {
        poe_ninja_schema_ok: true,
        poe2db_html_ok: false,
        trade2_api_ok: true,
        unknown_inventory_ids_count: 3,
        unknown_inventory_id_samples: vec![UnknownInvIdSample {
            inventory_id: "Belt".to_string(),
            count: 2,
        }],
        warnings: vec!["poe2db html: HTTP 503".to_string()],
    };
    let s = serde_json::to_string(&r).unwrap();
    assert!(s.contains("\"poe_ninja_schema_ok\":true"));
    assert!(s.contains("\"poe2db_html_ok\":false"));
    assert!(s.contains("\"unknown_inventory_ids_count\":3"));
    assert!(s.contains("\"inventory_id\":\"Belt\""));
    assert!(s.contains("\"count\":2"));
    assert!(s.contains("HTTP 503"));
}

/// Phase ο-C: サンプル収集が「同じ inv_id を複数回 push したら count が増える」
/// + 「上位 N 件が count 降順で並ぶ」ことを確認する。
#[test]
fn unknown_inv_id_samples_aggregate_by_count() {
    // 先行テストの影響を消すため、明示リセット。
    reset_unknown_inventory_id_samples();

    // Belt を 3 回、Flask を 1 回、Charm を 2 回 push。
    record_unknown_inventory_id("Belt", 2);
    record_unknown_inventory_id("Belt", 2);
    record_unknown_inventory_id("Belt", 2);
    record_unknown_inventory_id("Flask", 0);
    record_unknown_inventory_id("Charm", 2);
    record_unknown_inventory_id("Charm", 2);

    let samples = top_unknown_inventory_id_samples();
    assert_eq!(samples.len(), 3);
    // count 降順: Belt(3) → Charm(2) → Flask(1)
    assert_eq!(samples[0].0, "Belt");
    assert_eq!(samples[0].1, 3);
    assert_eq!(samples[1].0, "Charm");
    assert_eq!(samples[1].1, 2);
    assert_eq!(samples[2].0, "Flask");
    assert_eq!(samples[2].1, 1);

    // 後続テストに影響しないよう片付け。
    reset_unknown_inventory_id_samples();
}

/// Phase ο-C: 旧 (`<h1>`) 構造の HTML だけでも OK、新 (`itemHeader` + `lc`)
/// 構造の HTML だけでも OK、両方欠落かつ itemName も無い場合は NG、
/// という多パターン許容の挙動を確認する。
///
/// 注: `check_poe2db_html` は HTTP 引いてしまうため、ここでは検証ロジックを
/// インライン化したヘルパー `validate_poe2db_html_struct` でユニットテスト。
#[test]
fn poe2db_html_struct_validator_accepts_old_and_new_layouts() {
    let old_layout = "<html><body><h1>X</h1>\
        <div class=\"itemName\">Atziri</div></body></html>";
    let new_layout = "<html><body>\
        <h3 style='display: none'>X</h3>\
        <div class=\"itemHeader doubleLine\">\
          <div class=\"itemName\"><span class=\"lc\">X</span></div>\
        </div></body></html>";
    let broken = "<html><body><p>nothing</p></body></html>";

    assert!(validate_poe2db_html_struct(old_layout).is_ok());
    assert!(validate_poe2db_html_struct(new_layout).is_ok());
    assert!(validate_poe2db_html_struct(broken).is_err());
}

/// `check_poe2db_html` の HTML 部分だけを抽出したテスト用バリデータ。
/// 本体ロジックの変更時にこっちも更新すること (DRY のため本体からも参照可能)。
fn validate_poe2db_html_struct(html: &str) -> Result<(), String> {
    let has_item_name = html.contains("class=\"itemName\"")
        || html.contains("class='itemName'");
    if !has_item_name {
        return Err("itemName missing".to_string());
    }
    let has_h1 = html.contains("<h1");
    let has_hidden_h3 =
        html.contains("<h3") && html.contains("display: none");
    let has_item_header = html.contains("class=\"itemHeader")
        || html.contains("class='itemHeader");
    let has_lc_span =
        html.contains("class=\"lc\"") || html.contains("class='lc'");
    if !(has_h1 || has_hidden_h3 || has_item_header || has_lc_span) {
        return Err("header missing".to_string());
    }
    Ok(())
}

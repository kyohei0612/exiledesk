//! ユニットテスト (オフライン: パーサ / バリデーションのみ)
//!
//! poe_ninja_client.rs から機械分割 (2026-09-07 R3)。

use super::*;

#[test]
fn varint_roundtrip() {
    // 150 = 0x96 0x01 (varint encoded)
    let buf = [0x96u8, 0x01];
    let (v, next) = read_varint(&buf, 0).unwrap();
    assert_eq!(v, 150);
    assert_eq!(next, 2);
}

#[test]
fn varint_zero() {
    let buf = [0u8];
    let (v, next) = read_varint(&buf, 0).unwrap();
    assert_eq!(v, 0);
    assert_eq!(next, 1);
}

#[test]
fn valid_account_examples() {
    assert!(is_valid_account("AsmodeusPOE-0579"));
    assert!(is_valid_account("dekkakza-4456"));
    assert!(is_valid_account("a9_-1234"));
    // 2026-09-07: 非 ASCII アカウント名も通す (中国語 / 韓国語圏の上位プレイヤー)
    assert!(is_valid_account("我的的的发-4378"));
    assert!(is_valid_account("썽아티비-1234"));
    assert!(is_valid_account("foo.bar-1234")); // ドットも許容 (ゴミ混入は構造パースで排除済み)
    assert!(!is_valid_account("AsmodeusPOE")); // discriminator なし
    assert!(!is_valid_account("a-12345")); // 5 桁
    assert!(!is_valid_account("-1234")); // 先頭空
}

#[test]
fn url_encode_basic() {
    assert_eq!(url_encode("Blood Mage"), "Blood%20Mage");
    assert_eq!(url_encode("vaal"), "vaal");
    assert_eq!(url_encode("fate-of-the-vaal"), "fate-of-the-vaal");
}

/// protobuf の length-delimited フィールドを 1 バイト長で組み立てるテストヘルパ。
/// (len < 128 前提なので varint は 1 バイトで済む)
fn pb_bytes(field_no: u8, payload: &[u8]) -> Vec<u8> {
    let mut out = vec![(field_no << 3) | 2, payload.len() as u8];
    out.extend_from_slice(payload);
    out
}

/// カラム message 1 本を組み立てる: f1 = ID, f7 = 値の繰り返し。
fn pb_column(id: &str, values: &[&str]) -> Vec<u8> {
    let mut out = pb_bytes(1, id.as_bytes());
    for v in values {
        out.extend_from_slice(&pb_bytes(7, v.as_bytes()));
    }
    out
}

/// `f1 { f12: Column, f12: Column }` を組んで name/account が引けることを確認。
/// 2026-09 の poe.ninja search レスポンス構造を最小再現したもの。
#[test]
fn extract_search_columns_pulls_name_and_account() {
    let name_col = pb_column("name", &["LonoE", "CoconutTvT"]);
    let account_col = pb_column("account", &["Mchen-2808", "kimhs6692-1387"]);

    let mut root = Vec::new();
    root.extend_from_slice(&pb_bytes(12, &name_col));
    root.extend_from_slice(&pb_bytes(12, &account_col));
    let payload = pb_bytes(1, &root);

    let cols = extract_search_columns(&payload);
    assert_eq!(
        cols.get("name").map(Vec::as_slice),
        Some(["LonoE".to_string(), "CoconutTvT".to_string()].as_slice())
    );
    assert_eq!(
        cols.get("account").map(Vec::as_slice),
        Some(["Mchen-2808".to_string(), "kimhs6692-1387".to_string()].as_slice())
    );
}

/// ルートの入れ子が 1 段深くなっても拾えること (構造変更への耐性)。
#[test]
fn extract_search_columns_survives_extra_nesting() {
    let col = pb_column("name", &["Alpha"]);
    let inner = pb_bytes(12, &col);
    let mid = pb_bytes(3, &inner);
    let payload = pb_bytes(1, &mid);

    let cols = extract_search_columns(&payload);
    assert_eq!(
        cols.get("name").map(Vec::as_slice),
        Some(["Alpha".to_string()].as_slice())
    );
}

/// 値を持たない message はカラムとして扱わない (誤検出防止)。
#[test]
fn parse_search_column_rejects_valueless_message() {
    let only_id = pb_bytes(1, b"name");
    assert!(parse_search_column(&only_id).is_none());
}

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

/// varint フィールド (1 バイトで収まる値だけ) を組み立てるテストヘルパ。
fn pb_varint_small(field_no: u8, v: u8) -> Vec<u8> {
    assert!(v < 128);
    vec![field_no << 3, v]
}

/// 2026-09-14: search の集計 (dimension) と辞書参照が読めること。キー 0 の省略と人数 0 の除外も確認。
#[test]
fn parse_search_summary_reads_dimensions_and_dictionaries() {
    let mut e1 = pb_varint_small(1, 2);
    e1.extend(pb_varint_small(2, 30));
    let e2 = pb_varint_small(2, 10); // キー 0 は省略される
    let e3 = pb_varint_small(1, 5); // 人数 0 は捨てる
    let mut dim = pb_bytes(1, b"skills");
    dim.extend(pb_bytes(2, b"gem"));
    dim.extend(pb_bytes(3, &e1));
    dim.extend(pb_bytes(3, &e2));
    dim.extend(pb_bytes(3, &e3));
    let mut dref = pb_bytes(1, b"gem");
    dref.extend(pb_bytes(2, b"abc"));
    let mut root = pb_varint_small(1, 100);
    root.extend(pb_bytes(2, &dim));
    root.extend(pb_bytes(6, &dref));
    let payload = pb_bytes(1, &root);

    let s = parse_search_summary(&payload);
    assert_eq!(s.total, 100);
    assert_eq!(s.dimensions.len(), 1);
    assert_eq!(s.dimensions[0].id, "skills");
    assert_eq!(s.dimensions[0].dictionary, "gem");
    assert_eq!(s.dimensions[0].counts, vec![(2, 30), (0, 10)]);
    assert_eq!(s.dictionaries.get("gem").map(String::as_str), Some("abc"));
}

/// NDIC v2 を組み立てる (実機と同じ並び: ヘッダ 36 バイト → チェックポイント → 長さ u8 → 連結した名前)
fn ndic(names: &[&str], checkpoints: u32) -> Vec<u8> {
    let mut out = b"NDIC".to_vec();
    for v in [2u32, 0, names.len() as u32] {
        out.extend(v.to_le_bytes());
    }
    out.extend([0u8; 8]);
    for v in [16u32, checkpoints, names.len() as u32] {
        out.extend(v.to_le_bytes());
    }
    for _ in 0..checkpoints {
        out.extend([0u8; 8]);
    }
    for n in names {
        out.push(n.len() as u8);
    }
    for n in names {
        out.extend(n.as_bytes());
    }
    out
}

#[test]
fn decode_ninja_dictionary_reads_names_in_key_order() {
    let buf = ndic(&["Abiding Hex", "Frost Bomb", "Zenith II"], 2);
    assert_eq!(decode_ninja_dictionary(&buf).unwrap(), vec!["Abiding Hex", "Frost Bomb", "Zenith II"]);
    assert!(decode_ninja_dictionary(b"NOPE").is_none());
    let mut broken = buf.clone();
    broken.truncate(buf.len() - 3);
    assert!(decode_ninja_dictionary(&broken).is_none());
}

#[test]
fn build_skill_stats_sorts_by_count_and_skips_unknown_keys() {
    let summary = SearchSummary {
        total: 50,
        dimensions: vec![SearchDimension { id: "skills".into(), dictionary: "gem".into(), counts: vec![(0, 5), (2, 20), (9, 99)] }],
        dictionaries: HashMap::new(),
    };
    let mut dicts = HashMap::new();
    dicts.insert("gem".to_string(), Arc::new(vec!["A".to_string(), "B".to_string(), "C".to_string()]));
    let s = build_skill_stats(&summary, &dicts);
    assert_eq!(s.total, 50);
    let main: Vec<(String, u64)> = s.main.iter().map(|g| (g.name.clone(), g.count)).collect();
    assert_eq!(main, vec![("C".to_string(), 20), ("A".to_string(), 5)]);
    assert!(s.spirit.is_empty());
    assert!(s.all.is_empty());
}

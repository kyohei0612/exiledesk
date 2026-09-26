//! poe_ninja_client/protobuf/summary.rs — search レスポンスの集計 (dimension) と poe.ninja の辞書 (NDIC) の読み取り
//!
//! protobuf.rs から分割 (2026-09-26)。
use super::*;

// ============================================================================
// search レスポンスの集計 (dimension) と辞書 (2026-09-14)
// ============================================================================

/// search レスポンスの集計 1 本: そのクラスの全キャラのうち、そのキーを持つ人数。
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct SearchDimension {
    /// "skills" / "spiritgems" / "allskills" / "items" / "class" …
    pub id: String,
    /// 辞書 ID ("gem" / "item" / "class" …)
    pub dictionary: String,
    /// (辞書のキー = 名前配列の添字, 人数)。人数 0 は捨てる
    pub counts: Vec<(u32, u64)>,
}

/// search レスポンスのうち、キャラ一覧以外の集計部分。
#[derive(Debug, Clone, Default)]
pub(crate) struct SearchSummary {
    /// そのクラスの全キャラ数 (poe.ninja の "Found N characters")
    pub total: u64,
    pub dimensions: Vec<SearchDimension>,
    /// 辞書 ID → ハッシュ (`/poe2/api/builds/dictionary/{hash}`)
    pub dictionaries: HashMap<String, String>,
}

/// search レスポンスから集計部分を読む。
///
/// 実機構造 (2026-09-13 確認、Forbidden Rites):
/// ```text
/// f1 {
///   f1 : varint                          // 総数
///   f2 : Dimension {                     // "class" / "items" / "skills" / "spiritgems" / "allskills" …
///     f1: string = ID
///     f2: string = 辞書 ID ("gem" 等)
///     f3: { f1: varint キー (0 は省略), f2: varint 人数 } × N
///   } × 9
///   f6 : { f1: string 辞書 ID, f2: string ハッシュ, f3: string 別ハッシュ } × 7
///   f12: Column (キャラ一覧、extract_search_columns が読む)
/// }
/// ```
/// poe.ninja の画面 (Main Skills / Spirit Skills / All Skills) の % は 人数 ÷ 総数 と一致した。
pub(crate) fn parse_search_summary(buf: &[u8]) -> SearchSummary {
    let mut out = SearchSummary::default();
    let root = PbReader::new(buf).find_map(|(f, v)| match (f, v) {
        (1, PbValue::Bytes(b)) => Some(b),
        _ => None,
    });
    let Some(root) = root else {
        return out;
    };
    for (field_no, value) in PbReader::new(root) {
        match (field_no, value) {
            (1, PbValue::Varint(n)) => out.total = n,
            (2, PbValue::Bytes(b)) => {
                if let Some(d) = parse_search_dimension(b) {
                    out.dimensions.push(d);
                }
            }
            (6, PbValue::Bytes(b)) => {
                let mut id: Option<String> = None;
                let mut hash: Option<String> = None;
                for (f, v) in PbReader::new(b) {
                    match (f, v) {
                        (1, PbValue::Bytes(x)) if id.is_none() => id = std::str::from_utf8(x).ok().map(str::to_string),
                        (2, PbValue::Bytes(x)) if hash.is_none() => hash = std::str::from_utf8(x).ok().map(str::to_string),
                        _ => {}
                    }
                }
                if let (Some(id), Some(hash)) = (id, hash) {
                    out.dictionaries.insert(id, hash);
                }
            }
            _ => {}
        }
    }
    out
}

fn parse_search_dimension(buf: &[u8]) -> Option<SearchDimension> {
    let mut id: Option<String> = None;
    let mut dictionary = String::new();
    let mut counts: Vec<(u32, u64)> = Vec::new();
    for (field_no, value) in PbReader::new(buf) {
        match (field_no, value) {
            (1, PbValue::Bytes(b)) if id.is_none() => id = std::str::from_utf8(b).ok().map(str::to_string),
            (2, PbValue::Bytes(b)) => dictionary = std::str::from_utf8(b).map(str::to_string).unwrap_or_default(),
            (3, PbValue::Bytes(b)) => {
                let mut key = 0u64;
                let mut count = 0u64;
                for (f, v) in PbReader::new(b) {
                    match (f, v) {
                        (1, PbValue::Varint(n)) => key = n,
                        (2, PbValue::Varint(n)) => count = n,
                        _ => {}
                    }
                }
                if count > 0 && key <= u32::MAX as u64 {
                    counts.push((key as u32, count));
                }
            }
            _ => {}
        }
    }
    Some(SearchDimension { id: id?, dictionary, counts })
}

/// poe.ninja の辞書 (`/poe2/api/builds/dictionary/{hash}`) を名前の配列にする。キー = 配列の添字。
///
/// 実機の形式 (2026-09-13、"NDIC" v2、gem 辞書 1,258 件で末尾まで一致を確認):
/// ```text
///  0: "NDIC"   4: version u32   8: 0 u32   12: 件数 u32   16: ハッシュ 8 バイト
/// 24: 刻み u32 (16)   28: チェックポイント数 u32   32: 件数 u32
/// 36: チェックポイント (u32, u32) × チェックポイント数
///     名前の長さ u8 × 件数 → 名前の UTF-8 を区切り無しで連結 (アルファベット順)
/// ```
pub(crate) fn decode_ninja_dictionary(buf: &[u8]) -> Option<Vec<String>> {
    if buf.len() < 36 || &buf[0..4] != b"NDIC" {
        return None;
    }
    let u32_at = |o: usize| -> usize { u32::from_le_bytes([buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]) as usize };
    let count = u32_at(12);
    let checkpoints = u32_at(28);
    let lens_start = checkpoints.checked_mul(8)?.checked_add(36)?;
    let mut off = lens_start.checked_add(count)?;
    if off > buf.len() {
        return None;
    }
    let mut names = Vec::with_capacity(count);
    for i in 0..count {
        let len = buf[lens_start + i] as usize;
        let end = off.checked_add(len)?;
        if end > buf.len() {
            return None;
        }
        names.push(String::from_utf8_lossy(&buf[off..end]).into_owned());
        off = end;
    }
    Some(names)
}

//! protobuf wire format パーサ (search レスポンスのカラム抽出)
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// protobuf wire format パーサ (search レスポンスのカラム抽出)
// ============================================================================

/// protobuf の 1 フィールド分の値。
///
/// varint / fixed64 / fixed32 は search のカラム抽出では使わないので、
/// 長さだけ読み飛ばせれば十分 (`Skipped`)。
#[derive(Debug)]
pub(crate) enum PbValue<'a> {
    /// length-delimited (wire type 2): string / bytes / ネストした message
    Bytes(&'a [u8]),
    /// varint (search の総数 / 集計の人数に使う)
    Varint(u64),
    /// fixed64 / fixed32 (読み飛ばし対象)
    Skipped,
}

/// protobuf message を「フィールド番号 + 値」の並びとして順に読むイテレータ。
///
/// スキーマ (.proto) を持たないので、必要なフィールド番号だけを見て
/// 残りは wire type に従って読み飛ばす。壊れたバイト列に当たったら
/// `None` を返してそこで打ち切る (panic しない)。
pub(crate) struct PbReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> PbReader<'a> {
    pub(crate) fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }
}

impl<'a> Iterator for PbReader<'a> {
    type Item = (i32, PbValue<'a>);

    fn next(&mut self) -> Option<Self::Item> {
        if self.pos >= self.buf.len() {
            return None;
        }
        let (tag, next) = read_varint(self.buf, self.pos)?;
        let wire_type = (tag & 0x7) as u8;
        let field_no = (tag >> 3) as i32;
        self.pos = next;

        match wire_type {
            // varint
            0 => {
                let (v, ni) = read_varint(self.buf, self.pos)?;
                self.pos = ni;
                Some((field_no, PbValue::Varint(v)))
            }
            // fixed64
            1 => {
                if self.pos + 8 > self.buf.len() {
                    return None;
                }
                self.pos += 8;
                Some((field_no, PbValue::Skipped))
            }
            // length-delimited
            2 => {
                let (len, ni) = read_varint(self.buf, self.pos)?;
                let len = len as usize;
                if ni + len > self.buf.len() {
                    return None;
                }
                let slice = &self.buf[ni..ni + len];
                self.pos = ni + len;
                Some((field_no, PbValue::Bytes(slice)))
            }
            // fixed32
            5 => {
                if self.pos + 4 > self.buf.len() {
                    return None;
                }
                self.pos += 4;
                Some((field_no, PbValue::Skipped))
            }
            // 未知の wire type = デコード不能なので打ち切り
            _ => None,
        }
    }
}

/// search レスポンスの「カラム」message を 1 件パースする。
///
/// 実機構造 (2026-09-07 確認):
/// ```text
/// f1 {                                  // ルート
///   f1 : varint                         // 総ヒット数
///   f12: Column {                       // カラムが横に 28 本並ぶ
///     f1: string  = カラム ID   ("name" / "account" / "dps.total" / …)
///     f2: string  = 表示名
///     f7: string  = 値 (行数ぶん繰り返し。行順は全カラムで共通)
///   } × 28
/// }
/// ```
/// `name` 列の i 番目と `account` 列の i 番目が同一キャラを指す。
///
/// 旧実装 (〜v0.1.29) は「ラベル文字列の後ろに値が続く」前提でフラットに
/// スキャンし、`parent`/`depth` のマジックナンバー (5/2, 2/3) に依存していた。
/// 2026-09 のリーグ切替でフィールド番号が変わって全件 0 件になったため、
/// フィールド番号を辿る構造パースに置き換えた (シグネチャ依存を排除)。
///
/// 戻り値: `(カラム ID, 値の配列)`。ID か値が無ければ `None` (= カラムではない)。
pub(crate) fn parse_search_column(buf: &[u8]) -> Option<(String, Vec<String>)> {
    const FIELD_COLUMN_ID: i32 = 1;
    const FIELD_COLUMN_VALUE: i32 = 7;

    let mut id: Option<String> = None;
    let mut values: Vec<String> = Vec::new();

    for (field_no, value) in PbReader::new(buf) {
        let PbValue::Bytes(raw) = value else {
            continue;
        };
        match field_no {
            FIELD_COLUMN_ID if id.is_none() => {
                // カラム ID は必ず UTF-8 文字列。バイナリなら別の message なので無視。
                id = std::str::from_utf8(raw).ok().map(str::to_string);
            }
            FIELD_COLUMN_VALUE => {
                // 数値カラムは UTF-8 にならないことがあるので、失敗分は捨てる。
                if let Ok(s) = std::str::from_utf8(raw) {
                    values.push(s.to_string());
                }
            }
            _ => {}
        }
    }

    match id {
        Some(id) if !values.is_empty() => Some((id, values)),
        _ => None,
    }
}

/// search レスポンス全体から、カラム ID → 値配列 のマップを組み立てる。
///
/// ルートの階層 (現状 `f1` 直下の `f12`) が将来また変わっても拾えるよう、
/// 「フィールド番号を決め打ちせず、カラムの *形* に一致する message を探す」
/// 方針にしている。同じ ID が複数見つかった場合は最初 (= 最も浅い) を採用。
pub(crate) fn extract_search_columns(buf: &[u8]) -> HashMap<String, Vec<String>> {
    /// ネストの上限。実際は深さ 2 で見つかるが、構造変更に備えて少し余裕を持たせる。
    const MAX_DEPTH: usize = 6;

    fn walk(buf: &[u8], depth: usize, out: &mut HashMap<String, Vec<String>>) {
        if depth > MAX_DEPTH {
            return;
        }
        for (_field_no, value) in PbReader::new(buf) {
            let PbValue::Bytes(raw) = value else {
                continue;
            };
            if let Some((id, values)) = parse_search_column(raw) {
                out.entry(id).or_insert(values);
            }
            // カラムでなかった message も、内側にカラムを抱えている可能性がある。
            walk(raw, depth + 1, out);
        }
    }

    let mut out = HashMap::new();
    walk(buf, 0, &mut out);
    out
}

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

/// varint を読む。返り値: `(value, next_offset)` または None
pub(crate) fn read_varint(buf: &[u8], offset: usize) -> Option<(u64, usize)> {
    let mut result: u64 = 0;
    let mut shift: u32 = 0;
    let mut i = offset;
    while i < buf.len() {
        let b = buf[i];
        i += 1;
        result |= ((b & 0x7f) as u64) << shift;
        if (b & 0x80) == 0 {
            return Some((result, i));
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}

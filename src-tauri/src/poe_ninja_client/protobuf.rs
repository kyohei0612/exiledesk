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
    /// varint / fixed64 / fixed32 (読み飛ばし対象)
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
                let (_, ni) = read_varint(self.buf, self.pos)?;
                self.pos = ni;
                Some((field_no, PbValue::Skipped))
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

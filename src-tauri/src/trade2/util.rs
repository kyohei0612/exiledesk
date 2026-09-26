//! trade2/util.rs — 応答のレート制限ヘッダを JSON にする / URL encode (search・fetch 共通の小道具)
//!
//! trade2.rs から分割 (2026-09-26)。
use super::*;

/// x-rate-limit-* ヘッダをそのまま JSON にする (2026-09-14)。
/// フロントの擬似レート制限がサーバー側の実カウント (同じ IP の手動検索も含む) に合わせるために使う。
pub(crate) fn rate_limit_headers(h: &HeaderMap) -> serde_json::Value {
    let mut m = serde_json::Map::new();
    for (k, v) in h.iter() {
        let name = k.as_str();
        if name.starts_with("x-rate-limit-") {
            if let Ok(s) = v.to_str() {
                m.insert(name.to_string(), serde_json::Value::String(s.to_string()));
            }
        }
    }
    serde_json::Value::Object(m)
}

/// 簡易 URL encode (Rust 標準は無いので手書き、ASCII + - _ . ~ 以外はパーセント符号化)。
pub(crate) fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

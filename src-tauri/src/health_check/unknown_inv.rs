//! 未知 inventoryId (is_target_inventory_id に弾かれたスロット) のカウンタとサンプル収集
//!
//! health_check.rs (714 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// Phase ο-C (2026-05-22): 未知 inventoryId サンプル収集
// ============================================================================
//
// 旧実装は AtomicU64 で「件数」だけを保持していたが、オーナーから「62 件と
// 数字だけでは何の inv_id か分からない、具体値が見たい」要望が出たため、
// inv_id 文字列 → 出現カウントの Map を保持する。
//
// 排他制御:
//   - 起動時は health_check_all から read (lock + clone) のみ。
//   - フェッチ中は record_unknown_inventory_id から書き込み (頻度: 数十回/分)。
//   - 同時アクセスはあるが秒間数件程度なので Mutex で十分 (Rwlock 不要)。
//
// メモリ上限:
//   - 異常時 (POE2 が 1000 種類の新スロット投入) に備え、HashMap サイズが
//     UNKNOWN_INV_ID_CAP を超えたら新規 inv_id を弾く (既存カウントは継続)。
//   - 通常 POE2 で想定される未知スロットは 5-20 種類なので問題なし。
pub(crate) const UNKNOWN_INV_ID_CAP: usize = 256;

/// inv_id 文字列 → 累積出現カウント。
/// 例: { "Belt" => 30, "Flask1" => 18, ... }
pub(crate) static UNKNOWN_INV_ID_SAMPLES: Mutex<Option<HashMap<String, u64>>> = Mutex::new(None);

/// サンプル UI 表示件数 (上位 N 件)。
pub(crate) const UNKNOWN_INV_ID_SAMPLE_LIMIT: usize = 20;

// ============================================================================
// 未知 inventoryId カウンタ (静的)
// ============================================================================

/// `character_items_to_cached` 内で `is_target_inventory_id` に弾かれた inventoryId 数。
/// プロセス起動からの累積カウント。`health_check_all` から `.load()` のみで参照する。
pub static UNKNOWN_INV_ID_COUNT: AtomicU64 = AtomicU64::new(0);

/// 既存ロジックから呼び出すための薄いインクリメンタ。
/// `character_items_to_cached` で reject 直後に呼ぶことを想定。
///
/// `inv_id` はデバッグ用に eprintln! で 1 行ログ出力する (オーナー指示)。
/// `frame_type` は -1 (欠落) の場合もある。
///
/// Phase ο-C (2026-05-22): カウントだけでなく inv_id 文字列もサンプル収集する。
///   - UNKNOWN_INV_ID_SAMPLES に inv_id → count を蓄積。
///   - UI 側で「Belt が 30 件、Flask1 が 18 件」のように具体値が見えるようにする。
pub fn record_unknown_inventory_id(inv_id: &str, frame_type: i64) {
    UNKNOWN_INV_ID_COUNT.fetch_add(1, Ordering::Relaxed);
    eprintln!(
        "[health-check] unknown inventoryId='{}' frameType={}",
        inv_id, frame_type
    );

    // Mutex 取得失敗 (poisoned) は無視: サンプル収集は best-effort で OK。
    if let Ok(mut guard) = UNKNOWN_INV_ID_SAMPLES.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        // Cap 超過時の挙動:
        //   - 既知の inv_id ならカウントだけ +1 (既存エントリ更新)。
        //   - 新規 inv_id は破棄 (メモリ爆発防止)。
        match map.get_mut(inv_id) {
            Some(c) => {
                *c = c.saturating_add(1);
            }
            None => {
                if map.len() < UNKNOWN_INV_ID_CAP {
                    map.insert(inv_id.to_string(), 1);
                }
            }
        }
    }
}

/// テスト・将来の手動リセット用ヘルパー (現状 UI からは未呼び出し)。
/// カウンタとサンプル両方をクリアする。
#[allow(dead_code)]
pub fn reset_unknown_inventory_id_samples() {
    UNKNOWN_INV_ID_COUNT.store(0, Ordering::Relaxed);
    if let Ok(mut guard) = UNKNOWN_INV_ID_SAMPLES.lock() {
        *guard = None;
    }
}

/// 上位 N 件の (inv_id, count) を出現順で返す (count 降順、同数は inv_id 辞書順)。
/// health_check_all から呼び出される。
pub(crate) fn top_unknown_inventory_id_samples() -> Vec<(String, u64)> {
    let guard = match UNKNOWN_INV_ID_SAMPLES.lock() {
        Ok(g) => g,
        Err(_) => return Vec::new(),
    };
    let map = match guard.as_ref() {
        Some(m) => m,
        None => return Vec::new(),
    };

    let mut items: Vec<(String, u64)> =
        map.iter().map(|(k, v)| (k.clone(), *v)).collect();
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    items.truncate(UNKNOWN_INV_ID_SAMPLE_LIMIT);
    items
}

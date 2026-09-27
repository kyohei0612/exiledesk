//! trade2/gate/tests.rs — 門番の待ち時間 (wait_for_rules) のテスト
//!
//! gate.rs から分割 (2026-09-26)。
use super::*;
use crate::trade2::testutil::*;

/// 枠が余っていれば待たない (ただし直前の送信からは最低 MIN_SPACING_MS 空ける)
#[test]
fn free_slot_does_not_wait() {
    let now = 1_000_000;
    let g = gate(vec![now - 11_000], vec![(5, 10)], 0);
    assert_eq!(wait_for_rules(&g, now, SPACING), 0);
}

/// 枠が空いていても 1 秒以内に連発はしない (2026-09-18: 手動の再取得が 3 発を 1 秒で出していた)
#[test]
fn burst_is_spaced_out() {
    let now = 1_000_000;
    let g = gate(vec![now - 500], vec![(5, 10)], 0);
    assert_eq!(wait_for_rules(&g, now, SPACING), 10_000, "直前の送信から 10.5 秒空ける");
}


/// 上限の手前 (余裕 1) まで使ったら、一番古い送信が窓から出るまで待つ
#[test]
fn waits_until_oldest_leaves_the_window() {
    let now = 1_000_000;
    // 上限 5 / 10 秒 → 余裕 1 なので 4 件で止める。一番古いのは 3 秒前
    let sends = vec![now - 9_000, now - 8_000, now - 7_000, now - 6_000];
    let g = gate(sends, vec![(5, 10)], 0);
    // 9 秒前の分が窓 (10 秒) から出るまで = あと 1 秒 + 余白 0.3 秒。
    // ただし直前の送信 (6 秒前) から 10.5 秒の最低間隔の方が長いのでそちらが効く
    assert_eq!(wait_for_rules(&g, now, SPACING), 4_500);
}

/// 窓が複数ある時は一番長く待つ物に合わせる
#[test]
fn takes_the_longest_wait_of_all_windows() {
    let now = 1_000_000;
    let mut sends: Vec<i64> = (0..13).map(|i| now - 50_000 + i * 100).collect();
    sends.push(now - 11_000);
    let g = gate(sends, vec![(5, 10), (15, 60)], 0);
    // 60 秒窓 (上限 15、余裕 2 → 13 件) の方が長い
    assert!(wait_for_rules(&g, now, SPACING) > 9_000);
}




/// 罰則中はその解除まで待つ
#[test]
fn penalty_blocks_until_it_clears() {
    let now = 1_000_000;
    let g = gate(vec![], vec![(5, 10)], now + 30_000);
    assert_eq!(wait_for_rules(&g, now, SPACING), 30_000);
}

/// 短い窓 (10 秒) を 8 割使ったら、窓が空になるまで待つ (2026-09-27 オーナー「30 秒の枠 8 割使い切ったら 30 秒待たす」)
#[test]
fn short_window_waits_until_empty() {
    let now = 1_000_000;
    let sends = vec![now - 9_000, now - 6_000, now - 3_000, now - 1_000];
    let (wait, why, period) = window_wait_why(&sends, &[(5, 10)], now);
    assert_eq!(why, WaitWhy::Reset);
    assert_eq!(period, 10);
    // 一番新しい (1 秒前) が出るまで = 9 秒 + 余白 0.3 秒
    assert_eq!(wait, 9_300);
}

/// 5 分の窓を 8 割使ったら、空になるまで (最大 5 分) は長すぎるので 1 枠空くのを待つ (簡易措置)
#[test]
fn long_window_at_80_percent_waits_one_slot() {
    let now = 1_000_000;
    let sends: Vec<i64> = (0..24).map(|i| now - 290_000 + i * 1_000).collect();
    let (wait, why, _) = window_wait_why(&sends, &[(30, 300)], now);
    assert_eq!(why, WaitWhy::Slot);
    assert_eq!(wait, 10_300, "一番古い (290 秒前) が出るまで");
}

/// 取得 1 回で使う信号の数で見る: 10 秒の枠 (8 割 = 4) に 2 本使っていれば、2 本の取得は待たず、3 本の取得は空になるまで待つ
#[test]
fn waits_by_the_number_of_signals() {
    let now = 1_000_000;
    let sends = vec![now - 5_000, now - 2_000];
    assert_eq!(window_wait_n(&sends, &[(5, 10)], now, 2).0, 0);
    let (wait, why, _) = window_wait_n(&sends, &[(5, 10)], now, 3);
    assert_eq!(why, WaitWhy::Reset);
    assert_eq!(wait, 8_300, "一番新しい (2 秒前) が出て空になるまで");
}

/// 長い枠は、その取得の分が空くまで (5 分の枠 8 割 = 24 に 22 本、4 本の取得 → 古い方から 2 本出るまで)
#[test]
fn long_window_waits_for_room_of_the_whole_fetch() {
    let now = 1_000_000;
    let sends: Vec<i64> = (0..22).map(|i| now - 280_000 + i * 1_000).collect();
    let (wait, why, _) = window_wait_n(&sends, &[(30, 300)], now, 4);
    assert_eq!(why, WaitWhy::Slot);
    assert_eq!(wait, 21_300, "2 番目に古い (279 秒前) が出るまで");
}

//! market_flow/tally/tests.rs — 判定 (apply_sample / prune など) のテストと共通の道具
//!
//! tally.rs から分割 (2026-09-26)。付け替え (relist) の判定は tests/relist.rs。
use super::*;

const OK: Option<&[ListingRef]> = Some(&[]);

/// 出品者・出品時刻つきの出品 (出品者は ID ごとに別人)
fn lr(id: &str, amount: f64) -> ListingRef {
    ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: Some(1_699_990_000), account: Some(format!("S-{id}")) }
}

fn lr_at(id: &str, amount: f64, listed_at: i64) -> ListingRef {
    ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: Some(listed_at), account: Some(format!("S-{id}")) }
}

/// 出品者を指定した出品
fn by(id: &str, amount: f64, acc: &str, at: i64) -> ListingRef {
    ListingRef { id: id.into(), amount: Some(amount), currency: Some("divine".into()), listed_at: Some(at), account: Some(acc.into()) }
}

fn ids(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

fn find<'a>(st: &'a WatchState, id: &str) -> &'a Tracked {
    st.tracked.iter().find(|t| t.id == id).unwrap()
}

fn daily_gone(st: &WatchState) -> u32 {
    st.daily.iter().map(|d| d.gone).sum()
}

/// 出品時刻が取れていれば、こちらが見つけた時刻ではなく出品時刻から齢を数える
#[test]
fn age_counts_from_listed_at() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    // 17 時間前に出品された物を今見つけた
    apply_sample(&mut st, t0, 1, &ids(&["a"]), &[lr_at("a", 43.0, t0 - 17 * 3600)], true, OK);
    let t = &st.tracked[0];
    assert_eq!(t.entry_age(), 17 * 3600);
    assert_eq!(t.age(t0), 17 * 3600);
    // 1 時間後と 2 時間後に続けて居ない → 売れた。消えた時刻は最初に居なかった 1 時間後 = 寿命 18 時間
    apply_sample(&mut st, t0 + 3600, 0, &[], &[], true, OK);
    apply_sample(&mut st, t0 + 7200, 0, &[], &[], true, OK);
    assert_eq!(st.tracked[0].age(t0 + 7200), 18 * 3600);
}

/// 出品時刻のパース (2026-01-01T00:00:00Z = 1767225600)
#[test]
fn parse_indexed_reads_rfc3339() {
    assert_eq!(parse_indexed("2026-01-01T00:00:00Z"), Some(1_767_225_600));
    assert_eq!(parse_indexed("2024-02-29T00:00:00Z"), Some(1_709_164_800));
    assert_eq!(parse_indexed("bad"), None);
}

/// 最安 10 件が丸ごと安い出品に入れ替わっても、前の出品は「消えた」にならない
/// (オーナーの例: 50 神が滞留しているところに 40 神が 20 件参戦)
#[test]
fn cheaper_flood_does_not_count_as_sold() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    // 50 神が 10 件並んでいる
    let old: Vec<String> = (0..10).map(|i| format!("old{i}")).collect();
    let old_entries: Vec<ListingRef> = old.iter().map(|id| lr(id, 50.0)).collect();
    apply_sample(&mut st, t0, 10, &old, &old_entries, true, OK);
    assert_eq!(st.tracked.len(), 10);

    // 40 神が 20 件参戦。search の一覧には新旧 30 件すべてが入る
    let new: Vec<String> = (0..20).map(|i| format!("new{i}")).collect();
    let mut all = new.clone();
    all.extend(old.clone());
    let new_top: Vec<ListingRef> = new.iter().take(10).map(|id| lr(id, 40.0)).collect();
    apply_sample(&mut st, t0 + 3600, 30, &all, &new_top, true, OK);

    // 50 神は 1 件も消えていない
    assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some() || t.missing_since.is_some()).count(), 0);
    // 新しい 10 件が追跡に加わっている
    assert_eq!(st.tracked.len(), 20);
}

/// 一覧から 2 回続けて消えたら売れた扱い。寿命は最初に居なかった時刻まで
#[test]
fn disappearing_listing_gets_lifetime() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 2, &ids(&["a", "b"]), &[lr_at("a", 40.0, t0), lr_at("b", 41.0, t0)], true, OK);
    apply_sample(&mut st, t0 + 7200, 1, &ids(&["b"]), &[lr_at("b", 41.0, t0)], true, OK);
    apply_sample(&mut st, t0 + 14400, 1, &ids(&["b"]), &[lr_at("b", 41.0, t0)], true, OK);
    let gone: Vec<&Tracked> = st.tracked.iter().filter(|t| t.gone_at.is_some()).collect();
    assert_eq!(gone.len(), 1);
    assert_eq!(gone[0].id, "a");
    assert_eq!(gone[0].age(t0 + 14400), 7200);
    assert_eq!(daily_gone(&st), 1);
}

/// B4: 1 回だけ居ないのは確定待ち。次に戻ってきたら取り消し (売れたに数えない)
#[test]
fn one_round_absence_then_return_is_not_sold() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 2, &ids(&["a", "b"]), &[lr("a", 40.0), lr("b", 41.0)], true, OK);
    apply_sample(&mut st, t0 + 3600, 1, &ids(&["b"]), &[lr("b", 41.0)], true, OK);
    let a = find(&st, "a");
    assert!(a.gone_at.is_none(), "1 回だけでは売れたにしない");
    assert_eq!(a.missing_since, Some(t0 + 3600), "確定待ち (最初に居なかった時刻)");
    assert_eq!(daily_gone(&st), 0);
    apply_sample(&mut st, t0 + 7200, 2, &ids(&["a", "b"]), &[lr("a", 40.0), lr("b", 41.0)], true, OK);
    let a = find(&st, "a");
    assert!(a.gone_at.is_none() && a.missing_since.is_none(), "戻ってきたら確定待ちを取り消す");
    assert_eq!(daily_gone(&st), 0);
}

/// B4: 2 回続けて居なければ売れた。消えた時刻は 1 回目、日次の売れたもその日に入る
#[test]
fn two_round_absence_is_sold_at_first_missing_time() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 2, &ids(&["a", "b"]), &[lr("a", 40.0), lr("b", 41.0)], true, OK);
    let t1 = t0 + 3600;
    apply_sample(&mut st, t1, 1, &ids(&["b"]), &[lr("b", 41.0)], true, OK);
    // 2 回目は 3 日後 (日付をまたぐ)
    let t2 = t1 + 3 * 86_400;
    apply_sample(&mut st, t2, 1, &ids(&["b"]), &[lr("b", 41.0)], true, OK);
    let a = find(&st, "a");
    assert_eq!(a.gone_at, Some(t1), "消えた時刻は最初に居なかった時刻");
    assert!(!a.relisted && !a.unknown && a.missing_since.is_none());
    let day1 = t1 - t1.rem_euclid(86_400);
    assert_eq!(st.daily.iter().find(|d| d.day == day1).map(|d| d.gone), Some(1), "売れたは最初に居なかった日に数える");
    assert_eq!(daily_gone(&st), 1);
    assert!(st.daily.windows(2).all(|w| w[0].day < w[1].day), "日次は日付順のまま");
}

/// 総数が 100 以上 (一覧が途中まで) の時は勝手に消えた判定をしない
#[test]
fn incomplete_list_does_not_mark_gone() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 150, &ids(&["a"]), &[lr("a", 40.0)], false, OK);
    apply_sample(&mut st, t0 + 3600, 150, &ids(&["z"]), &[lr("z", 39.0)], false, OK);
    apply_sample(&mut st, t0 + 7200, 150, &ids(&["z"]), &[lr("z", 39.0)], false, OK);
    assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some() || t.missing_since.is_some()).count(), 0);
}

/// B1: 詳細 (出品者) が取れなかった巡は消えた判定をしない。確定待ちもそのまま
#[test]
fn fetch_failure_round_keeps_disappearances_pending() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 2, &ids(&["a", "b"]), &[lr("a", 40.0), lr("b", 41.0)], true, OK);
    // fetch が失敗した巡 (entries 空、出品者なし)
    assert!(!fetch_details_ok(1, &[]), "取りに行って 1 件も取れなければ失敗");
    assert!(!fetch_details_ok(1, &[ListingRef { account: None, ..lr("b", 41.0) }]), "出品者が無ければ失敗");
    assert!(fetch_details_ok(0, &[]), "取る物が無かっただけなら失敗ではない");
    apply_sample(&mut st, t0 + 3600, 1, &ids(&["b"]), &[], true, None);
    assert!(find(&st, "a").missing_since.is_none() && find(&st, "a").gone_at.is_none(), "失敗した巡では確定待ちにもしない");
    // 1 回目の不在 (判定できる巡)
    apply_sample(&mut st, t0 + 7200, 1, &ids(&["b"]), &[lr("b", 41.0)], true, OK);
    assert_eq!(find(&st, "a").missing_since, Some(t0 + 7200));
    // また fetch 失敗 → 確定待ちのまま
    apply_sample(&mut st, t0 + 10800, 1, &ids(&["b"]), &[], true, None);
    let a = find(&st, "a");
    assert!(a.gone_at.is_none() && a.missing_since == Some(t0 + 7200), "失敗した巡では確定させない");
    assert_eq!(daily_gone(&st), 0);
    // 次の判定できる巡で確定
    apply_sample(&mut st, t0 + 14400, 1, &ids(&["b"]), &[lr("b", 41.0)], true, OK);
    assert_eq!(find(&st, "a").gone_at, Some(t0 + 7200));
    assert_eq!(daily_gone(&st), 1);
}

/// B3: 出品時刻か出品者が分からない物は「不明」。売れた件数に入れない
#[test]
fn unknown_time_or_seller_is_not_sold() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    let no_time = ListingRef { listed_at: None, ..lr("a", 40.0) };
    let no_seller = ListingRef { account: None, ..lr("b", 41.0) };
    apply_sample(&mut st, t0, 3, &ids(&["a", "b", "c"]), &[no_time, no_seller, lr("c", 42.0)], true, OK);
    apply_sample(&mut st, t0 + 3600, 1, &ids(&["c"]), &[lr("c", 42.0)], true, OK);
    apply_sample(&mut st, t0 + 7200, 1, &ids(&["c"]), &[lr("c", 42.0)], true, OK);
    for id in ["a", "b"] {
        let t = find(&st, id);
        assert!(t.gone_at.is_some() && t.unknown && !t.relisted, "{id} は不明");
    }
    assert_eq!(daily_gone(&st), 0, "不明は売れたに数えない");
}

/// 消えた扱いにした出品が再び現れたら生き返る (出品者が一時的にオフラインだった等)
#[test]
fn reappearing_listing_revives() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 1, &ids(&["a"]), &[lr("a", 40.0)], true, OK);
    apply_sample(&mut st, t0 + 3600, 0, &[], &[], true, OK);
    apply_sample(&mut st, t0 + 7200, 0, &[], &[], true, OK);
    assert!(st.tracked[0].gone_at.is_some());
    apply_sample(&mut st, t0 + 10800, 1, &ids(&["a"]), &[lr("a", 40.0)], true, OK);
    assert!(st.tracked[0].gone_at.is_none(), "再び見えたら生存に戻す");
}

/// 生き返った出品は日次の「消えた」からも引く
#[test]
fn revive_undoes_daily_gone() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    apply_sample(&mut st, now, 2, &ids(&["a", "b"]), &[lr("a", 1.0), lr("b", 1.0)], true, OK);
    // b が 2 回続けて見えない
    apply_sample(&mut st, now + 600, 1, &ids(&["a"]), &[lr("a", 1.0)], true, OK);
    apply_sample(&mut st, now + 1200, 1, &ids(&["a"]), &[lr("a", 1.0)], true, OK);
    assert_eq!(daily_gone(&st), 1);
    // また現れた: 売れていない
    apply_sample(&mut st, now + 1800, 2, &ids(&["a", "b"]), &[lr("a", 1.0), lr("b", 1.0)], true, OK);
    assert_eq!(daily_gone(&st), 0, "日次の消えた件数も戻す");
    assert!(st.tracked.iter().all(|t| t.gone_at.is_none()));
}

/// 追跡中の出品が値下げされたら、記録の値段も追従する
#[test]
fn price_is_refreshed_for_tracked_listings() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    let e = |id: &str, amt: f64| by(id, amt, "Seller#1", now - 3600);
    apply_sample(&mut st, now, 1, &ids(&["a"]), &[e("a", 10.0)], false, OK);
    apply_sample(&mut st, now + 7200, 1, &ids(&["a"]), &[e("a", 7.0)], false, OK);
    let t = find(&st, "a");
    assert_eq!(t.amount, Some(7.0), "値下げが反映される");
    assert_eq!(t.listed_at, Some(now - 3600), "出品時刻は動かさない");
    assert_eq!(st.tracked.len(), 1, "同じ ID を二重に追跡しない");
}

/// 付け替え (同じ出品者が並べ直した) の判定
mod relist;

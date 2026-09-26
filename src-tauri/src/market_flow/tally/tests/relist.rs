//! market_flow/tally/tests/relist.rs — 付け替え (relist)・追加の出品者取得・沈み・掃除のテスト
//!
//! tally.rs から分割 (2026-09-26)。道具 (lr / by / ids / find …) は親の tests.rs。
use super::*;

/// 売れた直後に同じ出品者が並べ直した分は、売れた件数に数えない
#[test]
fn immediate_relist_is_not_counted_as_sold() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    apply_sample(&mut st, now, 2, &ids(&["a", "b"]), &[by("a", 10.0, "S1", now - 7200), by("b", 11.0, "S2", now - 7200)], true, OK);
    // a が消え、同じ出品者 S1 が並べ直した新しい出品 c が出ている (2 巡続けて)
    let t1 = now + 3600;
    let cur = [by("b", 11.0, "S2", now - 7200), by("c", 9.0, "S1", t1 - 60)];
    apply_sample(&mut st, t1, 2, &ids(&["b", "c"]), &cur, true, OK);
    apply_sample(&mut st, t1 + 3600, 2, &ids(&["b", "c"]), &cur, true, OK);
    let a = find(&st, "a");
    assert!(a.gone_at.is_some(), "一覧から消えたことは記録する");
    assert!(a.relisted, "並べ直しとして印を付ける");
    assert_eq!(daily_gone(&st), 0, "売れた件数には数えない");

    // 別の出品者 S2 の b が消えた (S2 はもう何も並べていない) → 売れた扱い
    let t2 = t1 + 7200;
    apply_sample(&mut st, t2, 1, &ids(&["c"]), &[by("c", 9.0, "S1", t1 - 60)], true, OK);
    apply_sample(&mut st, t2 + 3600, 1, &ids(&["c"]), &[by("c", 9.0, "S1", t1 - 60)], true, OK);
    let b = find(&st, "b");
    assert!(b.gone_at.is_some() && !b.relisted, "並べ直しでなければ売れた扱い");
    assert_eq!(daily_gone(&st), 1);
}

/// B2: 同じ出品者が**前から**並べている別の出品 (新しい ID ではない / 最安 10 件の外) が
/// 残っていれば付け替え扱い (売れたにしない)
#[test]
fn older_listing_by_same_seller_counts_as_relist() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    // S1 が a (安い) と z (高い、12 件目) を前から並べている。z は最安 10 件の外なので追跡していない
    let mut all: Vec<String> = vec!["a".into()];
    all.extend((0..10).map(|i| format!("o{i}")));
    all.push("z".into());
    let mut top: Vec<ListingRef> = vec![by("a", 5.0, "S1", now - 9000)];
    top.extend((0..9).map(|i| by(&format!("o{i}"), 6.0, &format!("O{i}"), now - 9000)));
    apply_sample(&mut st, now, all.len() as u64, &all, &top, true, OK);
    // a が消えた。z は前からある (新しい ID ではない) が、追加の fetch で出品者 S1 が分かる
    let rest: Vec<String> = all.iter().filter(|id| id.as_str() != "a").cloned().collect();
    let want = extra_detail_ids(&st, &rest, true);
    assert!(want.contains(&"z".to_string()), "11 件目以降で出品者の分からない z を取りに行く: {want:?}");
    let top2: Vec<ListingRef> = (0..10).map(|i| by(&format!("o{i}"), 6.0, &format!("O{i}"), now - 9000)).collect();
    let extra = [by("z", 20.0, "S1", now - 20_000)];
    apply_sample(&mut st, now + 3600, rest.len() as u64, &rest, &top2, true, Some(&extra));
    apply_sample(&mut st, now + 7200, rest.len() as u64, &rest, &top2, true, Some(&extra));
    let a = find(&st, "a");
    assert!(a.gone_at.is_some() && a.relisted, "同じ出品者が前からの出品を残している = 付け替え");
    assert_eq!(daily_gone(&st), 0);
    assert!(st.tracked.iter().all(|t| t.id != "z"), "追加で取った出品は追跡には入れない");
}

/// B2: 追跡中で今も一覧に居る出品の出品者も見る (その回の fetch に出てこなくても)
#[test]
fn tracked_live_listing_of_same_seller_counts_as_relist() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    apply_sample(&mut st, now, 2, &ids(&["a", "b"]), &[by("a", 5.0, "S1", now - 9000), by("b", 7.0, "S1", now - 9000)], true, OK);
    // a が消える。今回の fetch には b が出てこない (値段で押し出された) が、一覧には居る
    let flood: Vec<ListingRef> = (0..10).map(|i| by(&format!("n{i}"), 1.0, &format!("N{i}"), now)).collect();
    let mut now_ids: Vec<String> = (0..10).map(|i| format!("n{i}")).collect();
    now_ids.push("b".into());
    apply_sample(&mut st, now + 3600, 11, &now_ids, &flood, true, OK);
    apply_sample(&mut st, now + 7200, 11, &now_ids, &flood, true, OK);
    let a = find(&st, "a");
    assert!(a.gone_at.is_some() && a.relisted, "追跡中の b (S1) が居るので付け替え");
    assert_eq!(daily_gone(&st), 0);
}

/// S2: 値段を上げて最安 10 件の外に並べ直した → 追加の fetch で出品者を見て付け替え (売れたにしない)
#[test]
fn relist_at_higher_price_outside_top10_is_relist() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    let base: Vec<ListingRef> = (0..10).map(|i| by(&format!("o{i}"), 10.0 + i as f64, &format!("O{i}"), now - 9000)).collect();
    let mut first = vec![by("a", 5.0, "S1", now - 9000)];
    first.extend(base.iter().take(9).cloned());
    let mut all: Vec<String> = vec!["a".into()];
    all.extend((0..10).map(|i| format!("o{i}")));
    apply_sample(&mut st, now, all.len() as u64, &all, &first, true, OK);
    // S1 が a を下げて、高い値段の新しい出品 r (12 件目 = 最安 10 件の外) を出した
    let t1 = now + 3600;
    let mut ids1: Vec<String> = (0..10).map(|i| format!("o{i}")).collect();
    ids1.push("p".into());
    ids1.push("r".into());
    let want = extra_detail_ids(&st, &ids1, true);
    assert_eq!(want, vec!["p".to_string(), "r".to_string()], "11 件目以降で出品者の分からない物だけ");
    let extra = [by("p", 30.0, "P", now - 9000), by("r", 50.0, "S1", t1 - 300)];
    apply_sample(&mut st, t1, ids1.len() as u64, &ids1, &base, true, Some(&extra));
    apply_sample(&mut st, t1 + 3600, ids1.len() as u64, &ids1, &base, true, Some(&extra));
    let a = find(&st, "a");
    assert!(a.gone_at.is_some() && a.relisted, "最安 10 件の外に並べ直した = 付け替え");
    assert_eq!(daily_gone(&st), 0, "売れたに数えない");

    // 同じ状況で追加の fetch を見送った巡 (枠待ち) は判定しない
    let mut st2 = WatchState::default();
    apply_sample(&mut st2, now, all.len() as u64, &all, &first, true, OK);
    apply_sample(&mut st2, t1, ids1.len() as u64, &ids1, &base, true, None);
    apply_sample(&mut st2, t1 + 3600, ids1.len() as u64, &ids1, &base, true, None);
    let a = find(&st2, "a");
    assert!(a.gone_at.is_none() && a.missing_since.is_none(), "見送った巡では売れたにも確定待ちにもしない");
}

/// 消えた物が無い巡・一覧が切れている巡は追加の fetch をしない (枠を食わない)
#[test]
fn extra_detail_ids_only_when_something_vanished() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    let all: Vec<String> = (0..15).map(|i| format!("o{i}")).collect();
    let top: Vec<ListingRef> = (0..10).map(|i| by(&format!("o{i}"), 1.0, "X", now)).collect();
    apply_sample(&mut st, now, 15, &all, &top, true, OK);
    assert!(extra_detail_ids(&st, &all, true).is_empty(), "全部居るなら取らない");
    let fewer: Vec<String> = all.iter().skip(1).cloned().collect();
    assert!(extra_detail_ids(&st, &fewer, false).is_empty(), "一覧が切れているなら判定しないので取らない");
    assert_eq!(extra_detail_ids(&st, &fewer, true).len(), 4, "11 件目以降の 4 件");
}

/// fetch の応答を読む
#[test]
fn parse_fetch_result_reads_listing() {
    let v = serde_json::json!({"result":[{"id":"x","listing":{"indexed":"2026-01-01T00:00:00Z","account":{"name":"S1"},"price":{"amount":3.0,"currency":"divine"}}}, null]});
    let r = parse_fetch_result(&v);
    assert_eq!(r.len(), 1);
    assert_eq!(r[0].account.as_deref(), Some("S1"));
    assert_eq!(r[0].listed_at, Some(1_767_225_600));
    assert_eq!(r[0].amount, Some(3.0));
}

/// 一覧が 100 件で切れている時、載っていない追跡分は「沈んだ」として追跡をやめる
#[test]
fn buried_listings_stop_being_tracked() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    apply_sample(&mut st, now, 150, &ids(&["a", "b"]), &[lr("a", 5.0), lr("b", 5.0)], false, OK);
    // b が一覧 (切れている) に載らない状態が 3 回続く
    for i in 1..=3 {
        let v = ids(&["a"]);
        apply_sample(&mut st, now + i * 7200, 150, &v, &[lr("a", 5.0)], false, OK);
        mark_buried(&mut st, &v, false);
        prune(&mut st, now + i * 7200);
    }
    assert!(st.tracked.iter().all(|t| t.id != "b"), "沈んだ出品は追跡から外す");
    assert_eq!(st.tracked.len(), 1, "一覧に居る a は残る");
}

/// 検索が空で返った時に、追跡中の出品を全部「売れた」にしない
#[test]
fn empty_result_does_not_wipe_tracked() {
    let now = 1_700_000_000i64;
    let mut st = WatchState::default();
    apply_sample(&mut st, now, 2, &ids(&["a", "b"]), &[lr("a", 1.0), lr("b", 1.0)], true, OK);
    // 空の応答 (total 0 / ID 0 件)
    let empty: Vec<String> = Vec::new();
    let list_complete = list_is_complete(&empty, 0, &st.tracked);
    assert!(!list_complete, "空の応答では消えた判定をしない");
    apply_sample(&mut st, now + 3600, 0, &empty, &[], list_complete, OK);
    apply_sample(&mut st, now + 7200, 0, &empty, &[], list_complete, OK);
    assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some() || t.missing_since.is_some()).count(), 0);
}

/// 古い保存データ (新しい欄が無い) もそのまま読める
#[test]
fn old_tracked_json_still_loads() {
    let t: Tracked = serde_json::from_str(r#"{"id":"a","first_seen":1,"last_seen":2,"gone_at":3,"relisted":false}"#).unwrap();
    assert_eq!(t.missing_since, None);
    assert!(!t.unknown);
}

/// 7 日を超えて生き残った出品は集計に畳んで捨てる (キャッシュを膨らませない)
#[test]
fn prune_drops_after_a_week() {
    let mut st = WatchState::default();
    let t0 = 1_700_000_000;
    apply_sample(&mut st, t0, 1, &ids(&["a"]), &[lr_at("a", 40.0, t0)], true, OK);
    prune(&mut st, t0 + TRACK_MAX_SECS + 60);
    assert!(st.tracked.is_empty());
    assert_eq!(st.daily.iter().map(|d| d.survived).sum::<u32>(), 1);
}

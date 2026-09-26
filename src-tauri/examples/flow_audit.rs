//! flow_audit.rs — 捌き速度の判定をダミーデータで総点検する (2026-09-17)
//!
//! オーナー指示:「ダミーでテストよろしく。仕組みだけ先に堅牢にしてからテストで取ってくれ」。
//! 実際に踏んだ事故を全部シナリオにして、判定が間違わないことを確かめる。
//! 公式 API は一切叩かない (全部この中で作ったダミーの応答)。
//!
//!   cargo run --example flow_audit
use exiledesk_lib::market_flow::{apply_sample, fetch_details_ok, prune, ListingRef, WatchState};

const HOUR: i64 = 3600;

fn listing(id: &str, price: f64, listed_at: i64, account: &str) -> ListingRef {
    ListingRef {
        id: id.to_string(),
        amount: Some(price),
        currency: Some("divine".to_string()),
        listed_at: Some(listed_at),
        account: Some(account.to_string()),
    }
}

/// 検索の応答を模した物。ids は search が返す ID 一覧 (安い順、最大 100)
struct Response {
    total: u64,
    ids: Vec<String>,
    /// fetch で取れる最安 10 件
    entries: Vec<ListingRef>,
}

/// 本番と同じ手順で 1 回ぶん取り込む。
///
/// 生死は search が返す ID 一覧だけで決める。ID 直接 fetch は消えた出品にも
/// キャッシュを返すので使えない (2026-09-17 実測)。
/// ID 一覧が総数に届いていない時と、応答が空の時は判定しない。
/// 2026-09-26 から: 1 回消えただけでは確定待ち。2 回続けて居なければ売れた
fn sample(state: &mut WatchState, now: i64, r: &Response) {
    let complete = r.ids.len() as u64 >= r.total && !(r.ids.is_empty() && !state.tracked.is_empty());
    let details: Option<&[ListingRef]> = if fetch_details_ok(r.ids.len().min(10), &r.entries) { Some(&[]) } else { None };
    apply_sample(state, now, r.total, &r.ids, &r.entries, complete, details);
    prune(state, now);
}

fn gone_count(state: &WatchState) -> usize {
    state.tracked.iter().filter(|t| t.gone_at.is_some() && !t.relisted && !t.unknown).count()
}
fn alive_count(state: &WatchState) -> usize {
    state.tracked.iter().filter(|t| t.gone_at.is_none()).count()
}
fn daily_gone(state: &WatchState) -> u32 {
    state.daily.iter().map(|d| d.gone).sum()
}

fn check(name: &str, ok: bool, detail: String) -> bool {
    println!("{} {name}\n    {detail}", if ok { "[OK]  " } else { "[NG]  " });
    ok
}

/// 出品を並べた応答を作る (出品者は 1 件ごとに別人・同じ値段。
/// 同じ人がまだ並べていると付け替え扱いになるので、2026-09-26 から別人にしてある)
fn shop(ids: &[&str], now: i64, price: f64) -> Response {
    let entries: Vec<ListingRef> = ids.iter().take(10).map(|i| listing(i, price, now - 2 * HOUR, &format!("Seller-{i}"))).collect();
    Response { total: ids.len() as u64, ids: ids.iter().map(|s| s.to_string()).collect(), entries }
}

fn main() {
    let t0 = 1_700_000_000i64;
    let mut ok = true;

    // 1. 一覧から 2 回続けて消えたら売れた扱い (一覧が全部取れている時)
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c", "d", "e"], t0, 10.0));
        sample(&mut st, t0 + HOUR, &shop(&["b", "c", "d", "e"], t0, 10.0));
        sample(&mut st, t0 + 2 * HOUR, &shop(&["c", "d", "e"], t0, 10.0));
        sample(&mut st, t0 + 3 * HOUR, &shop(&["c", "d", "e"], t0, 10.0));
        ok &= check(
            "1. 一覧から 2 回続けて消えた出品は売れた扱い",
            gone_count(&st) == 2 && daily_gone(&st) == 2,
            format!("消えた {} / 追跡中 {} / 日次 {}", gone_count(&st), alive_count(&st), daily_gone(&st)),
        );
    }

    // 2. 応答が空 (通信不良や一時的な 0 件) で全滅させない
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c"], t0, 10.0));
        sample(&mut st, t0 + HOUR, &Response { total: 0, ids: vec![], entries: vec![] });
        ok &= check("2. 空の応答で全部売れたにしない", gone_count(&st) == 0, format!("消えた {}", gone_count(&st)));
    }

    // 3. 一覧が 100 件で切れている時は判定しない (値段で沈んだだけかもしれない)
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c"], t0, 10.0));
        let ids: Vec<String> = (0..100).map(|i| format!("x{i}")).collect();
        let entries: Vec<ListingRef> = (0..10).map(|i| listing(&format!("x{i}"), 5.0, t0 + HOUR, "Other")).collect();
        sample(&mut st, t0 + HOUR, &Response { total: 150, ids, entries });
        ok &= check("3. 一覧が切れている時は消えた判定をしない", gone_count(&st) == 0, format!("消えた {}", gone_count(&st)));
    }

    // 4. 安い出品が増えて窓から押し出されただけ (ID 一覧には居る) → 売れていない
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["old1", "old2", "old3"], t0, 14.0));
        let mut ids: Vec<String> = (0..10).map(|i| format!("new{i}")).collect();
        ids.extend(["old1", "old2", "old3"].iter().map(|s| s.to_string()));
        let entries: Vec<ListingRef> = (0..10).map(|i| listing(&format!("new{i}"), 9.0, t0 + HOUR, "Other")).collect();
        sample(&mut st, t0 + HOUR, &Response { total: 13, ids, entries });
        ok &= check(
            "4. 押し出されただけの出品は売れた扱いにしない",
            gone_count(&st) == 0,
            format!("消えた {} / 追跡 {}", gone_count(&st), st.tracked.len()),
        );
    }

    // 5. 値段の付け替え (消えた直後に同じ出品者が並べ直す) は売れた件数に数えない
    {
        let mut st = WatchState::default();
        let a = listing("a", 10.0, t0 - 2 * HOUR, "S1");
        let b = listing("b", 11.0, t0 - 2 * HOUR, "S2");
        sample(&mut st, t0, &Response { total: 2, ids: vec!["a".into(), "b".into()], entries: vec![a, b.clone()] });
        let t1 = t0 + HOUR;
        let c = listing("c", 9.0, t1 - 60, "S1"); // 同じ出品者が 1 分前に並べ直した
        sample(&mut st, t1, &Response { total: 2, ids: vec!["b".into(), "c".into()], entries: vec![b.clone(), c.clone()] });
        sample(&mut st, t1 + HOUR, &Response { total: 2, ids: vec!["b".into(), "c".into()], entries: vec![b, c] });
        let relisted = st.tracked.iter().filter(|t| t.relisted && t.gone_at.is_some()).count();
        ok &= check(
            "5. 同じ出品者がまだ並べている分は売れた扱いにしない",
            relisted == 1 && gone_count(&st) == 0 && daily_gone(&st) == 0,
            format!("並べ直し {relisted} / 売れた {} / 日次 {}", gone_count(&st), daily_gone(&st)),
        );
    }

    // 6. 消えた扱いの出品がまた現れたら生き返らせ、日次の件数も戻す
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c"], t0, 10.0));
        sample(&mut st, t0 + HOUR, &shop(&["a", "b"], t0, 10.0));
        sample(&mut st, t0 + 2 * HOUR, &shop(&["a", "b"], t0, 10.0));
        let after_gone = (gone_count(&st), daily_gone(&st));
        sample(&mut st, t0 + 3 * HOUR, &shop(&["a", "b", "c"], t0, 10.0));
        let after_revive = (gone_count(&st), daily_gone(&st));
        ok &= check(
            "6. 戻ってきた出品は売れた件数から取り消す",
            after_gone == (1, 1) && after_revive == (0, 0),
            format!("消えた直後 {after_gone:?} → 復活後 {after_revive:?}"),
        );
    }

    // 7. 7 日を超えた追跡は日次に畳んで捨てる (キャッシュが膨らまない)
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b"], t0, 10.0));
        sample(&mut st, t0 + 8 * 24 * HOUR, &shop(&["a", "b"], t0, 10.0));
        let survived: u32 = st.daily.iter().map(|d| d.survived).sum();
        ok &= check(
            "7. 7 日を超えた追跡は畳んで捨てる",
            st.tracked.is_empty() && survived == 2,
            format!("残り {} 件 / 売れ残り {survived} 件", st.tracked.len()),
        );
    }

    println!("\n{}", if ok { "全部 OK" } else { "NG あり" });
    if !ok {
        std::process::exit(1);
    }
}

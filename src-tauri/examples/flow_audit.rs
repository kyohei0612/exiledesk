//! flow_audit.rs — 捌き速度の判定をダミーデータで総点検する (2026-09-17)
//!
//! オーナー指示:「ダミーでテストよろしく。レート制限に引っかからないように
//! 最初はダミーで仕組みだけ堅牢にしてからテストで取ってくれ」。
//!
//! 実際に踏んだ事故を全部シナリオにして、判定が間違わないことを確かめる。
//! 公式 API は一切叩かない (全部この中で作ったダミーの応答)。
//!
//!   cargo run --example flow_audit
use std::collections::HashSet;

use exiledesk_lib::market_flow::{apply_confirm, apply_sample, prune, ListingRef, WatchState};

const HOUR: i64 = 3600;

fn listing(id: &str, price: f64, listed_at: i64) -> ListingRef {
    ListingRef { id: id.to_string(), amount: Some(price), currency: Some("divine".to_string()), listed_at: Some(listed_at), account: None }
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
/// 2026-09-17 以降、検索結果だけでは「消えた = 売れた」と判定しない
/// (securable = 即時購入のみ は出品者の状況で出入りするため)。
/// 消えた候補は ID を直接 fetch して実在を確かめてから判定する = confirm。
fn sample(state: &mut WatchState, now: i64, r: &Response) {
    apply_sample(state, now, r.total, &r.ids, &r.entries, false);
    prune(state, now);
}

/// 消えた候補を直接 fetch で確かめる (alive に入っていない物が売れた扱いになる)
fn confirm(state: &mut WatchState, now: i64, checked: &[&str], alive: &[&str]) {
    let checked: Vec<String> = checked.iter().map(|s| s.to_string()).collect();
    let alive: HashSet<String> = alive.iter().map(|s| s.to_string()).collect();
    apply_confirm(state, now, &checked, &alive);
}

fn gone_count(state: &WatchState) -> usize {
    state.tracked.iter().filter(|t| t.gone_at.is_some()).count()
}
fn alive_count(state: &WatchState) -> usize {
    state.tracked.iter().filter(|t| t.gone_at.is_none()).count()
}

fn check(name: &str, ok: bool, detail: String) -> bool {
    println!("{} {name}\n    {detail}", if ok { "[OK]  " } else { "[NG]  " });
    ok
}

/// 出品 10 件を並べた応答を作る
fn shop(ids: &[&str], now: i64, price: f64) -> Response {
    let entries: Vec<ListingRef> = ids.iter().take(10).map(|i| listing(i, price, now - 2 * HOUR)).collect();
    Response { total: ids.len() as u64, ids: ids.iter().map(|s| s.to_string()).collect(), entries }
}

fn main() {
    let t0 = 1_700_000_000i64;
    let mut ok = true;

    // ------------------------------------------------------------------
    // 1. 普通に売れた: 1 件ずつ消えるのは売れたと数えてよい
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c", "d", "e"], t0, 10.0));
        sample(&mut st, t0 + HOUR, &shop(&["b", "c", "d", "e"], t0, 10.0));
        confirm(&mut st, t0 + HOUR, &["a"], &[]); // 直接照会でも居ない = 売れた
        sample(&mut st, t0 + 2 * HOUR, &shop(&["c", "d", "e"], t0, 10.0));
        let before_confirm = gone_count(&st);
        confirm(&mut st, t0 + 2 * HOUR, &["b"], &[]);
        ok &= check(
            "1. 直接照会で居なければ売れた扱い (検索だけでは判定しない)",
            before_confirm == 1 && gone_count(&st) == 2,
            format!("確認前 {before_confirm} → 確認後 {} / 追跡中 {}", gone_count(&st), alive_count(&st)),
        );
    }

    // ------------------------------------------------------------------
    // 2. 即時購入から一斉に外れた (寝落ちやまとめ引き上げ): 安い在庫がまとめて消える
    //    → 検索結果だけで「売れた」にしない。直接照会で生きていれば無傷
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c", "d", "e", "f", "g", "h"], t0, 9.0));
        // 8 件中 7 件が同時に消えたように見える応答
        let r = shop(&["h"], t0, 30.0);
        sample(&mut st, t0 + HOUR, &r);
        let after_search = gone_count(&st);
        // 確認 fetch: 実際には全部生きていた (オフラインなだけ)
        let checked: Vec<String> = ["a", "b", "c", "d", "e", "f", "g"].iter().map(|s| s.to_string()).collect();
        let alive: HashSet<String> = checked.iter().cloned().collect();
        apply_confirm(&mut st, t0 + HOUR, &checked, &alive);
        ok &= check(
            "2. 一斉消失は売れた扱いにしない (寝落ち / 条件ズレ)",
            after_search == 0 && gone_count(&st) == 0,
            format!("検索後の消えた {after_search} / 確認後の消えた {}", gone_count(&st)),
        );
    }

    // ------------------------------------------------------------------
    // 3. 一斉消失が本物だった場合: 確認 fetch で居なければ、そこで売れたと数える
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c", "d", "e", "f"], t0, 9.0));
        let r = shop(&["f"], t0, 30.0);
        sample(&mut st, t0 + HOUR, &r);
        let checked: Vec<String> = ["a", "b", "c", "d", "e"].iter().map(|s| s.to_string()).collect();
        apply_confirm(&mut st, t0 + HOUR, &checked, &HashSet::new());
        ok &= check("3. 本当に消えていれば確認 fetch で売れた扱い", gone_count(&st) == 5, format!("消えた {}", gone_count(&st)));
    }

    // ------------------------------------------------------------------
    // 4. 応答が空 (通信不良や一時的な 0 件) で全滅させない
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c"], t0, 10.0));
        sample(&mut st, t0 + HOUR, &Response { total: 0, ids: vec![], entries: vec![] });
        ok &= check("4. 空の応答で全部売れたにしない", gone_count(&st) == 0, format!("消えた {}", gone_count(&st)));
    }

    // ------------------------------------------------------------------
    // 5. 安い出品が増えて窓から押し出されただけ (ID 一覧には居る) → 売れていない
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["old1", "old2", "old3"], t0, 14.0));
        // 新しい安い出品が 10 件入り、old は 11 番目以降に押し下げられた (ID 一覧には残る)
        let mut ids: Vec<String> = (0..10).map(|i| format!("new{i}")).collect();
        ids.extend(["old1", "old2", "old3"].iter().map(|s| s.to_string()));
        let entries: Vec<ListingRef> = (0..10).map(|i| listing(&format!("new{i}"), 9.0, t0 + HOUR)).collect();
        sample(&mut st, t0 + HOUR, &Response { total: 13, ids, entries });
        ok &= check("5. 押し出されただけの出品は売れた扱いにしない", gone_count(&st) == 0, format!("消えた {} / 追跡 {}", gone_count(&st), st.tracked.len()));
    }

    // ------------------------------------------------------------------
    // 6. 出品が 100 件超: ID 一覧に載らない分は保留し、確認 fetch で決める
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c"], t0, 10.0));
        // 総数 150、ID は安い順 100 件だけ。a は 101 番目以降に沈んだ
        let ids: Vec<String> = (0..100).map(|i| format!("x{i}")).collect();
        let entries: Vec<ListingRef> = (0..10).map(|i| listing(&format!("x{i}"), 5.0, t0 + HOUR)).collect();
        sample(&mut st, t0 + HOUR, &Response { total: 150, ids, entries });
        let deferred = gone_count(&st);
        // 確認 fetch: a はまだ出品されていた / b と c は本当に消えた
        let checked: Vec<String> = ["a", "b", "c"].iter().map(|s| s.to_string()).collect();
        let alive: HashSet<String> = ["a".to_string()].into_iter().collect();
        apply_confirm(&mut st, t0 + HOUR, &checked, &alive);
        ok &= check(
            "6. 101 件目以降は保留してから確認 fetch で判定",
            deferred == 0 && gone_count(&st) == 2,
            format!("保留中の消えた {deferred} / 確認後 {}", gone_count(&st)),
        );
    }

    // ------------------------------------------------------------------
    // 7. 消えた扱いの出品がまた現れたら生き返らせ、日次の消えた件数も戻す
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b", "c"], t0, 10.0));
        sample(&mut st, t0 + HOUR, &shop(&["a", "b"], t0, 10.0));
        confirm(&mut st, t0 + HOUR, &["c"], &[]); // いったん売れた扱いになる
        let after_gone = (gone_count(&st), st.daily.iter().map(|d| d.gone).sum::<u32>());
        sample(&mut st, t0 + 2 * HOUR, &shop(&["a", "b", "c"], t0, 10.0));
        let after_revive = (gone_count(&st), st.daily.iter().map(|d| d.gone).sum::<u32>());
        ok &= check(
            "7. 戻ってきた出品は売れた件数から取り消す",
            after_gone == (1, 1) && after_revive == (0, 0),
            format!("消えた直後 {after_gone:?} → 復活後 {after_revive:?}"),
        );
    }

    // ------------------------------------------------------------------
    // 8. 7 日を超えた追跡は日次に畳んで捨てる (キャッシュが膨らまない)
    // ------------------------------------------------------------------
    {
        let mut st = WatchState::default();
        sample(&mut st, t0, &shop(&["a", "b"], t0, 10.0));
        sample(&mut st, t0 + 8 * 24 * HOUR, &shop(&["a", "b"], t0, 10.0));
        let survived: u32 = st.daily.iter().map(|d| d.survived).sum();
        ok &= check("8. 7 日を超えた追跡は畳んで捨てる", st.tracked.is_empty() && survived == 2, format!("残り {} 件 / 売れ残り {survived} 件", st.tracked.len()));
    }

    println!("\n{}", if ok { "全部 OK" } else { "NG あり" });
    if !ok {
        std::process::exit(1);
    }
}

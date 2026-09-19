//! market_flow/tally.rs — 取った出品を記録に畳み込む (純粋関数)
//!
//! 「消えた = 売れた」「値下げに追従」「一覧から溢れた分は直接照会」「7 日で掃除」を
//! 決めているのはここ。**通信もファイル I/O もしない**ので、判定を変える時はここだけ見る。
//! 巡回 (いつ・何本投げるか) は sweep 側、保存とコマンドは親モジュール。
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。テストは親の mod tests のまま。
use super::*;

/// 検索の ID 一覧が「出品全部」を含んでいるか。
///
/// ここが true の時だけ「一覧に無い = 売れた」と判定してよい。
///   - ID が総数に届いていない (出品 100 件超で切れている) → 判定しない
///   - 応答が空なのに追跡中がある (通信不良など) → 判定しない
/// 自動巡回と手動取得で同じ式を使うため関数にしてある (2026-09-17 レビュー指摘)
pub fn list_is_complete(ids: &[String], total: u64, tracked: &[Tracked]) -> bool {
    ids.len() as u64 >= total && !(ids.is_empty() && !tracked.is_empty())
}

/// trade2 の出品時刻 ("2026-09-16T10:00:00Z") を unix 秒に。chrono を足さずに手で読む
pub fn parse_indexed(indexed: &str) -> Option<i64> {
    if indexed.len() < 19 {
        return None;
    }
    let num = |s: &str| -> Option<i64> { s.parse::<i64>().ok() };
    let y = num(&indexed[0..4])?;
    let mo = num(&indexed[5..7])?;
    let d = num(&indexed[8..10])?;
    let h = num(&indexed[11..13])?;
    let mi = num(&indexed[14..16])?;
    let sec = num(&indexed[17..19])?;
    // Howard Hinnant の days_from_civil
    let y_adj = if mo <= 2 { y - 1 } else { y };
    let era = if y_adj >= 0 { y_adj } else { y_adj - 399 } / 400;
    let yoe = y_adj - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + h * 3600 + mi * 60 + sec)
}

// ============================================================================
// 集計の本体 (テストしやすいよう HTTP から分離)
// ============================================================================

/// 1 回のサンプルを状態に反映する。
///
/// * `ids` … search が返した ID 一覧 (価格の安い順、最大 100)
/// * `entries` … 最安 10 件 (値段つき)。新規は追跡に入れる
/// * `list_complete` … `ids` が出品全部を含んでいるか (総数 < 100 なら true)。
///   true の時だけ「一覧に無い = 消えた」と判断できる。
/// 一覧が切れている時 (出品 100 件超) は、載っていない追跡分を「値段で沈んだ」と数える。
/// BURIED_MAX 回続いたら prune で追跡をやめる (最安帯の捌け方を測るのが目的なので)。
/// 自動経路 / 手動経路で同じ処理 (以前は 3 か所にコピーがあった 2026-09-18)
pub fn mark_buried(state: &mut WatchState, ids: &[String], list_complete: bool) {
    if list_complete || ids.is_empty() {
        return;
    }
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    for t in state.tracked.iter_mut() {
        if t.gone_at.is_none() && !present.contains(t.id.as_str()) {
            t.buried = t.buried.saturating_add(1);
        }
    }
}

pub fn apply_sample(
    state: &mut WatchState,
    now: i64,
    total: u64,
    ids: &[String],
    entries: &[ListingRef],
    list_complete: bool,
) {
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    // 今回の応答に出てきた中で、既に追跡している ID (並べ直しの判定に使う)
    let known_ids: HashSet<String> = state.tracked.iter().map(|t| t.id.clone()).collect();
    let mut gone_now = 0u32;
    // 生き返った出品が「消えた」として数えられていた日 (集計から引く)
    let mut revived_days: Vec<i64> = Vec::new();

    for t in state.tracked.iter_mut() {
        if t.gone_at.is_some() {
            // 消えた扱いにした出品がまた現れたら生き返らせる (取り下げでも売却でもなかった)
            if present.contains(t.id.as_str()) {
                // 付け替え扱いの分は売れた件数に入れていないので、日次からも引かない
                if let (Some(g), false) = (t.gone_at, t.relisted) {
                    revived_days.push(day_of(g));
                }
                t.gone_at = None;
                t.relisted = false;
                t.last_seen = now;
                t.buried = 0;
            }
            continue;
        }
        if present.contains(t.id.as_str()) {
            t.last_seen = now;
            t.buried = 0;
        } else if list_complete {
            // 出品全部が見えている状態で一覧に無い = 売れたか取り下げた。
            // ただし同じ出品者が 5 分以内に並べ直していれば、値段の付け替えとみなす
            // 前回この出品を見た時刻より後に、同じ出品者が新しく並べていれば付け替えとみなす
            let since = t.last_seen - RELIST_SLACK_SECS;
            let relisted = t.account.as_deref().is_some_and(|acc| {
                entries.iter().any(|e| {
                    e.account.as_deref() == Some(acc)
                        && !known_ids.contains(&e.id)
                        && e.listed_at.map(|at| at >= since && at <= now + RELIST_SLACK_SECS).unwrap_or(false)
                })
            });
            t.gone_at = Some(now);
            t.relisted = relisted;
            if !relisted {
                gone_now += 1;
            }
        }
        // list_complete でない時は判断を保留 (一覧が切れているので「消えた」とは言えない)
    }

    // 値段の取り直し: 追跡中の出品が最安 10 件に入っていたら、今の値段に更新する。
    // 出品者が値下げしても ID は変わらないので、更新しないと売れたリストの値段が古いままになる
    // (2026-09-17 オーナー指摘)。出品時刻は最初に見た値のままにする (寿命の起点を動かさない)
    for e in entries {
        if let Some(t) = state.tracked.iter_mut().find(|t| t.id == e.id && t.gone_at.is_none()) {
            if e.amount.is_some() {
                t.amount = e.amount;
                t.currency = e.currency.clone();
            }
            if t.account.is_none() {
                t.account = e.account.clone();
            }
        }
    }

    // 新しく見えた最安 10 件を追跡に入れる
    let known: HashSet<String> = state.tracked.iter().map(|t| t.id.clone()).collect();
    let mut added_now = 0u32;
    for e in entries {
        if known.contains(&e.id) {
            continue;
        }
        state.tracked.push(Tracked {
            id: e.id.clone(),
            listed_at: e.listed_at,
            first_seen: now,
            last_seen: now,
            gone_at: None,
            amount: e.amount,
            currency: e.currency.clone(),
            account: e.account.clone(),
            buried: 0,
            relisted: false,
        });
        added_now += 1;
    }

    state.total = total;
    state.sampled_at = now;
    if let Some(first) = entries.first() {
        state.cheapest_amount = first.amount;
        state.cheapest_currency = first.currency.clone();
    }
    // 誤って「消えた」と数えた分を日次集計から取り消す
    for day in revived_days {
        if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
            d.gone = d.gone.saturating_sub(1);
        }
    }
    bump_daily(state, now, added_now, gone_now, 0, total);
}


fn day_of(t: i64) -> i64 {
    t - t.rem_euclid(86_400)
}

fn bump_daily(state: &mut WatchState, now: i64, added: u32, gone: u32, survived: u32, total: u64) {
    bump_daily_full(state, now, added, gone, survived, 0, total);
}
fn bump_daily_full(state: &mut WatchState, now: i64, added: u32, gone: u32, survived: u32, buried: u32, total: u64) {
    let day = day_of(now);
    if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
        d.added += added;
        d.gone += gone;
        d.survived += survived;
        d.buried += buried;
        d.total_avg = (d.total_avg * d.samples as f64 + total as f64) / (d.samples + 1) as f64;
        d.samples += 1;
    } else {
        state.daily.push(Daily { day, added, gone, survived, buried, total_avg: total as f64, samples: 1 });
    }
    if state.daily.len() > DAILY_MAX_DAYS {
        let cut = state.daily.len() - DAILY_MAX_DAYS;
        state.daily.drain(0..cut);
    }
}

/// キャッシュを膨らませないための掃除 (オーナー指示: 1 ID は 1 週間)
pub fn prune(state: &mut WatchState, now: i64) {
    let mut survived = 0u32;
    let mut buried = 0u32;
    // 値段で沈んだ出品は追うのをやめる (確認 fetch の枠を、最安帯の判定に使うため)
    state.tracked.retain(|t| {
        if t.gone_at.is_none() && t.buried >= BURIED_MAX {
            buried += 1;
            false
        } else {
            true
        }
    });
    if buried > 0 {
        bump_daily_full(state, now, 0, 0, 0, buried, state.total);
    }
    state.tracked.retain(|t| {
        match t.gone_at {
            // 消えた記録は 7 日で捨てる (それまでは寿命の計算に使う)
            Some(g) => now - g < TRACK_MAX_SECS,
            // 生きたまま 7 日を超えた物は「7 日でも売れなかった」として集計に畳んで捨てる
            // 起点は寿命と同じ「出品時刻」に揃える (初見起点だと実質 7 日以上追ってしまう)
            None => {
                if now - t.start() >= TRACK_MAX_SECS {
                    survived += 1;
                    false
                } else {
                    true
                }
            }
        }
    });
    if survived > 0 {
        bump_daily(state, now, 0, 0, survived, state.total);
    }
    // 上限を超えたら古い物から捨てる。捨てた生存分は集計に残す
    // (黙って消すと「売れなかった物だけが静かに減る」形になる。2026-09-17 レビュー指摘)。
    // 活発な銘柄 (毎巡 10 件追加) だと 7 日を待たずに上限で切れるので、中央値の母数は実質 2〜3 日分
    if state.tracked.len() > TRACK_MAX_PER_WATCH {
        state.tracked.sort_by_key(|t| t.first_seen);
        let cut = state.tracked.len() - TRACK_MAX_PER_WATCH;
        let dropped: Vec<Tracked> = state.tracked.drain(0..cut).collect();
        let unsold = dropped.iter().filter(|t| t.gone_at.is_none()).count() as u32;
        if unsold > 0 {
            bump_daily(state, now, 0, 0, unsold, state.total);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;


    fn lr(id: &str, amount: f64) -> ListingRef {
        ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: None , account: None }
    }

    fn lr_at(id: &str, amount: f64, listed_at: i64) -> ListingRef {
        ListingRef { id: id.to_string(), amount: Some(amount), currency: Some("exalted".into()), listed_at: Some(listed_at) , account: None }
    }


    /// 出品時刻が取れていれば、こちらが見つけた時刻ではなく出品時刻から齢を数える
    #[test]
    fn age_counts_from_listed_at() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        // 17 時間前に出品された物を今見つけた
        apply_sample(&mut st, t0, 1, &["a".into()], &[lr_at("a", 43.0, t0 - 17 * 3600)], true);
        let t = &st.tracked[0];
        assert_eq!(t.entry_age(), 17 * 3600);
        assert_eq!(t.age(t0), 17 * 3600);
        // 1 時間後に消えたら寿命は 18 時間
        apply_sample(&mut st, t0 + 3600, 0, &[], &[], true);
        assert_eq!(st.tracked[0].age(t0 + 3600), 18 * 3600);
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
        apply_sample(&mut st, t0, 10, &old, &old_entries, true);
        assert_eq!(st.tracked.len(), 10);

        // 40 神が 20 件参戦。search の一覧には新旧 30 件すべてが入る
        let new: Vec<String> = (0..20).map(|i| format!("new{i}")).collect();
        let mut all = new.clone();
        all.extend(old.clone());
        let new_top: Vec<ListingRef> = new.iter().take(10).map(|id| lr(id, 40.0)).collect();
        apply_sample(&mut st, t0 + 3600, 30, &all, &new_top, true);

        // 50 神は 1 件も消えていない
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
        // 新しい 10 件が追跡に加わっている
        assert_eq!(st.tracked.len(), 20);
    }


    /// 一覧から消えたら売れた扱い。寿命が入る
    #[test]
    fn disappearing_listing_gets_lifetime() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 2, &["a".into(), "b".into()], &[lr("a", 40.0), lr("b", 41.0)], true);
        apply_sample(&mut st, t0 + 7200, 1, &["b".into()], &[lr("b", 41.0)], true);
        let gone: Vec<&Tracked> = st.tracked.iter().filter(|t| t.gone_at.is_some()).collect();
        assert_eq!(gone.len(), 1);
        assert_eq!(gone[0].id, "a");
        assert_eq!(gone[0].age(t0 + 7200), 7200);
    }


    /// 総数が 100 以上 (一覧が途中まで) の時は勝手に消えた判定をしない
    #[test]
    fn incomplete_list_does_not_mark_gone() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 150, &["a".into()], &[lr("a", 40.0)], false);
        apply_sample(&mut st, t0 + 3600, 150, &["z".into()], &[lr("z", 39.0)], false);
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
    }


    /// 消えた扱いにした出品が再び現れたら生き返る (出品者が一時的にオフラインだった等)
    #[test]
    fn reappearing_listing_revives() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 1, &["a".into()], &[lr("a", 40.0)], true);
        apply_sample(&mut st, t0 + 3600, 0, &[], &[], true);
        assert!(st.tracked[0].gone_at.is_some());
        apply_sample(&mut st, t0 + 7200, 1, &["a".into()], &[lr("a", 40.0)], true);
        assert!(st.tracked[0].gone_at.is_none(), "再び見えたら生存に戻す");
    }


    /// 生き返った出品は日次の「消えた」からも引く
    #[test]
    fn revive_undoes_daily_gone() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".to_string()), listed_at: None , account: None };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        // b が一時的に見えなくなる
        apply_sample(&mut st, now + 600, 1, &["a".into()], &[e("a")], true);
        assert_eq!(st.daily[0].gone, 1);
        // また現れた: 売れていない
        apply_sample(&mut st, now + 1200, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        assert_eq!(st.daily[0].gone, 0, "日次の消えた件数も戻す");
        assert!(st.tracked.iter().all(|t| t.gone_at.is_none()));
    }


    /// 追跡中の出品が値下げされたら、記録の値段も追従する
    #[test]
    fn price_is_refreshed_for_tracked_listings() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str, amt: f64| ListingRef { id: id.into(), amount: Some(amt), currency: Some("divine".into()), listed_at: Some(now - 3600), account: Some("Seller#1".into()) };
        apply_sample(&mut st, now, 1, &["a".into()], &[e("a", 10.0)], false);
        apply_sample(&mut st, now + 7200, 1, &["a".into()], &[e("a", 7.0)], false);
        let t = st.tracked.iter().find(|t| t.id == "a").unwrap();
        assert_eq!(t.amount, Some(7.0), "値下げが反映される");
        assert_eq!(t.listed_at, Some(now - 3600), "出品時刻は動かさない");
        assert_eq!(st.tracked.len(), 1, "同じ ID を二重に追跡しない");
    }


    /// 売れた直後に同じ出品者が並べ直した分は、売れた件数に数えない
    #[test]
    fn immediate_relist_is_not_counted_as_sold() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let l = |id: &str, amt: f64, acc: &str, at: i64| ListingRef {
            id: id.into(),
            amount: Some(amt),
            currency: Some("divine".into()),
            listed_at: Some(at),
            account: Some(acc.into()),
        };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[l("a", 10.0, "S1", now - 7200), l("b", 11.0, "S2", now - 7200)], true);
        // a が消え、同じ出品者 S1 が 1 分前に並べ直した新しい出品 c が出ている
        let t1 = now + 3600;
        apply_sample(&mut st, t1, 2, &["b".into(), "c".into()], &[l("b", 11.0, "S2", now - 7200), l("c", 9.0, "S1", t1 - 60)], true);
        let a = st.tracked.iter().find(|t| t.id == "a").unwrap();
        assert!(a.gone_at.is_some(), "一覧から消えたことは記録する");
        assert!(a.relisted, "並べ直しとして印を付ける");
        assert_eq!(st.daily.iter().map(|d| d.gone).sum::<u32>(), 0, "売れた件数には数えない");

        // 別の出品者が時間を空けて出した場合は売れた扱い
        let t2 = t1 + 3600;
        apply_sample(&mut st, t2, 1, &["c".into()], &[l("c", 9.0, "S1", t1 - 60)], true);
        let b = st.tracked.iter().find(|t| t.id == "b").unwrap();
        assert!(b.gone_at.is_some() && !b.relisted, "並べ直しでなければ売れた扱い");
        assert_eq!(st.daily.iter().map(|d| d.gone).sum::<u32>(), 1);
    }


    /// 一覧が 100 件で切れている時、載っていない追跡分は「沈んだ」として追跡をやめる
    #[test]
    fn buried_listings_stop_being_tracked() {
        let now = 1_700_000_000i64;
        let mut st = WatchState::default();
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(5.0), currency: Some("divine".into()), listed_at: None, account: None };
        apply_sample(&mut st, now, 150, &["a".into(), "b".into()], &[e("a"), e("b")], false);
        // b が一覧 (切れている) に載らない状態が 3 回続く
        for i in 1..=3 {
            let ids = vec!["a".to_string()];
            let present: std::collections::HashSet<&str> = ids.iter().map(String::as_str).collect();
            apply_sample(&mut st, now + i * 7200, 150, &ids, &[e("a")], false);
            for t in st.tracked.iter_mut() {
                if t.gone_at.is_none() && !present.contains(t.id.as_str()) {
                    t.buried += 1;
                }
            }
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
        let e = |id: &str| ListingRef { id: id.into(), amount: Some(1.0), currency: Some("divine".into()), listed_at: None , account: None };
        apply_sample(&mut st, now, 2, &["a".into(), "b".into()], &[e("a"), e("b")], true);
        // 空の応答 (total 0 / ID 0 件)
        let ids: Vec<String> = Vec::new();
        let list_complete = list_is_complete(&ids, 0, &st.tracked);
        assert!(!list_complete, "空の応答では消えた判定をしない");
        apply_sample(&mut st, now + 3600, 0, &ids, &[], list_complete);
        assert_eq!(st.tracked.iter().filter(|t| t.gone_at.is_some()).count(), 0);
    }


    /// 7 日を超えて生き残った出品は集計に畳んで捨てる (キャッシュを膨らませない)
    #[test]
    fn prune_drops_after_a_week() {
        let mut st = WatchState::default();
        let t0 = 1_700_000_000;
        apply_sample(&mut st, t0, 1, &["a".into()], &[lr("a", 40.0)], true);
        prune(&mut st, t0 + TRACK_MAX_SECS + 60);
        assert!(st.tracked.is_empty());
        assert_eq!(st.daily.iter().map(|d| d.survived).sum::<u32>(), 1);
    }
}

//! market_flow/tally.rs — 取った出品を記録に畳み込む (純粋関数)
//!
//! 「2 回続けて消えた = 売れた」「値下げに追従」「一覧から溢れた分は沈んだ扱い」「7 日で掃除」を
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

/// fetch の応答 (`{ result: [...] }`) を出品 1 件ずつに読む
pub fn parse_fetch_result(v: &serde_json::Value) -> Vec<ListingRef> {
    let Some(arr) = v.get("result").and_then(|x| x.as_array()) else { return Vec::new() };
    arr.iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(|x| x.as_str())?;
            let listing = item.get("listing");
            let price = listing.and_then(|l| l.get("price"));
            Some(ListingRef {
                id: id.to_string(),
                amount: price.and_then(|p| p.get("amount")).and_then(|x| x.as_f64()),
                currency: price.and_then(|p| p.get("currency")).and_then(|x| x.as_str()).map(str::to_string),
                account: listing.and_then(|l| l.get("account")).and_then(|a| a.get("name")).and_then(|x| x.as_str()).map(str::to_string),
                listed_at: listing.and_then(|l| l.get("indexed")).and_then(|x| x.as_str()).and_then(parse_indexed),
            })
        })
        .collect()
}

/// 最安 10 件の外で、追加に出品者を取りに行く上限 (fetch 10 件 × 2 回)
pub const EXTRA_DETAIL_MAX: usize = 20;

/// 消えた出品がある巡で、付け替えの判定のために追加で出品者を取る ID (2026-09-26 オーナー承認)。
///
/// 値段を上げて並べ直した出品は最安 10 件の外に出るので、10 件の詳細だけでは同じ出品者か分からない。
/// 一覧の 11 件目以降で、出品者を知らない物 (追跡していない / 追跡しているが出品者不明) を安い順に最大 20 件。
/// 消えた出品が無い巡・一覧が切れている巡 (そもそも判定しない) は空。
pub fn extra_detail_ids(state: &WatchState, ids: &[String], list_complete: bool) -> Vec<String> {
    if !list_complete {
        return Vec::new();
    }
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let vanished = state.tracked.iter().any(|t| t.gone_at.is_none() && !present.contains(t.id.as_str()));
    if !vanished {
        return Vec::new();
    }
    let known: HashSet<&str> = state.tracked.iter().filter(|t| t.account.is_some()).map(|t| t.id.as_str()).collect();
    ids.iter().skip(10).filter(|id| !known.contains(id.as_str())).take(EXTRA_DETAIL_MAX).cloned().collect()
}

/// その巡の詳細取得 (最安 10 件の fetch) で出品者が取れたか。
///
/// 取れていない巡は「同じ出品者が並べ直したか」を見られないので、消えた判定をしない (2026-09-26 監査)。
/// `requested` はその巡で詳細を取りに行った件数 (0 なら取る物が無かっただけなので失敗ではない)
pub fn fetch_details_ok(requested: usize, entries: &[ListingRef]) -> bool {
    requested == 0 || entries.iter().any(|e| e.account.is_some())
}

/// 1 回のサンプルを状態に反映する。
///
/// * `ids` … search が返した ID 一覧 (価格の安い順、最大 100)
/// * `entries` … 最安 10 件 (値段・出品者つき)。新規は追跡に入れる
/// * `list_complete` … `ids` が出品全部を含んでいるか (総数 < 100 なら true)。
///   true の時だけ「一覧に無い = 消えた」と判断できる。
/// * `details` … その巡の出品者の情報。`None` = 取れなかった / 見送った ([`fetch_details_ok`]) ので、
///   消えた判定を進めない (確定待ちもそのまま)。`Some(extra)` の extra は最安 10 件の外で追加に取った出品
///   ([`extra_detail_ids`])。付け替えの判定 (出品者が今も並べているか) にだけ使い、追跡には入れない
///
/// ## 売れた判定 (2026-09-26 監査で厳しくした)
///   1. 一覧から消えた 1 回目は「確定待ち」(missing_since = その時刻) にするだけ
///   2. 次の判定できる巡でも居なければ確定。消えた時刻は**最初に居なかった時刻**
///      (途中で戻ってきたら確定待ちを取り消す)
///   3. 確定した時、同じ出品者が**今この条件で 1 件でも並べていれば**値段の付け替え (relisted)。
///      見るのは今回の最安 10 件の出品者、消えた物がある巡に追加で取る 11 件目以降 (最大 20 件)、
///      追跡中で今回の一覧に居る出品の出品者
///      (新しい ID だけ・最安 10 件だけを見ていた頃は、古い出品を残したまま 1 件下げただけの人を売れたと数えていた)
///   4. 出品時刻か出品者が分からない物は unknown (売れたとは言えないので数えない)
/// 売れた件数 (日次の gone) に入るのは 1〜4 を抜けた物だけ。
pub fn apply_sample(
    state: &mut WatchState,
    now: i64,
    total: u64,
    ids: &[String],
    entries: &[ListingRef],
    list_complete: bool,
    details: Option<&[ListingRef]>,
) {
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    // 今この条件で並べている出品者 = 今回取った最安 10 件 + 追加で取った 11 件目以降 (今回の一覧に居る物)
    // + 追跡中で今回の一覧に居る出品の出品者
    let live_sellers: HashSet<String> = entries
        .iter()
        .chain(details.unwrap_or(&[]).iter().filter(|e| present.contains(e.id.as_str())))
        .filter_map(|e| e.account.clone())
        .chain(
            state
                .tracked
                .iter()
                .filter(|t| t.gone_at.is_none() && present.contains(t.id.as_str()))
                .filter_map(|t| t.account.clone()),
        )
        .collect();
    // 売れたと確定した出品の「消えた日」(日次の gone に足す)
    let mut sold_days: Vec<i64> = Vec::new();
    // 生き返った出品が「売れた」として数えられていた日 (集計から引く)
    let mut revived_days: Vec<i64> = Vec::new();

    for t in state.tracked.iter_mut() {
        if t.gone_at.is_some() {
            // 消えた扱いにした出品がまた現れたら生き返らせる (取り下げでも売却でもなかった)
            if present.contains(t.id.as_str()) {
                // 売れた件数に入れていた分だけ日次から引く (付け替え・不明は入れていない)
                if let (Some(g), false, false) = (t.gone_at, t.relisted, t.unknown) {
                    revived_days.push(day_of(g));
                }
                t.gone_at = None;
                t.relisted = false;
                t.unknown = false;
                t.missing_since = None;
                t.last_seen = now;
                t.buried = 0;
            }
            continue;
        }
        if present.contains(t.id.as_str()) {
            // 居る。確定待ちだった物は取り消し (1 回だけ一覧から外れていた)
            t.last_seen = now;
            t.buried = 0;
            t.missing_since = None;
            t.relisted = false;
            continue;
        }
        if !list_complete || details.is_none() {
            // 一覧が切れている / 出品者が取れなかった巡は判断を保留 (確定待ちもそのまま)
            continue;
        }
        // 同じ出品者が今この条件で並べているか (確定待ちの間に 1 回でも見えたら付け替え)
        let seller_live = t.account.as_deref().is_some_and(|acc| live_sellers.contains(acc));
        match t.missing_since {
            None => {
                // 1 回目: 確定待ちにするだけ
                t.missing_since = Some(now);
                t.relisted = seller_live;
            }
            Some(first) => {
                // 2 回続けて居ない: 確定。消えた時刻は最初に居なかった時刻
                t.gone_at = Some(first);
                t.missing_since = None;
                t.relisted = t.relisted || seller_live;
                t.unknown = !t.relisted && (t.listed_at.is_none() || t.account.is_none());
                if !t.relisted && !t.unknown {
                    sold_days.push(day_of(first));
                }
            }
        }
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
            missing_since: None,
            unknown: false,
        });
        added_now += 1;
    }

    state.total = total;
    state.sampled_at = now;
    if let Some(first) = entries.first() {
        state.cheapest_amount = first.amount;
        state.cheapest_currency = first.currency.clone();
    }
    // 誤って「売れた」と数えた分を日次集計から取り消す
    for day in revived_days {
        if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
            d.gone = d.gone.saturating_sub(1);
        }
    }
    bump_daily(state, now, added_now, 0, 0, total);
    // 売れた件数は「最初に居なかった日」に足す (生き返った時に引く日と揃える)
    for day in sold_days {
        add_gone_on(state, day);
    }
}

/// 指定した日の「売れた」を 1 つ足す。その日の行が無ければ作る (日付順を保つ)
fn add_gone_on(state: &mut WatchState, day: i64) {
    if let Some(d) = state.daily.iter_mut().find(|d| d.day == day) {
        d.gone += 1;
        return;
    }
    let at = state.daily.iter().position(|d| d.day > day).unwrap_or(state.daily.len());
    state.daily.insert(at, Daily { day, gone: 1, ..Default::default() });
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
    // 値段で沈んだ出品は追うのをやめる (最安帯の捌け方を測るのが目的なので)
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
}

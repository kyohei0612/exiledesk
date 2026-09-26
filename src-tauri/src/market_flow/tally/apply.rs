//! market_flow/tally/apply.rs — 1 回のサンプルを記録に畳み込む本体 (apply_sample) と日次集計・7 日の掃除 (prune)
//!
//! tally.rs から分割 (2026-09-26)。通信もファイル I/O もしない純粋関数。
use super::*;

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

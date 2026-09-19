//! market_flow/sweep.rs — 巡回 (いつ・何本投げるか)
//!
//! 自動の 1 周 (周期をかけて薄く流す) と手動の一括 (取り切るまで粘る)、取り直し、
//! スケジューラー。**取った内容の判定は tally.rs**、保存とコマンドは親モジュール。
//!
//! 門番 (trade2.rs) を通るので、ここでレートを数え直さない。patient = 果てるまで待つ。
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。
use super::*;

// ============================================================================
// サンプリング (HTTP)
// ============================================================================

/// 巡回の走らせ方
#[derive(Clone, Copy, PartialEq)]
pub enum Pace {
    /// 手動の一括取得: 上限の許す限り速く (「今すぐ 1 巡」なので待たせない)
    Fast,
    /// 自動巡回: 周期いっぱいに薄く広げる。1 リクエストあたり 周期 ÷ 本数 の間隔を空けるので、
    /// レートの枠に一度も触れない (オーナー了承 2026-09-18:
    /// 「54 銘柄だけどレートになるまで 8 銘柄くらいしか取れない」→ 一気に投げるのをやめる)
    Spread,
}

/// 手動の一括取得で「取り切る」ために繰り返す上限 (これを超えたら諦めて画面に出す)
const MAX_MANUAL_PASSES: u32 = 12;
/// 罰則が明けるのを待つ上限 (1 回の待ちあたり)
const MAX_PENALTY_WAIT_SECS: i64 = 40 * 60;

/// 全銘柄を 1 周する (手動ボタン)。自動巡回が走っていても構わず全部取る (手動は手動で 1 本だけ)。
///
/// オーナー指示 2026-09-19:「一括取得やけど、取り切るまでやってくれるか」。
/// 1 周して取れなかった銘柄があれば、**罰則が明けるのを待ってからその銘柄だけ**繰り返す。
/// 自動巡回の取り直し (retry_keys / MAX_RETRY_ROUNDS) とは別で、こちらは押している間ずっと粘る。
/// 「中止」を押すか、上限 (MAX_MANUAL_PASSES) に達したら残りを画面に出して終わる。
pub async fn sample_once(app: &tauri::AppHandle) -> Result<(), String> {
    if RUNNING_MANUAL.swap(true, Ordering::SeqCst) {
        return Err("取得中です".to_string());
    }
    CANCEL_MANUAL.store(false, Ordering::SeqCst);
    let all = load_store(app).watches.iter().filter(|w| w.auto).count();
    set_manual_base(Some((0, all)));
    let result = sample_until_done(app).await;
    set_progress(None);
    set_manual_base(None);
    CANCEL_MANUAL.store(false, Ordering::SeqCst);
    RUNNING_MANUAL.store(false, Ordering::SeqCst);
    result
}

/// 取れなかった銘柄が無くなるまで繰り返す (手動の一括取得の本体)
async fn sample_until_done(app: &tauri::AppHandle) -> Result<(), String> {
    sample_inner(app, None, Pace::Fast).await?;
    for _ in 0..MAX_MANUAL_PASSES {
        if CANCEL_MANUAL.load(Ordering::SeqCst) {
            return Ok(());
        }
        let left: HashSet<String> = load_store(app).last_failed.iter().cloned().collect();
        if left.is_empty() {
            return Ok(());
        }
        // 取り直しの周は「全体 − 残り」から数え直す (数字が戻らない)
        let all = manual_base().map(|(_, a)| a).unwrap_or(left.len());
        set_manual_base(Some((all.saturating_sub(left.len()), all)));
        // 罰則で止まっている / 枠が空くまで遠い なら、次の 1 本が通るところまで待つ (待っている間も画面に出す)。
        // 罰則だけを見ていた頃は、枠待ちが 90 秒を超えていると即座に取り直しを始めて即座に全滅していた
        let mut waited = 0;
        while (retry_wait_secs() > 0 || crate::trade2::gate_status().wait_secs > 60) && waited < MAX_PENALTY_WAIT_SECS {
            if CANCEL_MANUAL.load(Ordering::SeqCst) {
                return Ok(());
            }
            let (base, all) = manual_base().unwrap_or((0, left.len()));
            set_progress(Some((
                format!("レート制限の解除待ち (残り {} 銘柄)", left.len()),
                base,
                all,
            )));
            tokio::time::sleep(Duration::from_secs(5)).await;
            waited += 5;
        }
        sample_inner(app, Some(left), Pace::Fast).await?;
    }
    Ok(())
}

/// 手動の一括取得を中止する (画面の「中止」)
#[tauri::command]
pub fn market_flow_cancel() {
    CANCEL_MANUAL.store(true, Ordering::SeqCst);
}

/// 自動巡回: 周期いっぱいに薄く広げて 1 周する
pub async fn sample_spread(app: &tauri::AppHandle) -> Result<(), String> {
    sample_guarded(app, None, Pace::Spread, Slot::Auto).await
}

/// 手動の一括取得が走っているか (画面のボタン用)
pub fn manual_running() -> bool {
    RUNNING_MANUAL.load(Ordering::SeqCst)
}

/// 取りこぼした銘柄 (retry_keys) だけ取り直す
async fn sample_retry(app: &tauri::AppHandle) -> Result<(), String> {
    let keys: HashSet<String> = load_store(app).retry_keys.iter().cloned().collect();
    if keys.is_empty() {
        return Ok(());
    }
    sample_guarded(app, Some(keys), Pace::Fast, Slot::Auto).await
}

async fn sample_guarded(app: &tauri::AppHandle, only: Option<HashSet<String>>, pace: Pace, slot: Slot) -> Result<(), String> {
    let flag = match slot {
        Slot::Auto => &RUNNING_AUTO,
        Slot::Manual => &RUNNING_MANUAL,
    };
    if flag.swap(true, Ordering::SeqCst) {
        // 黙って Ok を返すと画面が「終わりました」を出してしまう (2026-09-18 レビュー指摘)
        return Err("取得中です".to_string());
    }
    let result = sample_inner(app, only, pace).await;
    // 途中で ? で抜けても進捗表示を残さない。ただし手動が走っている間は手動の進捗を消さない
    if slot == Slot::Manual || !RUNNING_MANUAL.load(Ordering::SeqCst) {
        set_progress(None);
    }
    flag.store(false, Ordering::SeqCst);
    result
}

/// `only` を渡すとその銘柄だけ取る (取りこぼしの取り直し)。None なら自動リスト全部
async fn sample_inner(app: &tauri::AppHandle, only: Option<HashSet<String>>, pace_mode: Pace) -> Result<(), String> {
    let store = load_store(app);
    if store.watches.is_empty() || store.league.is_empty() {
        return Ok(());
    }
    // 追跡の検索は英語名で投げるので www 固定にする。
    // JP サイトは日本語名しか受け付けず "Unknown item base type" (HTTP 400) になる (2026-09-16)。
    let site: Option<String> = Some("www".to_string());
    // 薄く流す時は 1 巡に何時間もかかるので、既にこの巡で取った銘柄は飛ばす (続きから)
    let done_keys: HashSet<String> = if pace_mode == Pace::Spread && only.is_none() {
        store.sweep_done.iter().cloned().collect()
    } else {
        HashSet::new()
    };
    let auto: Vec<&Watch> = store
        .watches
        .iter()
        .filter(|w| w.auto)
        .filter(|w| only.as_ref().map(|k| k.contains(&w.key)).unwrap_or(true))
        .collect();
    let total_watches = auto.len();
    // 手動の一括取得は上限の許す限り速く (門番が待つ)。
    // 自動巡回は周期いっぱいに薄く広げる: 1 銘柄 = search + fetch の 2 リクエストなので、
    // 間隔 = 周期 ÷ (銘柄数 × 2)。54 銘柄 / 2 時間なら 66 秒に 1 回で、枠に一度も触れない
    // (オーナー了承 2026-09-18:「一気に順に取ってる」のをやめる)
    let pace = match pace_mode {
        Pace::Fast => REQUEST_INTERVAL,
        Pace::Spread => Duration::from_secs(spread_pace_secs(total_watches as i64, cycle_secs(&store)) as u64),
    };
    let mut index = 0usize;
    // 後で取り直す銘柄 (429 / 通信エラーだけ。HTTP 400 のような恒久的な失敗は入れない)
    let mut failed: Vec<String> = Vec::new();
    set_error(None);

    for watch in auto.iter().copied() {
        // 手動の一括取得は「中止」で途中でも抜ける (2026-09-19)
        if pace_mode == Pace::Fast && CANCEL_MANUAL.load(Ordering::SeqCst) {
            break;
        }
        index += 1;
        if done_keys.contains(&watch.key) {
            continue; // この巡では取得済み (途中で閉じた分の続き)
        }
        // 手動と自動が同時に走っている時は、押した本人が見たい手動の進捗を出す
        if pace_mode == Pace::Fast || !RUNNING_MANUAL.load(Ordering::SeqCst) {
            // 手動は周をまたいで通しで数える (取り直しの周で数字が戻らないように)
            let (done, total) = match (pace_mode, manual_base()) {
                (Pace::Fast, Some((base, all))) => ((base + index).min(all), all),
                _ => (index, total_watches),
            };
            set_progress(Some((watch.label.clone().max(watch.key.clone()), done, total)));
        }
        // 時刻は銘柄ごとに取り直す。組の先頭で固定していた頃は、1 組を回り切る十数分ぶん
        // 記録が過去にずれて「初見 < 出品時刻」が出ていた (2026-09-17 レビュー指摘)
        let now = now_secs();
        // --- search: 総数と ID 一覧 ---
        let mut query = watch.query.clone();
        normalize_track_status(&mut query);
        let search = crate::trade2::SearchRequest { patient: true,
            league: store.league.clone(),
            site: site.clone(),
            query,
        };
        let body = match crate::trade2::trade2_search_with(crate::trade_history::session_value(app), search).await {
            Ok(v) => Some(v),
            Err(e) => {
                eprintln!("[market_flow] search {} 失敗: {e}", watch.key);
                set_error(Some(format!("{}: {}", watch.key, e.chars().take(140).collect::<String>())));
                if !is_retriable(&e) {
                    // 何度やっても同じ失敗 (HTTP 400 など)。この巡は飛ばし、取り直しにも入れない
                    tokio::time::sleep(pace).await;
                    continue;
                }
                None
            }
        };
        // 待つのは門番 (gate_acquire、上限 90 秒)。それを超えて止められた銘柄は
        // 取り直し (retry_keys) に回す。ここでもう一度投げ直す処理は 2026-09-19 に消した:
        // 門番が「待ちが長すぎる」と返した直後にもう一度呼んでも必ず同じ Err になる無駄玉で、
        // 「レート制限の解除待ち」と出るだけで何も待っていなかった
        let Some(body) = body else {
            failed.push(watch.key.clone());
            tokio::time::sleep(pace).await;
            continue;
        };
        // レート制限の規則と使用状況を控える (画面はこれを見て待ち時間を出す)
        note_rate_headers(&body);
        let total = body.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
        let query_id = body.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let ids: Vec<String> = body
            .get("result")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        tokio::time::sleep(pace).await;

        // --- fetch: 最安 10 件の値段 (新規を追跡に入れるため) ---
        // ここは毎回取る。**新しい出品が追跡に入るのは fetch の時だけ**なので、間引くと
        // その間に出品されて売れた物を丸ごと取りこぼし、速度が遅い側に偏る。
        // 2026-09-17 のレビューで、間引き条件 (2 巡に 1 回) が実際には 60 銘柄中 42 件で
        // 発火しており、値段も新規も 3.6 時間に 1 回しか入っていなかった。
        let mut entries: Vec<ListingRef> = Vec::new();
        let top: Vec<String> = ids.iter().take(10).cloned().collect();
        if !top.is_empty() && !query_id.is_empty() {
            let fetch = crate::trade2::FetchRequest { patient: true, ids: top, query_id: query_id.clone(), site: site.clone() };
            match crate::trade2::trade2_fetch_with(crate::trade_history::session_value(app), fetch).await {
                Ok(v) => {
                    note_rate_headers(&v);
                    if let Some(arr) = v.get("result").and_then(|x| x.as_array()) {
                        for item in arr {
                            let Some(id) = item.get("id").and_then(|x| x.as_str()) else { continue };
                            let listing = item.get("listing");
                            let price = listing.and_then(|l| l.get("price"));
                            entries.push(ListingRef {
                                id: id.to_string(),
                                amount: price.and_then(|p| p.get("amount")).and_then(|x| x.as_f64()),
                                currency: price.and_then(|p| p.get("currency")).and_then(|x| x.as_str()).map(str::to_string),
                                account: listing
                                    .and_then(|l| l.get("account"))
                                    .and_then(|a| a.get("name"))
                                    .and_then(|x| x.as_str())
                                    .map(str::to_string),
                                listed_at: listing
                                    .and_then(|l| l.get("indexed"))
                                    .and_then(|x| x.as_str())
                                    .and_then(parse_indexed),
                            });
                        }
                    }
                }
                Err(e) => eprintln!("[market_flow] fetch {} 失敗: {e}", watch.key),
            }
            tokio::time::sleep(pace).await;
        }

        // --- 反映 ---
        {
        // 2 本の巡回 (自動 + 手動) が同じファイルを 読む→直す→書く で取り合わないように
        let _store_guard = store_lock();
        let mut store_now = load_store(app);
        let state = store_now.states.entry(watch.key.clone()).or_default();
        // 総数が 100 未満なら search の一覧が全部 = 一覧に無い物は消えたと判断できる
        // 検索結果だけでは「消えた = 売れた」と判定しない (2026-09-17)。
        //
        // securable (即時購入のみ) は出品者の状況で出入りするので、検索から消えただけでは
        // 売れたと言えない。消えた候補は下の確認 fetch (ID 直接照会。status の絞り込みを
        // 受けないので実在が確実に分かる) に回し、そこで居なければ売れたと数える。
        // 即時購入の一覧が全部取れていれば、そこから消えた出品を「売れた」と数える。
        //
        // オーナー指摘 (2026-09-17):「インスタから対面トレードに切り替える人は存在しない」。
        // 即時購入の一覧から消える = 売れた (か取り下げた) とみなしてよい。
        // 値段を変えただけなら ID は変わらないので一覧に残り、売れた扱いにはならない。
        //
        // ID を直接 fetch する裏取りは使えない (消えた出品にもキャッシュを 200 で返す。
        // 2026-09-17 に実測)。応答が空の時や、100 件を超えて一覧が切れている時は判定しない。
        let list_complete = list_is_complete(&ids, total, &state.tracked);
        apply_sample(state, now, total, &ids, &entries, list_complete);
        state.list_complete = list_complete;
        mark_buried(state, &ids, list_complete);
        prune(state, now);
        store_now.sampled_at = now;
        // 巡回中にリーグが切り替わっていたら (merge_watches が記録を全消しした直後)、
        // 旧リーグの結果を書き戻さない (2026-09-18 レビュー指摘)
        if store_now.league != store.league {
            eprintln!("[market_flow] 巡回中にリーグが変わったので中断: {} -> {}", store.league, store_now.league);
            return Ok(());
        }
        if pace_mode == Pace::Spread && !store_now.sweep_done.contains(&watch.key) {
            store_now.sweep_done.push(watch.key.clone());
        }
        save_store(app, &store_now)?;
        }

    }
    // 1 巡の終わり。取りこぼしがあればその銘柄だけ後で取り直す (回数に上限あり)
    let _store_guard = store_lock();
    let mut store_end = load_store(app);
    if only.is_none() {
        // 巡っている間に監視リストが変わって足された銘柄を拾う。
        //
        // 2026-09-19 オーナー「監視リスト変更して一括回したけど、なんか巡回待ちって」:
        // 取る対象はこの関数に入った時点の一覧で固定なので、途中で足された銘柄は
        // 一度も取られないまま「1 巡終わった」ことになり、次の周期 (2 時間) まで
        // 記録ゼロ = 「巡回待ち」のままだった。実測でも 12 銘柄が state すら無かった。
        for w in &store_end.watches {
            if w.auto && !store_end.states.contains_key(&w.key) && !failed.contains(&w.key) {
                failed.push(w.key.clone());
            }
        }
        store_end.rounds += 1;
        store_end.sampled_at = now_secs();
        // 手動の一括取得もここを通る。次の自動取得はこの時刻から数える
        store_end.swept_at = now_secs();
        store_end.retry_count = 0;
        // 手動の一括が終わった時、自動巡回がまだ走っていれば「この巡で取った」の記録は残す
        // (消すと自動側が終わりまで再度全部取り直しに見える)
        if !(pace_mode == Pace::Fast && RUNNING_AUTO.load(Ordering::SeqCst)) {
            store_end.sweep_done.clear();
        }
    }
    // 取り切ったかの判定に使うので、取り直しの周でも更新する
    store_end.last_failed = failed.clone();
    if failed.is_empty() || store_end.retry_count >= MAX_RETRY_ROUNDS {
        if !failed.is_empty() {
            eprintln!("[market_flow] {} 銘柄が {} 回取れなかったので次の周期まで諦める", failed.len(), MAX_RETRY_ROUNDS);
        }
        store_end.retry_keys.clear();
        store_end.retry_at = 0;
    } else {
        store_end.retry_count += 1;
        store_end.retry_keys = failed;
        // 罰則が明ける頃 (少なくとも RETRY_GAP_SECS 後) に取り直す
        store_end.retry_at = now_secs() + retry_wait_secs().max(RETRY_GAP_SECS);
    }
    save_store(app, &store_end)?;
    Ok(())
}

/// 起動時に呼ぶ: 前回の一括取得から周期ぶん経ったら全銘柄を 1 巡する
///
/// オーナー指示 (2026-09-17):「前回一括取得してから手動も含めて ● 時間周期で取得する。
/// 一括取得は手動でも自動でも前回の更新日時を記録するように」。
/// 手で一括取得を押した分も swept_at を更新するので、そこから数え直す。
pub fn spawn_scheduler(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let store = load_store(&app);
            let now = now_secs();
            if store.watches.is_empty() || store.league.is_empty() {
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
            if auto_off(&store) {
                // 自動取得しない設定。手動の一括取得だけで動かす
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
            if RUNNING_AUTO.load(Ordering::SeqCst) {
                // 自動 (巡回か取り直し) が走っている。終わってから次の判断をする
                tokio::time::sleep(Duration::from_secs(60)).await;
                continue;
            }
            if now >= next_sweep_at(&store) {
                // 自動巡回は周期いっぱいに薄く広げる (枠に触れないので待ちが出ない)
                if let Err(e) = sample_spread(&app).await {
                    crate::app_log::line_static(&format!("[market_flow] サンプリング失敗: {e}"));
                }
            } else if store.retry_at > 0 && now >= store.retry_at {
                // 取りこぼした銘柄だけ取り直す (全銘柄を回し直さない)
                if let Err(e) = sample_retry(&app).await {
                    crate::app_log::line_static(&format!("[market_flow] 取り直し失敗: {e}"));
                }
            }
            tokio::time::sleep(Duration::from_secs(60)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;


    /// 中断から再開する時、取り済みの銘柄は飛ばす
    #[test]
    fn resume_skips_done_watches() {
        let keys = ["A", "B", "C"];
        let done: HashSet<String> = ["A".to_string()].into_iter().collect();
        let todo: Vec<&str> = keys.iter().copied().filter(|k| !done.contains(*k)).collect();
        assert_eq!(todo, vec!["B", "C"]);
    }
}

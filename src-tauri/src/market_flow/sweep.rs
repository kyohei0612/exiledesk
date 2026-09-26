//! market_flow/sweep.rs — 巡回 (いつ・何本投げるか)
//!
//! 自動の 1 周 (周期ごと) と手動の一括、取り直し、スケジューラー。
//! **取った内容の判定は tally.rs**、保存とコマンドは親モジュール。
//!
//! 2026-09-20 から自動と手動は**同じ流し方**。間隔を決めるのは門番だけで、ここでは
//! 上乗せして待たない (オーナー指示:「今の一括取得に合わせてロジック」)。
//!
//! 門番 (trade2.rs) を通るので、ここでレートを数え直さない。patient = 果てるまで待つ。
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。
use super::*;

// ============================================================================
// サンプリング (HTTP)
// ============================================================================

/// 1 巡で「取り切る」ために繰り返す上限 (これを超えたら諦めて画面に出す)。
///
/// 手動は押している人が見ているので粘る。自動はここで切り上げて、残りは
/// 取りこぼし (retry_keys) に回す (画面をいつまでも取得中にしないため)。
const MAX_MANUAL_PASSES: u32 = 12;
const MAX_AUTO_PASSES: u32 = 3;
/// 罰則が明けるのを待つ上限 (1 回の待ちあたり)
const MAX_PENALTY_WAIT_SECS: i64 = 40 * 60;
/// 追加の fetch (最安 10 件の外の出品者を見る) が門番で待ってよい上限 (秒)。
/// これを超える待ちなら取らずに、その銘柄の消えた判定を次の巡へ見送る (2026-09-26)
const EXTRA_FETCH_MAX_WAIT_SECS: i64 = 60;

/// 追加の fetch を今投げてよいか。罰則中 / 枠待ちが長い時は見送る (門番の判断を読むだけで、枠は緩めない)
fn extra_fetch_allowed() -> bool {
    let g = crate::trade2::gate_status();
    g.penalty_until <= now_secs() && g.wait_secs <= EXTRA_FETCH_MAX_WAIT_SECS
}

/// 全銘柄を 1 周する (手動ボタン)。
pub async fn sample_once(app: &tauri::AppHandle) -> Result<(), String> {
    run_sweep(app, Slot::Manual).await
}

/// 自動巡回: **手動の一括取得とまったく同じ流し方**で 1 周する。
///
/// オーナー指示 2026-09-20:「自動巡回、多分古いロジックかな? 遅いけど。今の一括取得に
/// 合わせてロジック」。以前は周期いっぱいに薄く広げていた (Pace::Spread) ので、1 銘柄ごとに
/// 門番の待ちに加えて 30 秒近く寝ており、1 巡に 30 分かかっていた。門番 (trade2/gate.rs) が
/// 上限を守って間隔を決めるので、ここで上乗せして待つ意味はもう無い。
pub async fn sample_auto(app: &tauri::AppHandle) -> Result<(), String> {
    run_sweep(app, Slot::Auto).await
}

/// 1 巡の入口 (自動・手動で共通)。二重起動を止めて、取り切るまで回す
async fn run_sweep(app: &tauri::AppHandle, slot: Slot) -> Result<(), String> {
    let flag = running_flag(slot);
    if flag.swap(true, Ordering::SeqCst) {
        // 黙って Ok を返すと画面が「終わりました」を出してしまう (2026-09-18 レビュー指摘)
        return Err("取得中です".to_string());
    }
    set_cancel(slot, false);
    let all = load_store(app).watches.iter().filter(|w| w.auto).count();
    set_sweep_base(slot, Some((0, all)));
    let result = sample_until_done(app, slot).await;
    // 途中で ? で抜けても進捗表示を残さない。相手の巡回が走っている間はその進捗を消さない
    if slot == Slot::Manual || !manual_running() {
        set_progress(None);
    }
    set_sweep_base(slot, None);
    set_cancel(slot, false);
    flag.store(false, Ordering::SeqCst);
    result
}

/// 取れなかった銘柄が無くなるまで繰り返す (1 巡の本体)
async fn sample_until_done(app: &tauri::AppHandle, slot: Slot) -> Result<(), String> {
    sample_inner(app, None, slot).await?;
    let passes = if slot == Slot::Manual { MAX_MANUAL_PASSES } else { MAX_AUTO_PASSES };
    for _ in 0..passes {
        if cancelled(slot) {
            return Ok(());
        }
        let left: HashSet<String> = load_store(app).last_failed.iter().cloned().collect();
        if left.is_empty() {
            return Ok(());
        }
        // 取り直しの周は「全体 − 残り」から数え直す (数字が戻らない)
        let all = sweep_base(slot).map(|(_, a)| a).unwrap_or(left.len());
        set_sweep_base(slot, Some((all.saturating_sub(left.len()), all)));
        // 罰則で止まっている / 枠が空くまで遠い なら、次の 1 本が通るところまで待つ (待っている間も画面に出す)。
        // 罰則だけを見ていた頃は、枠待ちが 90 秒を超えていると即座に取り直しを始めて即座に全滅していた
        let mut waited = 0;
        while (retry_wait_secs() > 0 || crate::trade2::gate_status().wait_secs > 60) && waited < MAX_PENALTY_WAIT_SECS {
            if cancelled(slot) {
                return Ok(());
            }
            if slot == Slot::Manual || !manual_running() {
                let (base, all) = sweep_base(slot).unwrap_or((0, left.len()));
                set_progress(Some((
                    format!("レート制限の解除待ち (残り {} 銘柄)", left.len()),
                    base,
                    all,
                )));
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
            waited += 5;
        }
        sample_inner(app, Some(left), slot).await?;
    }
    Ok(())
}

/// 一括取得を中止する (画面の「中止」)。自動巡回も手動も止める
///
/// オーナー 2026-09-20:「巡回中は他の取得は触れないようにしよう」。触れなくする以上、
/// 自動巡回も手で止められないと待つしかなくなるので、中止は両方に効かせる。
#[tauri::command]
pub fn market_flow_cancel() {
    set_cancel(Slot::Manual, true);
    set_cancel(Slot::Auto, true);
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
    if RUNNING_AUTO.swap(true, Ordering::SeqCst) {
        return Err("取得中です".to_string());
    }
    set_cancel(Slot::Auto, false);
    let result = sample_inner(app, Some(keys), Slot::Auto).await;
    if !manual_running() {
        set_progress(None);
    }
    RUNNING_AUTO.store(false, Ordering::SeqCst);
    result
}

/// `only` を渡すとその銘柄だけ取る (取りこぼしの取り直し)。None なら自動リスト全部
async fn sample_inner(app: &tauri::AppHandle, only: Option<HashSet<String>>, slot: Slot) -> Result<(), String> {
    let store = load_store(app);
    if store.watches.is_empty() || store.league.is_empty() {
        return Ok(());
    }
    // 追跡の検索は英語名で投げるので www 固定にする。
    // JP サイトは日本語名しか受け付けず "Unknown item base type" (HTTP 400) になる (2026-09-16)。
    let site: Option<String> = Some("www".to_string());
    // 自動巡回の途中で手動が同じ銘柄を取っていたら飛ばす (二度投げない)。
    // 画面の「再取得」も market_flow_record からここに印を付けてくる
    let done_keys: HashSet<String> = if slot == Slot::Auto && only.is_none() {
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
    // 自動も手動も上限の許す限り速く流す。間隔を決めるのは門番 (trade2/gate.rs) で、
    // 5 分あたりの上限から 1 本ごとの間隔を出して中で待つ。ここで上乗せして寝ない
    // (オーナー指示 2026-09-20:「今の一括取得に合わせてロジック」)。
    let pace = REQUEST_INTERVAL;
    let mut index = 0usize;
    // 後で取り直す銘柄 (429 / 通信エラーだけ。HTTP 400 のような恒久的な失敗は入れない)
    let mut failed: Vec<String> = Vec::new();
    set_error(None);

    for watch in auto.iter().copied() {
        // 「中止」で途中でも抜ける (自動巡回も止められる。2026-09-20)
        if cancelled(slot) {
            break;
        }
        index += 1;
        if done_keys.contains(&watch.key) {
            continue; // この巡では取得済み (途中で閉じた分の続き)
        }
        // 手動と自動が同時に走っている時は、押した本人が見たい手動の進捗を出す
        if slot == Slot::Manual || !manual_running() {
            // 周をまたいで通しで数える (取り直しの周で数字が戻らないように)
            let (done, total) = match sweep_base(slot) {
                Some((base, all)) => ((base + index).min(all), all),
                None => (index, total_watches),
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
        let requested = top.len();
        if !top.is_empty() && !query_id.is_empty() {
            let fetch = crate::trade2::FetchRequest { patient: true, ids: top, query_id: query_id.clone(), site: site.clone() };
            match crate::trade2::trade2_fetch_with(crate::trade_history::session_value(app), fetch).await {
                Ok(v) => {
                    note_rate_headers(&v);
                    entries = parse_fetch_result(&v);
                }
                Err(e) => eprintln!("[market_flow] fetch {} 失敗: {e}", watch.key),
            }
            tokio::time::sleep(pace).await;
        }

        // --- 追加の fetch: 消えた出品があった時だけ、最安 10 件の外の出品者を見る (2026-09-26 オーナー承認) ---
        // 値段を上げて並べ直した人は最安 10 件の外に出るので、10 件だけでは「同じ出品者がまだ並べている」
        // を見分けられず、売れたと数えていた。一覧の 11 件目以降で出品者が分からない物を 10 件ずつ最大 2 回取る。
        // 門番 (8 割 / 5 分の合計枠) は通すだけで緩めない。枠待ちが長い時は取らずに、
        // この巡の消えた判定を見送る (確定待ちのまま。売れたにはしない)。
        // ID を直接照会する裏取りは使わない (消えた出品にもキャッシュを返す。オーナー確認 2026-09-26)
        let mut details_ok = fetch_details_ok(requested, &entries);
        let mut extra: Vec<ListingRef> = Vec::new();
        if details_ok && !query_id.is_empty() {
            let want = {
                let cur = load_store(app);
                let empty = WatchState::default();
                let st = cur.states.get(&watch.key).unwrap_or(&empty);
                let complete = list_is_complete(&ids, total, &st.tracked);
                extra_detail_ids(st, &ids, complete)
            };
            for batch in want.chunks(10) {
                if cancelled(slot) || !extra_fetch_allowed() {
                    eprintln!("[market_flow] {} の追加 fetch を見送り (枠待ち)。消えた判定はこの巡は保留", watch.key);
                    details_ok = false;
                    break;
                }
                let fetch = crate::trade2::FetchRequest { patient: true, ids: batch.to_vec(), query_id: query_id.clone(), site: site.clone() };
                let got = tokio::time::timeout(
                    Duration::from_secs(EXTRA_FETCH_MAX_WAIT_SECS as u64),
                    crate::trade2::trade2_fetch_with(crate::trade_history::session_value(app), fetch),
                )
                .await;
                match got {
                    Ok(Ok(v)) => {
                        note_rate_headers(&v);
                        extra.extend(parse_fetch_result(&v));
                    }
                    Ok(Err(e)) => {
                        eprintln!("[market_flow] 追加 fetch {} 失敗: {e}", watch.key);
                        details_ok = false;
                        break;
                    }
                    Err(_) => {
                        eprintln!("[market_flow] 追加 fetch {} が枠待ちで {} 秒を超えたので見送り", watch.key, EXTRA_FETCH_MAX_WAIT_SECS);
                        details_ok = false;
                        break;
                    }
                }
                tokio::time::sleep(pace).await;
            }
        }

        // --- 反映 ---
        {
        // 2 本の巡回 (自動 + 手動) が同じファイルを 読む→直す→書く で取り合わないように
        let _store_guard = store_lock();
        let mut store_now = load_store(app);
        let state = store_now.states.entry(watch.key.clone()).or_default();
        // 生死は search の ID 一覧だけで見る (ID を直接 fetch する裏取りは、消えた出品にも
        // キャッシュを 200 で返すので使えない。2026-09-17 に実測)。
        // 一覧が出品全部を含んでいる時 (総数 100 未満、応答が空でない) だけ「一覧に無い」を判定に使う。
        //
        // オーナー指摘 (2026-09-17):「インスタから対面トレードに切り替える人は存在しない」ので、
        // 即時購入の一覧から消えることは売れた (か取り下げた) とみなしてよい。ただし 2026-09-26 の監査で
        // 次の条件を足した (判定の中身は tally.rs の apply_sample):
        //   - 1 回消えただけでは確定待ち。次の判定できる巡でも居なければ売れた (消えた時刻は 1 回目)
        //   - 同じ出品者が今もこの条件で並べていれば付け替え (売れたに数えない)
        //   - details_ok が false の巡 (最安 10 件 / 追加の fetch が失敗・見送り / 出品者が取れない) は判定しない
        //   - 出品時刻か出品者が分からない物は不明 (売れたに数えない)
        // 値段を変えただけなら ID は変わらないので一覧に残り、売れた扱いにはならない。
        let list_complete = list_is_complete(&ids, total, &state.tracked);
        // 詳細 (出品者) が取れなかった巡は付け替えを見分けられないので、消えた判定をしない (2026-09-26 監査)。
        // fetch と反映の間に追跡が増えて、追加で要る出品者が変わっていたら (手動の再取得が割り込んだ等) も見送る
        let covered = extra_detail_ids(state, &ids, list_complete).iter().all(|id| extra.iter().any(|e| &e.id == id));
        let details: Option<&[ListingRef]> = if details_ok && covered { Some(extra.as_slice()) } else { None };
        apply_sample(state, now, total, &ids, &entries, list_complete, details);
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
        if slot == Slot::Auto && !store_now.sweep_done.contains(&watch.key) {
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
        if !(slot == Slot::Manual && RUNNING_AUTO.load(Ordering::SeqCst)) {
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
                // 手動の一括取得と同じ流し方で 1 巡する (2026-09-20)
                if let Err(e) = sample_auto(&app).await {
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

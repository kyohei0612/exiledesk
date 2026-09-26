//! gem_break/fetch.rs — 使用率上位のキャラを取って集計するコマンド (gem_break_fetch)。進捗の emit は親の gem_break.rs
//!
//! gem_break.rs から分割 (2026-09-26)。
use super::*;

/// 1 つ (または使用率上位いくつか) のアセンダンシーの上位キャラを取って集計する。
#[tauri::command]
pub async fn gem_break_fetch(window: tauri::Window, req: GemBreakRequest) -> Result<GemBreakResult, String> {
    let top_n = req.top_n.unwrap_or(40).clamp(5, 100);
    let spread = req.spread.unwrap_or(1).clamp(1, 10);
    CANCEL.store(false, Ordering::Relaxed);
    let app = window.app_handle().clone();
    // 前と同じ条件で、顔ぶれもジェムも全部キャッシュにあるなら **1 リクエストも投げずに** 組み立て直す
    // (2026-09-18 オーナー報告「即レート制限」: 1 人も新しく取らない時でも index-state / search で
    //  3 回問い合わせていたので、IP がブロックされているとそこで弾かれていた)
    if spread <= 1 {
        if let Some(r) = try_offline(Some(&window), &app, req.class.clone().unwrap_or_default(), top_n, now_ts(), crate::gem_break_cache::SEARCH_FRESH_SECS) {
            return Ok(r);
        }
    }
    let client = ninja::build_client()?;
    // poe.ninja 宛は 1 本のゲートを共有する (2026-09-18 オーナー指摘「どっちかズラさんと終わる」)。
    // 間隔 (2.5 秒) もペナルティも上位プレイヤーMOD一覧と共通なので、同時に走っても倍速にならない
    let gate = ninja::global_gate();
    // 先に上位プレイヤーMOD一覧が走っていたら、交互に取り合わずに断る (終わってから押してもらう)
    let _job = ninja::try_take_ninja_job("使用率ランキング")
        .map_err(|other| format!("{other} の取得中です。終わってから取得してください (同じ poe.ninja の枠を使うため)"))?;

    emit(&window, "search", 0, top_n, "", 0);
    let snap = ninja::fetch_index_state(&client, &gate, None).await?;
    let ascs = ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await?;

    // クラス指定なし (空文字) = リーグ全体の DPS 上位 100 人 (オーナー案 2026-09-16)。
    // ジェムリング上位 100 人と比べて 75 人が別人だったので、母集団として別物になる。
    let all_classes = matches!(req.class.as_deref(), Some(""));
    // 対象アセンダンシー: spread=1 なら指定 1 つ、2 以上なら使用率上位から spread 個
    let targets: Vec<ninja::AscendancyMeta> = if all_classes {
        vec![ninja::AscendancyMeta { class: String::new(), percentage: 100.0 }]
    } else if spread <= 1 {
        let a = match &req.class {
            Some(c) => ascs.iter().find(|a| &a.class == c).cloned(),
            None => ascs.first().cloned(),
        }
        .ok_or_else(|| "そのアセンダンシーが poe.ninja に見つかりません".to_string())?;
        vec![a]
    } else {
        ascs.iter().take(spread).cloned().collect()
    };
    if targets.is_empty() {
        return Err("アセンダンシーが取れませんでした".to_string());
    }
    // 散らす時は 1 アセあたりの人数を割る (合計はだいたい top_n)
    let per_asc = ((top_n as f64) / targets.len() as f64).ceil() as usize;

    // 集計はキャラごとのジェムを貯めてから 1 回でやる (キャッシュだけで作る経路と同じ計算)
    let mut per_char: Vec<Vec<GemView>> = Vec::new();
    let mut done = 0usize;
    let mut planned = 0usize;
    // キャラごとのキャッシュ (snapshot が変わっていれば空で始まる)
    let mut cache = gcache::load(&app, &snap.version, now_ts());
    cache.league = snap.league_url.clone();
    cache.snapshot_name = snap.snapshot_name.clone();
    let mut reused = 0usize;
    let mut fetched_since_save = 0usize;

    'outer: for asc in &targets {
        if CANCEL.load(Ordering::Relaxed) {
            break;
        }
        emit(&window, "search", done, planned.max(top_n), &asc.class, reused);
        let refs = match ninja::fetch_search_top_n(&client, &gate, &snap, &asc.class, per_asc).await {
            Ok(r) => r,
            Err(_) => continue, // 1 アセ取れなくても他は続ける
        };
        planned += refs.len();
        // 顔ぶれも覚えておく (次に同じ条件で取るなら search も要らない)
        cache.searches.insert(
            gcache::search_key(&asc.class, per_asc),
            gcache::CachedSearch {
                fetched_at: now_ts(),
                chars: refs.iter().map(|r| (r.account.clone(), r.name.clone())).collect(),
            },
        );
        for r in refs {
            if CANCEL.load(Ordering::Relaxed) {
                break 'outer;
            }
            emit(&window, "fetching", done, planned.max(top_n), &asc.class, reused);
            // キャッシュにいれば取りに行かない (レート制限を食う唯一の原因がここなので効く)
            let key = gcache::char_key(&r.account, &r.name);
            let gems: Vec<GemView> = match cache.characters.get(&key) {
                Some(c) => {
                    reused += 1;
                    from_cached(&c.gems)
                }
                None => {
                    let ci = match ninja::fetch_character(&client, &gate, &snap, &r).await {
                        Ok(c) => c,
                        Err(_) => continue, // 1 人取れなくても集計は続ける
                    };
                    let g = gems_of(&ci);
                    cache
                        .characters
                        .insert(key, gcache::CachedChar { fetched_at: now_ts(), gems: to_cached(&g) });
                    // 途中でレート制限に当たっても取れた分を残す (5 人ごとに保存)
                    fetched_since_save += 1;
                    if fetched_since_save >= 5 {
                        gcache::save(&app, &mut cache);
                        fetched_since_save = 0;
                    }
                    g
                }
            };
            done += 1;
            per_char.push(gems);
        }
    }
    let label = if all_classes {
        "全アセンダンシー".to_string()
    } else if targets.len() == 1 {
        targets[0].class.clone()
    } else {
        format!("上位 {} アセ合算", targets.len())
    };
    // 中止やレート制限で抜けた時も、取れたキャラはここで残す
    gcache::save(&app, &mut cache);
    emit(&window, "completed", done, planned.max(done), &label, reused);

    if done == 0 {
        return Err(if CANCEL.load(Ordering::Relaxed) {
            "中止しました (1 人も取れていません)".to_string()
        } else {
            "キャラを 1 人も取れませんでした (poe.ninja のレート制限の可能性)".to_string()
        });
    }
    let rows = aggregate(&per_char);
    let out = GemBreakResult {
        class: label,
        classes: targets.iter().map(|a| a.class.clone()).collect(),
        percentage: targets.iter().map(|a| a.percentage).sum(),
        characters: done,
        reused,
        requested: top_n,
        cancelled: CANCEL.load(Ordering::Relaxed),
        league: snap.league_url.clone(),
        snapshot: snap.snapshot_name.clone(),
        fetched_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
        rows,
    };
    // 画面 (localStorage) とは別に app_data にも残す。同梱データにできる形なので、
    // 新しい PC はこれを積んでおけば取得なしで始められる
    save_result(&app, &out);
    Ok(out)
}

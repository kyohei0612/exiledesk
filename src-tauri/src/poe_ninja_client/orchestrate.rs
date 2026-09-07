//! Tauri command `craft_v2_fetch_all`: 全体フロー (snapshot 解決 → 差分判定 → 人気順に逐次取得)
//!
//! poe_ninja_client.rs から切り出し (2026-09-07 R3)。1 アセ分の処理は ascendancy_fetch.rs。

use super::*;

/// snapshot_version と league_url が一致した場合のみ prev_cache を差分モードの母集団にする。
/// league_url が違ったらリーグ切替なので無効化 (POE2 では vaal/vaalhc 等)。
fn resolve_prev_by_class(prev_cache: Option<&CraftV2Cache>, snapshot: &SnapshotMeta) -> HashMap<String, CachedAscendancy> {
    match prev_cache {
        Some(c) if c.snapshot_version == snapshot.version && c.league_url == snapshot.league_url => {
            c.ascendancies.iter().map(|a| (a.class.clone(), a.clone())).collect()
        }
        _ => HashMap::new(),
    }
}

/// アセ単位タイムアウト発火時: spawn 済み character タスクを明示的に abort し、
/// cancel 完了 (= permit / guard drop) まで join_next で消費する (Rust-H6)。
/// abort 済みタスクは即 JoinError::is_cancelled() で返るのでブロックしない。
async fn abort_pending_tasks(slot: &JoinSetSlot) {
    let slot = slot.lock().await;
    if let Some(set_arc) = slot.as_ref() {
        let mut set_guard = set_arc.lock().await;
        set_guard.abort_all();
        while set_guard.join_next().await.is_some() {}
    }
}

/// アセ完了時の累計リクエスト集計 (Cloudflare 1015 閾値実測用)。
fn log_ascendancy_done(class: &str) {
    let total_reqs = REQ_COUNTER.load(Ordering::Relaxed);
    let session_secs = SESSION_START.get_or_init(Instant::now).elapsed().as_secs();
    let avg_rate = total_reqs as f64 / session_secs.max(1) as f64;
    eprintln!(
        "[ascendancy_done] {} — cumulative {} req in {}s (avg {:.2} req/sec)",
        class, total_reqs, session_secs, avg_rate
    );
}

fn build_cache(snapshot: &SnapshotMeta, ascendancies: Vec<CachedAscendancy>) -> CraftV2Cache {
    CraftV2Cache {
        snapshot_version: snapshot.version.clone(),
        league_url: snapshot.league_url.clone(),
        snapshot_name: snapshot.snapshot_name.clone(),
        saved_at: now_unix_seconds(),
        ascendancies,
    }
}

/// 起動時メインフロー。**Phase ζ で差分更新対応** (キャッシュあり時は新規キャラのみ取得)。
///
/// 1. index-state → snapshot meta
/// 2. build-index-state → 上位 top_n_ascendancies 件 (使用率降順)
/// 3. `prev_cache` と snapshot_version を比較:
///    - キャッシュなし or version 変化 → **全取得モード**
///    - version 同じ                  → **差分モード**: search 結果と prev を比較、新規だけ fetch_character
/// 4. 人気順で各アセンダンシーについて search → character fetch → CraftV2Progress emit
///    (アセンダンシー単位は逐次 = 人気順死守、emit 順が人気順になり 429 の発生箇所も明確)
/// 5. 全完了したら新キャッシュを構築、CraftV2FetchResult を return / `craft-v2-done` emit
///
/// 各アセは ASCENDANCY_TIMEOUT_SECS で打ち切って次へ進む (2026-05-23: 429/522 連発 ×
/// 8 retry × 120s backoff で最終アセが 16 分ハングした問題の対策)。
#[tauri::command]
pub async fn craft_v2_fetch_all(
    window: tauri::Window,
    top_n_ascendancies: usize,
    top_n_per_ascendancy: usize,
    prev_cache: Option<CraftV2Cache>,
    // Phase ξ: 取得対象リーグの url (例: "vaal" / "hcvaal" / "standard")。None なら economyLeagues[0]。
    league_url: Option<String>,
) -> Result<CraftV2FetchResult, String> {
    let client = Arc::new(build_client()?);
    let gate = RateGate::new(MIN_REQUEST_INTERVAL_MS);

    // Medium-M7: 前回 fetch 末尾でユーザがキャンセルした残骸が残らないようリセット
    CRAFT_V2_CANCEL_FLAG.store(false, Ordering::Relaxed);

    let snapshot = fetch_index_state(&client, &gate, league_url.as_deref()).await?;
    let all_ascendancies = fetch_build_index_state(&client, &gate, &snapshot.league_url).await?;
    let top_ascendancies: Vec<AscendancyMeta> = all_ascendancies.into_iter().take(top_n_ascendancies).collect();

    let prev_by_class = resolve_prev_by_class(prev_cache.as_ref(), &snapshot);
    let differential_mode = !prev_by_class.is_empty();

    // character 並列度 (Phase θ で 8→6→4→1 に段階緩和済み)
    let semaphore = Arc::new(Semaphore::new(CONCURRENT_FETCH_LIMIT));
    let mut new_ascendancies: Vec<CachedAscendancy> = Vec::with_capacity(top_ascendancies.len());

    for asc in &top_ascendancies {
        // Medium-M7: ここで break しても完了済みアセ分のキャッシュは保持される
        if is_cancel_requested() {
            let _ = window.emit(
                "craft-v2-cancelled",
                serde_json::json!({ "phase": "ascendancy-start", "ascendancy": asc.class }),
            );
            break;
        }

        let join_set_slot: JoinSetSlot = Arc::new(Mutex::new(None));
        let ctx = AscFetchCtx {
            client: Arc::clone(&client),
            gate: gate.clone(),
            semaphore: Arc::clone(&semaphore),
            snapshot: snapshot.clone(),
            window: window.clone(),
            top_n_per_ascendancy,
            differential_mode,
            prev_asc: prev_by_class.get(&asc.class).cloned(),
            join_set_slot: Arc::clone(&join_set_slot),
        };
        let timeout_dur = Duration::from_secs(ASCENDANCY_TIMEOUT_SECS);
        let maybe_ascendancy = match tokio::time::timeout(timeout_dur, fetch_one_ascendancy(ctx, asc.clone())).await {
            Ok(opt) => opt, // 正常完了 (Some=結果あり / None=空 or search 失敗)
            Err(_elapsed) => {
                // タイムアウト: そのアセは諦めて次へ (部分結果も破棄)。次アセは確実に 0 並列スタート。
                abort_pending_tasks(&join_set_slot).await;
                let active_after_abort = ACTIVE_FETCH_COUNT.load(Ordering::Relaxed);
                emit_error(
                    &window,
                    &asc.class,
                    "ascendancy-timeout",
                    format!(
                        "ascendancy fetch timed out after {} seconds, skipping (active_after_abort={})",
                        ASCENDANCY_TIMEOUT_SECS, active_after_abort
                    ),
                );
                None
            }
        };

        // Rust-H5: 空 / タイムアウト / search 失敗のアセは cache にも checkpoint にも入れない
        let Some(cached_asc) = maybe_ascendancy else { continue };
        new_ascendancies.push(cached_asc);
        log_ascendancy_done(&asc.class);

        // Phase θ: アセ単位 checkpoint。1015 や中断で全 10 完了に至らなくても、ここまでの分を
        // TS 側で保存してもらい次回起動の差分モードに繋ぐ。
        let checkpoint = build_cache(&snapshot, new_ascendancies.clone());
        let _ = window.emit("craft-v2-checkpoint", &checkpoint);
    }

    let result = CraftV2FetchResult {
        snapshot: snapshot.clone(),
        cache: build_cache(&snapshot, new_ascendancies),
    };
    // 全体完了通知 (TS 側はこの payload の cache を craft_v2_cache_save に渡す)
    let _ = window.emit("craft-v2-done", &result);
    Ok(result)
}

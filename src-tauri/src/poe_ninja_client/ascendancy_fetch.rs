//! 1 アセンダンシー分の取得: search → (差分流用 / 新規 character 並列取得) → 進捗 emit → キャッシュ形式へ
//!
//! 旧 `craft_v2_fetch_all` 内の 300 行 async ブロックを関数へ切り出したもの (2026-09-07 R3)。
//! 呼び側 (orchestrate.rs) がアセ単位タイムアウトで wrap し、タイムアウト時は
//! `join_set_slot` 経由で spawn 済み character タスクを abort する (Rust-H6)。

use super::*;

/// character 取得タスクの JoinSet。タイムアウト時に外側から `abort_all()` するため Arc<Mutex> で共有。
pub(crate) type CharJoinSet = JoinSet<Result<CharacterItems, String>>;
pub(crate) type CharJoinSetHandle = Arc<Mutex<CharJoinSet>>;
/// 外側 (timeout 分岐) から JoinSet にアクセスするための共有 slot。
/// `fetch_one_ascendancy` は spawn 直後に Some(...) を書き込む。
pub(crate) type JoinSetSlot = Arc<Mutex<Option<CharJoinSetHandle>>>;

/// アセンダンシー取得 1 回分の共有コンテキスト。
pub(crate) struct AscFetchCtx {
    pub client: Arc<Client>,
    pub gate: RateGate,
    pub semaphore: Arc<Semaphore>,
    pub snapshot: SnapshotMeta,
    pub window: tauri::Window,
    pub top_n_per_ascendancy: usize,
    /// snapshot_version が前回キャッシュと一致 → 既取得キャラは流用
    pub differential_mode: bool,
    pub prev_asc: Option<CachedAscendancy>,
    pub join_set_slot: JoinSetSlot,
}

/// `craft-v2-character-progress` emit。phase: "search" | "fetching" | "completed"。
/// current_concurrency は ACTIVE_FETCH_COUNT の観測値。
pub(crate) fn emit_char_progress(window: &tauri::Window, asc: &str, done: usize, total: usize, phase: &str) {
    let _ = window.emit(
        "craft-v2-character-progress",
        &CraftV2CharacterProgress {
            ascendancy: asc.to_string(),
            characters_done: done,
            characters_total: total,
            current_concurrency: ACTIVE_FETCH_COUNT.load(Ordering::Relaxed),
            phase: phase.to_string(),
        },
    );
}

/// `craft-v2-error` emit (phase: "search" | "character" | "join" | "ascendancy-timeout" ...)。
pub(crate) fn emit_error(window: &tauri::Window, asc: &str, phase: &str, error: String) {
    let _ = window.emit(
        "craft-v2-error",
        serde_json::json!({ "ascendancy": asc, "phase": phase, "error": error }),
    );
}

fn char_key(account: &str, name: &str) -> String {
    format!("{account}|{name}")
}

/// 差分モード: search 結果を「キャッシュ流用」と「新規取得」に振り分ける。
/// 流用キャラの fetched_at は「今」に更新して永続的に古いまま居座るのを防ぐ (Rust-H4)。
fn split_reused(
    chars: Vec<CharacterRef>,
    prev_asc: Option<&CachedAscendancy>,
    differential_mode: bool,
    now_ts: i64,
) -> (Vec<CharacterItems>, Vec<CachedCharacter>, Vec<CharacterRef>) {
    let prev_by_key: HashMap<String, &CachedCharacter> = prev_asc
        .map(|p| p.characters.iter().map(|c| (char_key(&c.account, &c.name), c)).collect())
        .unwrap_or_default();
    let mut reused_items = Vec::new();
    let mut reused_cached = Vec::new();
    let mut to_fetch = Vec::with_capacity(chars.len());
    for char_ref in chars {
        if differential_mode {
            if let Some(cached) = prev_by_key.get(&char_key(&char_ref.account, &char_ref.name)) {
                reused_items.push(cached_character_to_character_items(cached));
                reused_cached.push(CachedCharacter { fetched_at: now_ts, ..(*cached).clone() });
                continue;
            }
        }
        to_fetch.push(char_ref);
    }
    (reused_items, reused_cached, to_fetch)
}

/// character endpoint を JoinSet 上で spawn する (新規キャラのみ)。
///
/// Rust-H6: `Vec<JoinHandle>` だと外側 timeout で async ブロックが drop されても
/// タスクは detach されたまま走り続け (JoinHandle drop ≠ cancel)、Semaphore を
/// 突破して 26 並列まで暴走した。JoinSet を Arc<Mutex> に載せ、外側から
/// `abort_all()` できるようにする。abort されたタスクの `_permit` / `ActiveFetchGuard`
/// は drop され、Semaphore / ACTIVE_FETCH_COUNT は確実に回復する。
async fn spawn_character_tasks(ctx: &AscFetchCtx, to_fetch: Vec<CharacterRef>) -> CharJoinSetHandle {
    let join_set: CharJoinSetHandle = Arc::new(Mutex::new(JoinSet::new()));
    {
        let mut set_guard = join_set.lock().await;
        for char_ref in to_fetch {
            let client_c = Arc::clone(&ctx.client);
            let gate_c = ctx.gate.clone();
            let snapshot_c = ctx.snapshot.clone();
            let sem_c = Arc::clone(&ctx.semaphore);
            set_guard.spawn(async move {
                let _permit = sem_c
                    .acquire_owned()
                    .await
                    .map_err(|e| format!("semaphore closed: {e}"))?;
                // Medium-M7: semaphore queue で待っていたタスクが cancel 後に走り出さないように
                if is_cancel_requested() {
                    return Err("cancelled".to_string());
                }
                fetch_character(&client_c, &gate_c, &snapshot_c, &char_ref).await
            });
        }
    }
    *ctx.join_set_slot.lock().await = Some(Arc::clone(&join_set));
    join_set
}

/// 流用分 + 新規分を search 順 (current_keys) に並び替える。消失キャラは含めない。
fn order_by_search(current_keys: &[String], reused: Vec<CachedCharacter>, fresh: Vec<CachedCharacter>) -> Vec<CachedCharacter> {
    let mut by_key: HashMap<String, CachedCharacter> = HashMap::new();
    for c in reused.into_iter().chain(fresh) {
        by_key.insert(char_key(&c.account, &c.name), c);
    }
    current_keys.iter().filter_map(|k| by_key.remove(k)).collect()
}

/// 1 アセンダンシーを取得して CachedAscendancy を返す。
/// search 失敗 / 0 件は None (キャッシュを汚染しない、Rust-H5)。
pub(crate) async fn fetch_one_ascendancy(ctx: AscFetchCtx, asc: AscendancyMeta) -> Option<CachedAscendancy> {
    let asc_class = asc.class;
    let asc_pct = asc.percentage;
    let window = &ctx.window;

    // search 開始 (total は確定前なので暫定で top_n)
    emit_char_progress(window, &asc_class, 0, ctx.top_n_per_ascendancy, "search");
    let chars = match fetch_search_top_n(&ctx.client, &ctx.gate, &ctx.snapshot, &asc_class, ctx.top_n_per_ascendancy).await {
        Ok(v) => v,
        Err(e) => {
            // search 失敗 → このアセンダンシーは諦めて次へ。UI のフェーズ表示を消すため completed を投げる
            emit_error(window, &asc_class, "search", e);
            emit_char_progress(window, &asc_class, 0, 0, "completed");
            return None;
        }
    };
    let total = chars.len();
    let current_keys: Vec<String> = chars.iter().map(|c| char_key(&c.account, &c.name)).collect();

    let now_ts = now_unix_seconds();
    let (reused_items, reused_cached, to_fetch) =
        split_reused(chars, ctx.prev_asc.as_ref(), ctx.differential_mode, now_ts);
    // Rust-H3: 「新規取得件数」は spawn 前に控える (中間 emit のガード判定に使う)
    let to_fetch_len = to_fetch.len();
    let join_set = spawn_character_tasks(&ctx, to_fetch).await;

    let mut items: Vec<CharacterItems> = reused_items;
    let mut new_cached: Vec<CachedCharacter> = Vec::with_capacity(to_fetch_len);
    let mut succeeded = reused_cached.len(); // 流用 + 取得成功
    let mut completed = 0usize; // 新規取得分の処理済

    emit_char_progress(window, &asc_class, succeeded, total, "fetching");
    // 1 件完了毎に emit して N/50 を即時更新する (旧 5 件バッチは retry sleep 中に止まって見えた)。
    // タイムアウトで外側が abort_all() した場合、残タスクは cancelled で即 return するので抜けられる。
    loop {
        let mut set_guard = join_set.lock().await;
        let next = set_guard.join_next().await;
        drop(set_guard); // 他の lock 待ちタスクを邪魔しないよう即 release
        let Some(join_result) = next else { break };
        match join_result {
            Ok(Ok(ci)) => {
                new_cached.push(character_items_to_cached(&ci, now_ts));
                items.push(ci);
                succeeded += 1;
            }
            Ok(Err(e)) => emit_error(window, &asc_class, "character", e),
            Err(join_err) => emit_error(window, &asc_class, "join", format!("{join_err}")),
        }
        completed += 1;
        // 中間 emit は最後の 1 件 (= ループ外の final emit) と重複させない
        if completed < to_fetch_len {
            let _ = window.emit(
                "craft-v2-progress",
                &CraftV2Progress {
                    ascendancy: asc_class.clone(),
                    percentage: asc_pct,
                    characters_done: succeeded,
                    characters_total: total,
                    items: items.clone(),
                },
            );
            emit_char_progress(window, &asc_class, succeeded, total, "fetching");
        }
    }

    // アセ完了: フェーズ表示クリア + 最終 progress
    emit_char_progress(window, &asc_class, succeeded, total, "completed");
    let _ = window.emit(
        "craft-v2-progress",
        &CraftV2Progress {
            ascendancy: asc_class.clone(),
            percentage: asc_pct,
            characters_done: succeeded,
            characters_total: total,
            items,
        },
    );

    let ordered = order_by_search(&current_keys, reused_cached, new_cached);
    if ordered.is_empty() {
        return None;
    }
    Some(CachedAscendancy { class: asc_class, percentage: asc_pct, characters: ordered })
}

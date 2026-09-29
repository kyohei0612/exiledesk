//! 1 アセンダンシー分の取得: DPS 順の search → ビルド 3 つ × 10 人 (builds.rs) → 進捗 emit → キャッシュ形式へ
//!
//! 旧 `craft_v2_fetch_all` 内の 300 行 async ブロックを関数へ切り出したもの (2026-09-07 R3)。
//! 2026-09-29: 上位 50 人を並べて取るのをやめ、オーナーの「DPS 順の上位 10 人 → そのスキルを外して次の 10 人、を 3 回」に。
//!   1. 絞らない DPS 順の一覧を頭から取り、メインスキルが 3 つ見つかるまで読む (最大 SCAN_LIMIT 人)
//!   2. 人が足りないビルドは、スキルで絞った DPS 順の一覧 (`skills=`) から足す。別スキルの人が続けば絞れていないとみなしてやめる
//!   3. それでも足りなければ、絞らない一覧の続きを読む (最大 FALLBACK_LIMIT 人)
//! 取得は 1 人ずつ (並列度は元から 1)。外側のタイムアウトで future ごと落ちれば、途中の取得もそこで止まる。

use super::*;

/// アセンダンシー取得 1 回分の共有コンテキスト。
pub(crate) struct AscFetchCtx {
    pub client: Arc<Client>,
    pub gate: RateGate,
    pub snapshot: SnapshotMeta,
    pub window: tauri::Window,
    /// snapshot_version が前回キャッシュと一致 → 既取得キャラは流用
    pub differential_mode: bool,
    pub prev_asc: Option<CachedAscendancy>,
    /// トリガーのメタジェムの名前 (メインスキルは中のスキルを採る。TS がクライアントのジェム表から渡す)
    pub meta_gems: Arc<std::collections::HashSet<String>>,
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

/// `craft-v2-error` emit (phase: "search" | "search-skill" | "character" | "ascendancy-timeout" ...)。
pub(crate) fn emit_error(window: &tauri::Window, asc: &str, phase: &str, error: String) {
    let _ = window.emit(
        "craft-v2-error",
        serde_json::json!({ "ascendancy": asc, "phase": phase, "error": error }),
    );
}

fn char_key(account: &str, name: &str) -> String {
    format!("{account}|{name}")
}

/// 絞らない一覧でスキルを探す時に読む人数の上限
const SCAN_LIMIT: usize = 20;
/// スキルで絞った一覧で、別スキルの人がこれだけ続いたら「絞れていない」とみなす
const MISMATCH_LIMIT: usize = 3;
/// 絞れなかった時に、絞らない一覧を読む人数の上限 (前の上位 50 人と同じ)
const FALLBACK_LIMIT: usize = 50;

/// 取得済みのキャラ (取った順) と、キャラごとのメインスキル (取れなかった人は None)
struct Fetched {
    items: Vec<CharacterItems>,
    cached: Vec<CachedCharacter>,
    main: HashMap<String, Option<(String, f64)>>,
}

/// 1 人取る (差分モードなら前回の物を流用) → メインスキル。中断なら None
async fn get_character(ctx: &AscFetchCtx, asc: &str, r: &CharacterRef, got: &mut Fetched, now_ts: i64) -> Option<Option<(String, f64)>> {
    let key = char_key(&r.account, &r.name);
    if let Some(m) = got.main.get(&key) {
        return Some(m.clone());
    }
    if is_cancel_requested() {
        return None;
    }
    let reused = ctx
        .prev_asc
        .as_ref()
        .filter(|_| ctx.differential_mode)
        .and_then(|p| p.characters.iter().find(|c| char_key(&c.account, &c.name) == key))
        .cloned();
    let (ci, cached) = match reused {
        // 流用キャラの fetched_at は「今」に更新して永続的に古いまま居座るのを防ぐ (Rust-H4)
        Some(c) => (cached_character_to_character_items(&c), CachedCharacter { fetched_at: now_ts, ..c }),
        None => match fetch_character(&ctx.client, &ctx.gate, &ctx.snapshot, r).await {
            Ok(ci) => {
                let cached = character_items_to_cached(&ci, now_ts);
                (ci, cached)
            }
            Err(e) => {
                emit_error(&ctx.window, asc, "character", e);
                got.main.insert(key, None);
                return Some(None);
            }
        },
    };
    let m = main_skill(&cached, &ctx.meta_gems);
    got.items.push(ci);
    got.cached.push(cached);
    got.main.insert(key, m.clone());
    Some(m)
}

/// 進捗を送る (集計は TS が builds のキャラで組み直す)
fn emit_progress(ctx: &AscFetchCtx, asc: &AscendancyMeta, got: &Fetched, picker: &BuildPicker, skill_stats: &Option<SkillUsageStats>, done_phase: bool) {
    let done: usize = picker.builds.iter().map(|b| b.members.len()).sum();
    let total = if done_phase { done.max(1) } else { BUILD_COUNT * BUILD_SIZE };
    emit_char_progress(&ctx.window, &asc.class, done, total, if done_phase { "completed" } else { "fetching" });
    let _ = ctx.window.emit(
        "craft-v2-progress",
        &CraftV2Progress {
            ascendancy: asc.class.clone(),
            percentage: asc.percentage,
            characters_done: done,
            characters_total: total,
            items: got.items.clone(),
            skill_stats: skill_stats.clone(),
            builds: picker.builds.clone(),
        },
    );
}

/// 一覧を頭から読んでビルドに振り分ける。only = Some(スキル) ならそのスキルの人だけ数え、別スキルが続けば false を返す
#[allow(clippy::too_many_arguments)]
async fn read_list(
    ctx: &AscFetchCtx,
    asc: &AscendancyMeta,
    refs: &[CharacterRef],
    limit: usize,
    only: Option<&str>,
    got: &mut Fetched,
    picker: &mut BuildPicker,
    skill_stats: &Option<SkillUsageStats>,
    now_ts: i64,
) -> bool {
    let mut mismatch = 0usize;
    for r in refs.iter().take(limit) {
        let enough = match only {
            Some(s) => !picker.is_short(s),
            None if limit == SCAN_LIMIT => picker.skills_found(),
            None => picker.full(),
        };
        if enough {
            break;
        }
        let key = char_key(&r.account, &r.name);
        let fresh = !got.main.contains_key(&key);
        let Some(m) = get_character(ctx, &asc.class, r, got, now_ts).await else { break };
        match (&m, only) {
            (Some((s, dps)), Some(want)) if s == want => {
                mismatch = 0;
                picker.offer(&key, s, *dps);
            }
            (_, Some(_)) => {
                mismatch += 1;
                if mismatch >= MISMATCH_LIMIT {
                    return false;
                }
            }
            (Some((s, dps)), None) => {
                picker.offer(&key, s, *dps);
            }
            (None, None) => {}
        }
        if fresh {
            emit_progress(ctx, asc, got, picker, skill_stats, false);
        }
    }
    true
}

/// 1 アセンダンシーを取得して CachedAscendancy を返す。
/// search 失敗 / 0 件は None (キャッシュを汚染しない、Rust-H5)。
pub(crate) async fn fetch_one_ascendancy(ctx: AscFetchCtx, asc: AscendancyMeta) -> Option<CachedAscendancy> {
    let asc_class = asc.class.clone();
    let window = &ctx.window;
    emit_char_progress(window, &asc_class, 0, BUILD_COUNT * BUILD_SIZE, "search");
    let search = match fetch_search(&ctx.client, &ctx.gate, &ctx.snapshot, &asc_class, 100).await {
        Ok(v) => v,
        Err(e) => {
            // search 失敗 → このアセンダンシーは諦めて次へ。UI のフェーズ表示を消すため completed を投げる
            emit_error(window, &asc_class, "search", e);
            emit_char_progress(window, &asc_class, 0, 0, "completed");
            return None;
        }
    };
    // 2026-09-14: poe.ninja が表示しているスキル使用率 (そのクラスの全キャラ)。辞書が取れなくても装備の集計は続ける
    let skill_stats = match skill_stats_from_summary(&ctx.client, &ctx.gate, &search.summary).await {
        Ok(s) => s,
        Err(e) => {
            emit_error(window, &asc_class, "skill-stats", e);
            None
        }
    };
    let now_ts = now_unix_seconds();
    let mut got = Fetched { items: Vec::new(), cached: Vec::new(), main: HashMap::new() };
    let mut picker = BuildPicker::default();
    let all = search.characters;

    // 1. スキルを 3 つ見つける
    read_list(&ctx, &asc, &all, SCAN_LIMIT, None, &mut got, &mut picker, &skill_stats, now_ts).await;

    // 2. 足りないビルドはスキルで絞った一覧から
    let mut filter_works = true;
    for skill in picker.short_skills() {
        if is_cancel_requested() {
            break;
        }
        match fetch_search_filtered(&ctx.client, &ctx.gate, &ctx.snapshot, &asc_class, Some(&skill), 100).await {
            Ok(r) => {
                if !read_list(&ctx, &asc, &r.characters, 100, Some(&skill), &mut got, &mut picker, &skill_stats, now_ts).await {
                    // 別スキルの人が続いた = poe.ninja が絞り込みを受け付けていない。残りは絞らない一覧の続きで埋める
                    emit_error(window, &asc_class, "search-skill", format!("{skill} で絞れなかった (別のスキルが続いた)"));
                    filter_works = false;
                    break;
                }
            }
            Err(e) => emit_error(window, &asc_class, "search-skill", e),
        }
    }

    // 3. まだ足りなければ絞らない一覧の続き
    if !filter_works && !picker.full() {
        read_list(&ctx, &asc, &all, FALLBACK_LIMIT, None, &mut got, &mut picker, &skill_stats, now_ts).await;
    }

    emit_progress(&ctx, &asc, &got, &picker, &skill_stats, true);
    // キャッシュにはビルドに入った人だけ (ビルド順・DPS 順)。ビルドが作れなかった時 (スキルが取れない) は取れた人全員
    let mut by_key: HashMap<String, CachedCharacter> = got.cached.into_iter().map(|c| (char_key(&c.account, &c.name), c)).collect();
    let characters: Vec<CachedCharacter> = if picker.builds.is_empty() {
        by_key.into_values().collect()
    } else {
        picker.builds.iter().flat_map(|b| b.members.iter()).filter_map(|k| by_key.remove(k)).collect()
    };
    if characters.is_empty() {
        return None;
    }
    Some(CachedAscendancy { class: asc_class, percentage: asc.percentage, characters, skill_stats, builds: picker.builds })
}

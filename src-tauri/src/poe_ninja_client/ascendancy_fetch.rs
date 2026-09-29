//! 1 アセンダンシー分の取得: DPS 順の search → ビルド 3 つ × 10 人 (builds.rs) → 進捗 emit → キャッシュ形式へ
//!
//! 旧 `craft_v2_fetch_all` 内の 300 行 async ブロックを関数へ切り出したもの (2026-09-07 R3)。
//! 2026-09-29: 上位 50 人を並べて取るのをやめ、オーナーの「DPS 順の上位 10 人 → そのスキルを外して次の 10 人、を 3 回」に。
//! 決め方は builds.rs (スキル 3 つ = DPS 上位 10 人のスキル、足りなければ外して次の 10 人 / ビルド = スキルごとの DPS 上位 10 人)。
//!   1. DPS 順の一覧 (search は 100 人) を頭から 1 人ずつ取ってメインスキルを見る
//!   2. 足りないスキルは `skills=` で絞った DPS 順の一覧から
//!   3. 絞れなければ DPS 順の一覧の続き (最大 SCAN_LIMIT 人)。取得は 1 人ずつ (並列度は元から 1)。
//!   4. 探しても BUILD_MIN 人に届かないスキルは外して 1. から (最大 ROUNDS 回)
//! 外側のタイムアウトで future ごと落ちれば、途中の取得もそこで止まる。

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

/// DPS 順の一覧を読む人数の上限 (search が返すのは 100 人)
const SCAN_LIMIT: usize = 100;
/// 「足りないスキルを外して拾い直す」の回数の上限
const ROUNDS: usize = 4;
/// 絞った一覧で、名前と違うスキルの人がこれだけ続いたら補充をやめる
const MISMATCH_LIMIT: usize = 10;

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
    let builds = picker.builds();
    let done: usize = builds.iter().map(|b| b.members.len()).sum();
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
            builds,
        },
    );
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
    let all = &search.characters;
    let mut next = 0usize;

    let general_head: Vec<String> = all.iter().take(5).map(|r| char_key(&r.account, &r.name)).collect();
    let mut filter_works = true;
    let mut tried: std::collections::HashSet<String> = std::collections::HashSet::new();
    for _round in 0..ROUNDS {
        // 1. DPS 順の一覧を読む (揃うか、一覧の終わりまで)。2026-09-29 実機: 途中で絞った一覧に任せると、
        //    デトネートデッドの人が混ざる絞った一覧からは 0 人で、一覧の奥に居たコンテイジョンまで外していた
        while next < all.len().min(SCAN_LIMIT) && !picker.full() {
            let r = &all[next];
            next += 1;
            let Some(m) = get_character(&ctx, &asc_class, r, &mut got, now_ts).await else { break };
            if let Some((skill, dps)) = m {
                picker.offer(&char_key(&r.account, &r.name), &skill, dps);
            }
            emit_progress(&ctx, &asc, &got, &picker, &skill_stats, false);
        }
        if is_cancel_requested() {
            break;
        }

        // 2. 足りないスキルは、そのスキルで絞った DPS 順の一覧 (`skills=`) から (スキルごとに 1 回)
        for skill in picker.short_skills() {
            if !filter_works || is_cancel_requested() || !tried.insert(skill.clone()) {
                continue;
            }
            let refs = match fetch_search_skill(&ctx.client, &ctx.gate, &ctx.snapshot, &asc_class, Some(&skill), 100).await {
                Ok(r) => r.characters,
                Err(e) => {
                    emit_error(window, &asc_class, "search-skill", e);
                    continue;
                }
            };
            let head: Vec<String> = refs.iter().take(5).map(|r| char_key(&r.account, &r.name)).collect();
            if head == general_head {
                crate::app_log::line_static(&format!("[上位MOD] {asc_class}: poe.ninja が「{skill}」の絞り込みを受け付けなかった。一覧の続きを読む"));
                filter_works = false;
                break;
            }
            let (mut mismatch, mut added) = (0usize, 0usize);
            for r in &refs {
                if !picker.is_short(&skill) || mismatch >= MISMATCH_LIMIT {
                    break;
                }
                let Some(m) = get_character(&ctx, &asc_class, r, &mut got, now_ts).await else { break };
                match m {
                    Some((s, dps)) if s == skill => {
                        mismatch = 0;
                        added += 1;
                        picker.add_extra(&char_key(&r.account, &r.name), &s, dps);
                    }
                    _ => mismatch += 1,
                }
                emit_progress(&ctx, &asc, &got, &picker, &skill_stats, false);
            }
            crate::app_log::line_static(&format!("[上位MOD] {asc_class}: 「{skill}」で絞った一覧から {added} 人"));
        }

        // 3. 探しても BUILD_MIN 人に届かないスキルは外して、次のスキルを拾い直す (一覧の続き or 絞り込み)
        let weak: Vec<String> = picker.weak_skills().into_iter().filter(|s| tried.contains(s) || !filter_works).collect();
        if picker.full() || weak.is_empty() || (!filter_works && next >= all.len().min(SCAN_LIMIT)) {
            break;
        }
        for w in &weak {
            crate::app_log::line_static(&format!("[上位MOD] {asc_class}: 「{w}」は {BUILD_MIN} 人に届かないので外して次のスキルへ"));
            picker.drop_skill(w);
        }
    }

    emit_progress(&ctx, &asc, &got, &picker, &skill_stats, true);
    // キャッシュにはビルドに入った人だけ (ビルド順・DPS 順)。ビルドが作れなかった時 (スキルが取れない) は取れた人全員
    let mut by_key: HashMap<String, CachedCharacter> = got.cached.into_iter().map(|c| (char_key(&c.account, &c.name), c)).collect();
    let builds = picker.builds();
    let characters: Vec<CachedCharacter> = if builds.is_empty() {
        by_key.into_values().collect()
    } else {
        builds.iter().flat_map(|b| b.members.iter()).filter_map(|k| by_key.remove(k)).collect()
    };
    if characters.is_empty() {
        return None;
    }
    Some(CachedAscendancy { class: asc_class, percentage: asc.percentage, characters, skill_stats, builds })
}

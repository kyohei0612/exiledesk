//! 1 アセンダンシー分の取得: DPS 順の search → ビルド 3 つ × 10 人 (builds.rs) → 進捗 emit → キャッシュ形式へ
//!
//! 旧 `craft_v2_fetch_all` 内の 300 行 async ブロックを関数へ切り出したもの (2026-09-07 R3)。
//! 2026-09-29: 上位 50 人を並べて取るのをやめ、オーナーの「DPS 順の上位 10 人 → そのスキルを外して次の 10 人、を 3 回」に。
//! 決め方は builds.rs。poe.ninja の search を `skills=` で絞る・外す (`!`) ので、読むのは毎回 DPS 上位 10 人:
//!   1. 絞らない DPS 上位 10 人 → 一番のスキルを拾う。3 つ未満なら拾ったスキルを外した上位 10 人 (最大 WINDOWS 回)
//!   2. ビルドごとに「そのスキル + 前のビルドのスキルを外す」上位から、一番のスキルがそれの 10 人
//!   3. BUILD_MIN 人に届かないスキルは外して 1. から (最大 ROUNDS 回)。取得は 1 人ずつ (並列度は元から 1)
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

/// スキルを拾う「外して次の 10 人」の回数の上限
const WINDOWS: usize = 4;
/// 「足りないスキルを外して拾い直す」の回数の上限
const ROUNDS: usize = 4;
/// 絞った一覧で、名前と違うスキルの人がこれだけ続いたら補充をやめる
const MISMATCH_LIMIT: usize = 20;

/// 取得済みのキャラ (取った順) と、キャラごとのメインスキル (取れなかった人は None)
struct Fetched {
    items: Vec<CharacterItems>,
    cached: Vec<CachedCharacter>,
    main: HashMap<String, Option<(Vec<String>, f64)>>,
}

/// 1 人取る (差分モードなら前回の物を流用) → メインスキル。中断なら None
async fn get_character(ctx: &AscFetchCtx, asc: &str, r: &CharacterRef, got: &mut Fetched, now_ts: i64) -> Option<Option<(Vec<String>, f64)>> {
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
        // 取り方の版が古いキャッシュ (継続ダメージ・スキル名・オーグメント・リネージュ・キーストーンが無い) は取り直す
        .filter(|c| c.detail >= 1)
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
    let ms = main_skills(&cached, &ctx.meta_gems);
    let m = ms.first().map(|(_, dps)| (ms.iter().map(|(n, _)| n.clone()).collect::<Vec<_>>(), *dps));
    got.items.push(ci);
    got.cached.push(cached);
    got.main.insert(key, m.clone());
    Some(m)
}

/// 進捗を送る (集計は TS が builds のキャラで組み直す)
fn emit_progress(ctx: &AscFetchCtx, asc: &AscendancyMeta, got: &Fetched, builds: &[CachedBuild], skill_stats: &Option<SkillUsageStats>, done_phase: bool) {
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
            builds: builds.to_vec(),
        },
    );
}

/// search の結果 (同じ `skills=` は 1 回だけ叩く)
struct Searches {
    by_param: HashMap<String, Vec<CharacterRef>>,
}

impl Searches {
    async fn get(&mut self, ctx: &AscFetchCtx, asc: &str, param: Vec<String>) -> Vec<CharacterRef> {
        let key = param.join("&");
        if let Some(v) = self.by_param.get(&key) {
            return v.clone();
        }
        let v = match fetch_search_skill(&ctx.client, &ctx.gate, &ctx.snapshot, asc, &param, 100).await {
            Ok(r) => r.characters,
            Err(e) => {
                emit_error(&ctx.window, asc, "search-skill", e);
                Vec::new()
            }
        };
        self.by_param.insert(key, v.clone());
        v
    }
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
    let mut searches = Searches { by_param: HashMap::from([(String::new(), search.characters)]) };
    let mut plan = SkillPlan::default();
    let mut builds: Vec<CachedBuild> = Vec::new();

    'rounds: for _round in 0..ROUNDS {
        // 1. スキルを決める: DPS 上位 10 人 → 足りなければ拾ったスキルを外した上位 10 人 (最大 WINDOWS 回)
        for _ in 0..WINDOWS {
            if plan.full() || is_cancel_requested() {
                break;
            }
            let param = skills_param(None, &plan.excluded());
            let refs = searches.get(&ctx, &asc_class, param).await;
            let before = plan.chosen.len();
            for r in refs.iter().take(BUILD_SIZE) {
                let Some(m) = get_character(&ctx, &asc_class, r, &mut got, now_ts).await else { break 'rounds };
                if let Some((skills, _)) = m {
                    plan.pick(&skills[0]);
                }
                emit_progress(&ctx, &asc, &got, &builds, &skill_stats, false);
            }
            if refs.is_empty() || (plan.chosen.len() == before && plan.excluded().is_empty()) {
                break;
            }
        }

        // 2. ビルド = そのスキルで絞り、前のビルドのスキルを外した DPS 上位 10 人 (一番のスキルがそれの人だけ)
        builds.clear();
        let mut weak: Option<String> = None;
        for k in 0..plan.chosen.len() {
            let skill = plan.chosen[k].clone();
            let refs = searches.get(&ctx, &asc_class, plan.build_param(k)).await;
            let mut b = CachedBuild { skill: skill.clone(), members: Vec::new(), member_skills: Vec::new(), top_dps: 0.0, label: None };
            let mut mismatch = 0usize;
            for r in &refs {
                if b.members.len() >= BUILD_SIZE || mismatch >= MISMATCH_LIMIT {
                    break;
                }
                let Some(m) = get_character(&ctx, &asc_class, r, &mut got, now_ts).await else { break 'rounds };
                match m {
                    Some((skills, dps)) if skills[0] == skill => {
                        mismatch = 0;
                        if b.members.is_empty() {
                            b.top_dps = dps;
                            let key = char_key(&r.account, &r.name);
                            b.label = got.cached.iter().find(|c| char_key(&c.account, &c.name) == key).map(|c| skill_label(c, &skill, &ctx.meta_gems)).filter(|l| *l != skill);
                        }
                        b.members.push(char_key(&r.account, &r.name));
                        b.member_skills.push(skill.clone());
                    }
                    _ => mismatch += 1,
                }
            }
            crate::app_log::line_static(&format!("[上位MOD] {asc_class}: 「{skill}」{} 人 (skills={})", b.members.len(), plan.build_param(k).join("&")));
            if b.members.len() < BUILD_MIN {
                weak = Some(skill);
                break;
            }
            builds.push(b);
            emit_progress(&ctx, &asc, &got, &builds, &skill_stats, false);
        }
        // 3. 人が足りないスキルは外して、次のスキルを拾い直す
        match weak {
            Some(w) => {
                crate::app_log::line_static(&format!("[上位MOD] {asc_class}: 「{w}」は {BUILD_MIN} 人に届かないので外して次のスキルへ"));
                plan.drop_skill(&w);
            }
            None => break,
        }
    }

    emit_progress(&ctx, &asc, &got, &builds, &skill_stats, true);
    // キャッシュにはビルドに入った人だけ (ビルド順・DPS 順)。ビルドが作れなかった時 (スキルが取れない) は取れた人全員
    let mut by_key: HashMap<String, CachedCharacter> = got.cached.into_iter().map(|c| (char_key(&c.account, &c.name), c)).collect();
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

//! クラフト選定ジェムの集計 (2026-09-16)
//!
//! 「レベル 21 / 品質 23% / 両方 (完成品) のジェムを使っている人数」を数える。
//! poe.ninja の全体集計 (search の dimension) にはレベル / 品質の軸が無いので、
//! アセンダンシー 1 つ分の上位キャラだけ character を取って直接数える
//! (オーナー判断: 「一旦ジェムリングのみで試してもええ」= 1 アセなら 40 リクエスト程度)。
//!
//! 進捗は `gem-break-progress` event で emit する (取得はレート制限で数分かかりうる)。
//!
//! 2026-09-18 (オーナー報告「すぐレートが制限になって取るのにかなり時間くう」):
//! キャラごとの結果を `gem_break_cache` に残し、次からはキャッシュに無い人だけ取る。
//! 途中でレート制限に当たっても取れた分は残るので、続きから再開できる。

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

/// 取得中に「中止」が押されたか (レート制限待ちが長い時の逃げ道)
static CANCEL: AtomicBool = AtomicBool::new(false);

/// 取得を中止する。走っているループが次のキャラに移る時に見て抜ける。
#[tauri::command]
pub fn gem_break_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

use crate::gem_break_cache as gcache;
use crate::poe_ninja_client as ninja;

/// 集計 1 行 (ジェム 1 種)
#[derive(Serialize, Clone, Debug, Default)]
pub struct GemBreakRow {
    /// 英語名 (表示時に TS 側で日本語化)
    pub name: String,
    /// そのジェムを使っていた人数
    pub users: u32,
    /// レベル 21 以上で使っていた人数
    pub lvl21: u32,
    /// 品質 23% 以上で使っていた人数
    pub q23: u32,
    /// 両方 (完成品) で使っていた人数
    pub both: u32,
    /// 見えた中で一番高いレベル / 品質
    pub max_level: i64,
    pub max_quality: i64,
    /// コラプト済みで使っていた人数
    pub corrupted: u32,
    /// レベルの分布 (レベル, 人数) レベル昇順。同じキャラの同じレベルは 1 回
    pub level_dist: Vec<(i64, u32)>,
    /// 品質の分布 (品質, 人数) 昇順
    pub quality_dist: Vec<(i64, u32)>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GemBreakResult {
    /// 集計に使ったアセンダンシー (複数なら "上位 N アセ合算")
    pub class: String,
    /// 実際に見たアセンダンシー名
    pub classes: Vec<String>,
    /// そのアセンダンシーの使用率 (%)
    pub percentage: f64,
    /// 実際に取れたキャラ数 (= 母数)
    pub characters: usize,
    /// そのうちキャッシュから流用した人数 (poe.ninja に取りに行かなかった分)
    pub reused: usize,
    /// 取ろうとしたキャラ数 (これより少なければレート制限や中止で打ち切られている)
    pub requested: usize,
    /// 中止ボタンで打ち切ったか
    pub cancelled: bool,
    pub league: String,
    pub snapshot: String,
    /// 取得時刻 (unix 秒)
    pub fetched_at: i64,
    pub rows: Vec<GemBreakRow>,
}

#[derive(Deserialize)]
pub struct GemBreakRequest {
    /// 省略時は使用率トップのアセンダンシー
    pub class: Option<String>,
    /// 取るキャラ数 (既定 40、上限 100)。JS からは topN で来る
    #[serde(alias = "topN")]
    pub top_n: Option<usize>,
    /// 何アセンダンシーに散らすか (既定 1 = class だけ)。2 以上なら使用率上位から均等に取る
    #[serde(alias = "spread")]
    pub spread: Option<usize>,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    done: usize,
    total: usize,
    class: String,
    /// done のうちキャッシュから流用した人数 (画面で「取得 12 / キャッシュ 60」と出す)
    reused: usize,
}

fn emit(window: &tauri::Window, phase: &'static str, done: usize, total: usize, class: &str, reused: usize) {
    let _ = window.emit(
        "gem-break-progress",
        Progress { phase, done, total, class: class.to_string(), reused },
    );
}

/// poe.ninja のジェム properties から数値を 1 つ ("Level" → 21、"[Quality]" → "+23%" の 23)
fn prop_num(props: Option<&serde_json::Value>, key: &str) -> Option<i64> {
    for p in props?.as_array()? {
        if p.get("name").and_then(|v| v.as_str()) != Some(key) {
            continue;
        }
        let raw = p
            .get("values")
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_array())
            .and_then(|a| a.first())
            .and_then(|v| v.as_str())?;
        let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
        return digits.parse::<i64>().ok();
    }
    None
}


/// 1 キャラの中の 1 ジェム (サポート以外)
struct GemView {
    name: String,
    /// poe.ninja の表示値 (装備やアセの「+X to Level of Skills」込み)
    level: i64,
    quality: i64,
    corrupted: bool,
}

/// キャラの skills[] から、サポート以外のジェムを平たく取り出す。
fn gems_of(ci: &ninja::CharacterItems) -> Vec<GemView> {
    let mut out = Vec::new();
    for g in &ci.skills {
        let Some(gems) = g.get("allGems").and_then(|v| v.as_array()) else {
            continue;
        };
        for gem in gems {
            let Some(name) = gem.get("name").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
                continue;
            };
            let item = gem.get("itemData");
            if item.and_then(|d| d.get("support")).and_then(|v| v.as_bool()).unwrap_or(false) {
                continue; // サポートはレベル / 品質を持たない
            }
            let props = item.and_then(|d| d.get("properties"));
            out.push(GemView {
                name: name.to_string(),
                level: prop_num(props, "Level").unwrap_or(0),
                quality: prop_num(props, "[Quality]").unwrap_or(0),
                corrupted: item.and_then(|d| d.get("corrupted")).and_then(|v| v.as_bool()).unwrap_or(false),
            });
        }
    }
    out
}

/// キャラごとのジェムから集計表を作る。
///
/// 2026-09-18: キャッシュだけで組み立てる経路 (try_offline) と同じ計算を使うため関数にした。
fn aggregate(per_char: &[Vec<GemView>]) -> Vec<GemBreakRow> {
    let mut table: HashMap<String, GemBreakRow> = HashMap::new();
    // ジェムごとの分布 (レベル / 品質 → 人数)。同じキャラの同じ値は 1 回
    let mut level_dist: HashMap<String, HashMap<i64, u32>> = HashMap::new();
    let mut quality_dist: HashMap<String, HashMap<i64, u32>> = HashMap::new();
    for gems in per_char {
        // 装備 / アセの底上げを引いて、ジェム自身のレベル / 品質に戻す
        let lvl_bonus = gear_bonus(gems, true);
        let q_bonus = gear_bonus(gems, false);
        // 同じキャラで同じジェムは 1 回だけ数える
        let mut seen: HashSet<String> = HashSet::new();
        let mut seen_l: HashSet<String> = HashSet::new();
        let mut seen_q: HashSet<String> = HashSet::new();
        let mut seen_b: HashSet<String> = HashSet::new();
        let mut seen_c: HashSet<String> = HashSet::new();
        // 分布は (ジェム, 値) 単位で 1 回
        let mut seen_ld: HashSet<(String, i64)> = HashSet::new();
        let mut seen_qd: HashSet<(String, i64)> = HashSet::new();
        for gem in gems {
            let name = gem.name.clone();
            // ジェム自身の値 (コラプトで上がった分だけが 20 / 20% を超える)
            let lvl = (gem.level - lvl_bonus).max(0);
            let q = (gem.quality - q_bonus).max(0);
            let row = table.entry(name.clone()).or_insert_with(|| GemBreakRow {
                name: name.clone(),
                ..Default::default()
            });
            if seen.insert(name.clone()) {
                row.users += 1;
            }
            // コラプト済みでなければ 21 / 23% にはならない (推定を外した時の保険)
            let lvl_ok = gem.corrupted && lvl >= 21;
            let q_ok = gem.corrupted && q >= 23;
            if lvl_ok && seen_l.insert(name.clone()) {
                row.lvl21 += 1;
            }
            if q_ok && seen_q.insert(name.clone()) {
                row.q23 += 1;
            }
            if lvl_ok && q_ok && seen_b.insert(name.clone()) {
                row.both += 1;
            }
            if gem.corrupted && seen_c.insert(name.clone()) {
                row.corrupted += 1;
            }
            row.max_level = row.max_level.max(lvl);
            row.max_quality = row.max_quality.max(q);
            if lvl > 0 && seen_ld.insert((name.clone(), lvl)) {
                *level_dist.entry(name.clone()).or_default().entry(lvl).or_insert(0) += 1;
            }
            if seen_qd.insert((name.clone(), q)) {
                *quality_dist.entry(name.clone()).or_default().entry(q).or_insert(0) += 1;
            }
        }
    }
    let mut rows: Vec<GemBreakRow> = table.into_values().collect();
    for row in &mut rows {
        if let Some(m) = level_dist.remove(&row.name) {
            let mut v: Vec<(i64, u32)> = m.into_iter().collect();
            v.sort_by_key(|(k, _)| *k);
            row.level_dist = v;
        }
        if let Some(m) = quality_dist.remove(&row.name) {
            let mut v: Vec<(i64, u32)> = m.into_iter().collect();
            v.sort_by_key(|(k, _)| *k);
            row.quality_dist = v;
        }
    }
    rows.sort_by(|a, b| b.users.cmp(&a.users).then_with(|| a.name.cmp(&b.name)));
    rows
}

/// キャッシュだけで結果を組み立てられるなら組み立てる (poe.ninja には一切問い合わせない)。
///
/// 条件: 同じ条件の検索結果が SEARCH_FRESH_SECS 以内にあり、その顔ぶれのジェムが全員分あること。
/// 新しい PC では同梱データがそのまま使えるので、初回から 1 リクエストも要らない。
fn try_offline(
    window: &tauri::Window,
    app: &tauri::AppHandle,
    class: String,
    top_n: usize,
    now: i64,
) -> Option<GemBreakResult> {
    let cache = gcache::load_raw(app)?;
    let hit = cache.searches.get(&gcache::search_key(&class, top_n))?;
    if now - hit.fetched_at >= gcache::SEARCH_FRESH_SECS || hit.chars.is_empty() {
        return None;
    }
    let mut per_char: Vec<Vec<GemView>> = Vec::with_capacity(hit.chars.len());
    for (account, name) in &hit.chars {
        let c = cache.characters.get(&gcache::char_key(account, name))?;
        per_char.push(from_cached(&c.gems));
    }
    let label = if class.is_empty() { "全アセンダンシー".to_string() } else { class.clone() };
    let n = per_char.len();
    emit(window, "completed", n, n, &label, n);
    let out = GemBreakResult {
        class: label,
        classes: vec![class],
        percentage: 100.0,
        characters: n,
        reused: n,
        requested: top_n,
        cancelled: false,
        league: cache.league.clone(),
        snapshot: cache.snapshot_name.clone(),
        // キャッシュから組み立てた時は「いつ取ったか」を偽らない (元の取得時刻を出す)
        fetched_at: hit.fetched_at,
        rows: aggregate(&per_char),
    };
    // 通信経路と同じく app_data にも残す (同梱データにする時はこのファイルを使う)
    save_result(app, &out);
    Some(out)
}

/// キャッシュに残す形 (poe.ninja の表示値のまま)
fn to_cached(gems: &[GemView]) -> Vec<gcache::CachedGem> {
    gems.iter()
        .map(|g| gcache::CachedGem { name: g.name.clone(), level: g.level, quality: g.quality, corrupted: g.corrupted })
        .collect()
}

/// キャッシュから集計用に戻す
fn from_cached(gems: &[gcache::CachedGem]) -> Vec<GemView> {
    gems.iter()
        .map(|g| GemView { name: g.name.clone(), level: g.level, quality: g.quality, corrupted: g.corrupted })
        .collect()
}

/// 装備 / アセンダンシー由来の底上げ量を推定する (2026-09-16)。
///
/// poe.ninja の `Level` は「+1 to Level of all Skills」などを **足した表示値** なので、
/// そのまま 21 以上を数えるとコラプトしていないジェムまで数えてしまう
/// (実例: Herald of Plague が corrupted=false で Level 21)。
/// コラプトしていないジェムは素の上限が 20 (品質は 20%) なので、
/// 「コラプトしていないジェムのうち上限付近の値の最頻値 − 20」を底上げ量とみなす。
/// 最頻値を使うのは、タグ限定の +レベル (例: 冷気スキルだけ +2) に引っ張られないようにするため。
fn gear_bonus(gems: &[GemView], pick_level: bool) -> i64 {
    let near_max = if pick_level { 18 } else { 15 };
    let mut counts: HashMap<i64, u32> = HashMap::new();
    for g in gems {
        if g.corrupted {
            continue;
        }
        let v = if pick_level { g.level } else { g.quality };
        if v >= near_max {
            *counts.entry(v).or_insert(0) += 1;
        }
    }
    let best = counts
        .into_iter()
        .max_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)))
        .map(|(v, _)| v)
        .unwrap_or(20);
    (best - 20).max(0)
}

/// 1 つ (または使用率上位いくつか) のアセンダンシーの上位キャラを取って集計する。
#[tauri::command]
pub async fn gem_break_fetch(window: tauri::Window, req: GemBreakRequest) -> Result<GemBreakResult, String> {
    let top_n = req.top_n.unwrap_or(40).clamp(5, 100);
    let spread = req.spread.unwrap_or(1).clamp(1, 10);
    CANCEL.store(false, Ordering::Relaxed);
    let app = window.app_handle().clone();
    let now_ts = || {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0)
    };
    // 前と同じ条件で、顔ぶれもジェムも全部キャッシュにあるなら **1 リクエストも投げずに** 組み立て直す
    // (2026-09-18 オーナー報告「即レート制限」: 1 人も新しく取らない時でも index-state / search で
    //  3 回問い合わせていたので、IP がブロックされているとそこで弾かれていた)
    if spread <= 1 {
        if let Some(r) = try_offline(&window, &app, req.class.clone().unwrap_or_default(), top_n, now_ts()) {
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

/// 集計結果を app_data に残す場所 (画面の localStorage とは別に、同梱データにできる形で持つ)
fn result_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("gem_break_result.json"))
}

/// 集計結果を app_data に残す (通信経路とキャッシュ経路で共通)
fn save_result(app: &tauri::AppHandle, out: &GemBreakResult) {
    let Some(p) = result_path(app) else { return };
    match serde_json::to_string(out) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&p, json) {
                eprintln!("[gem_break] 集計結果を保存できません: {e}");
            }
        }
        Err(e) => eprintln!("[gem_break] 集計結果を JSON 化できません: {e}"),
    }
}

/// 最後に取れた集計結果 (無ければ null)。
///
/// 新しい PC では同梱データ (seed_data) がここに入るので、画面は poe.ninja を叩かずに
/// 監視ジェムを決められる (オーナー指示 2026-09-18「自動ジェム周りのデータだけ内蔵して」)。
#[tauri::command]
pub fn gem_break_stored_result(app: tauri::AppHandle) -> Option<serde_json::Value> {
    let p = result_path(&app)?;
    let raw = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&raw).ok()
}

/// 選べるアセンダンシー (使用率降順)。UI のプルダウン用。
#[tauri::command]
pub async fn gem_break_ascendancies() -> Result<Vec<ninja::AscendancyMeta>, String> {
    let client = ninja::build_client()?;
    let gate = ninja::global_gate();
    let snap = ninja::fetch_index_state(&client, &gate, None).await?;
    ninja::fetch_build_index_state(&client, &gate, &snap.league_url).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(name: &str, level: i64, quality: i64, corrupted: bool) -> GemView {
        GemView { name: name.to_string(), level, quality, corrupted }
    }

    /// 底上げ無し: コラプトしていない最大レベルが 20 なら 0
    #[test]
    fn gear_bonus_is_zero_without_plus_levels() {
        let gems = vec![g("A", 20, 20, false), g("B", 20, 0, false), g("C", 21, 20, true)];
        assert_eq!(gear_bonus(&gems, true), 0);
    }

    /// 「+1 to Level of all Skills」: コラプトしていないジェムが軒並み 21 なら 1
    #[test]
    fn gear_bonus_detects_global_plus_one() {
        let gems = vec![g("A", 21, 20, false), g("B", 21, 20, false), g("C", 22, 20, true)];
        assert_eq!(gear_bonus(&gems, true), 1);
    }

    /// タグ限定の +2 (少数派) には引っ張られない
    #[test]
    fn gear_bonus_ignores_minority_tag_bonus() {
        let gems = vec![
            g("A", 21, 20, false),
            g("B", 21, 20, false),
            g("C", 21, 20, false),
            g("D", 23, 20, false), // 冷気スキルだけ +2 のような例外
        ];
        assert_eq!(gear_bonus(&gems, true), 1);
    }

    /// 上限付近のジェムが無ければ底上げ 0 とみなす (低レベルの補助ジェムだけの時)
    #[test]
    fn gear_bonus_falls_back_to_zero() {
        let gems = vec![g("A", 10, 0, false), g("B", 1, 0, false)];
        assert_eq!(gear_bonus(&gems, true), 0);
    }

    /// 品質も同じ扱い (素の上限 20%)
    #[test]
    fn gear_bonus_handles_quality() {
        let gems = vec![g("A", 20, 20, false), g("B", 20, 20, false), g("C", 20, 23, true)];
        assert_eq!(gear_bonus(&gems, false), 0);
    }
}


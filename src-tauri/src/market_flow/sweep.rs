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
//! 2026-09-26 に 300 行ルールで 1 銘柄ずつ取る本体 (sample_inner) を inner.rs へ分割。
use super::*;

mod inner;
use inner::sample_inner;

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

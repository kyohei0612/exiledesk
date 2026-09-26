//! market_flow/tally.rs — 取った出品を記録に畳み込む (純粋関数)
//!
//! 「2 回続けて消えた = 売れた」「値下げに追従」「一覧から溢れた分は沈んだ扱い」「7 日で掃除」を
//! 決めているのはここ。**通信もファイル I/O もしない**ので、判定を変える時はここだけ見る。
//! 巡回 (いつ・何本投げるか) は sweep 側、保存とコマンドは親モジュール。
//!
//! 2026-09-19 に market_flow.rs (1858 行) から切り出した。
//! 2026-09-26 に 300 行ルールでさらに分割: 畳み込みの本体と掃除は apply.rs、テストは tests.rs / tests/relist.rs。
use super::*;

mod apply;
/// 畳み込みの本体 (apply.rs) も親の名前でそのまま呼べるようにする
pub use apply::*;

#[cfg(test)]
mod tests;

/// 検索の ID 一覧が「出品全部」を含んでいるか。
///
/// ここが true の時だけ「一覧に無い = 売れた」と判定してよい。
///   - ID が総数に届いていない (出品 100 件超で切れている) → 判定しない
///   - 応答が空なのに追跡中がある (通信不良など) → 判定しない
/// 自動巡回と手動取得で同じ式を使うため関数にしてある (2026-09-17 レビュー指摘)
pub fn list_is_complete(ids: &[String], total: u64, tracked: &[Tracked]) -> bool {
    ids.len() as u64 >= total && !(ids.is_empty() && !tracked.is_empty())
}

/// trade2 の出品時刻 ("2026-09-16T10:00:00Z") を unix 秒に。chrono を足さずに手で読む
pub fn parse_indexed(indexed: &str) -> Option<i64> {
    if indexed.len() < 19 {
        return None;
    }
    let num = |s: &str| -> Option<i64> { s.parse::<i64>().ok() };
    let y = num(&indexed[0..4])?;
    let mo = num(&indexed[5..7])?;
    let d = num(&indexed[8..10])?;
    let h = num(&indexed[11..13])?;
    let mi = num(&indexed[14..16])?;
    let sec = num(&indexed[17..19])?;
    // Howard Hinnant の days_from_civil
    let y_adj = if mo <= 2 { y - 1 } else { y };
    let era = if y_adj >= 0 { y_adj } else { y_adj - 399 } / 400;
    let yoe = y_adj - era * 400;
    let mp = (mo + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    Some(days * 86_400 + h * 3600 + mi * 60 + sec)
}

// ============================================================================
// 集計の本体 (テストしやすいよう HTTP から分離)
// ============================================================================

/// 1 回のサンプルを状態に反映する。
///
/// * `ids` … search が返した ID 一覧 (価格の安い順、最大 100)
/// * `entries` … 最安 10 件 (値段つき)。新規は追跡に入れる
/// * `list_complete` … `ids` が出品全部を含んでいるか (総数 < 100 なら true)。
///   true の時だけ「一覧に無い = 消えた」と判断できる。
/// 一覧が切れている時 (出品 100 件超) は、載っていない追跡分を「値段で沈んだ」と数える。
/// BURIED_MAX 回続いたら prune で追跡をやめる (最安帯の捌け方を測るのが目的なので)。
/// 自動経路 / 手動経路で同じ処理 (以前は 3 か所にコピーがあった 2026-09-18)
pub fn mark_buried(state: &mut WatchState, ids: &[String], list_complete: bool) {
    if list_complete || ids.is_empty() {
        return;
    }
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    for t in state.tracked.iter_mut() {
        if t.gone_at.is_none() && !present.contains(t.id.as_str()) {
            t.buried = t.buried.saturating_add(1);
        }
    }
}

/// fetch の応答 (`{ result: [...] }`) を出品 1 件ずつに読む
pub fn parse_fetch_result(v: &serde_json::Value) -> Vec<ListingRef> {
    let Some(arr) = v.get("result").and_then(|x| x.as_array()) else { return Vec::new() };
    arr.iter()
        .filter_map(|item| {
            let id = item.get("id").and_then(|x| x.as_str())?;
            let listing = item.get("listing");
            let price = listing.and_then(|l| l.get("price"));
            Some(ListingRef {
                id: id.to_string(),
                amount: price.and_then(|p| p.get("amount")).and_then(|x| x.as_f64()),
                currency: price.and_then(|p| p.get("currency")).and_then(|x| x.as_str()).map(str::to_string),
                account: listing.and_then(|l| l.get("account")).and_then(|a| a.get("name")).and_then(|x| x.as_str()).map(str::to_string),
                listed_at: listing.and_then(|l| l.get("indexed")).and_then(|x| x.as_str()).and_then(parse_indexed),
            })
        })
        .collect()
}

/// 最安 10 件の外で、追加に出品者を取りに行く上限 (fetch 10 件 × 2 回)
pub const EXTRA_DETAIL_MAX: usize = 20;

/// 消えた出品がある巡で、付け替えの判定のために追加で出品者を取る ID (2026-09-26 オーナー承認)。
///
/// 値段を上げて並べ直した出品は最安 10 件の外に出るので、10 件の詳細だけでは同じ出品者か分からない。
/// 一覧の 11 件目以降で、出品者を知らない物 (追跡していない / 追跡しているが出品者不明) を安い順に最大 20 件。
/// 消えた出品が無い巡・一覧が切れている巡 (そもそも判定しない) は空。
pub fn extra_detail_ids(state: &WatchState, ids: &[String], list_complete: bool) -> Vec<String> {
    if !list_complete {
        return Vec::new();
    }
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let vanished = state.tracked.iter().any(|t| t.gone_at.is_none() && !present.contains(t.id.as_str()));
    if !vanished {
        return Vec::new();
    }
    let known: HashSet<&str> = state.tracked.iter().filter(|t| t.account.is_some()).map(|t| t.id.as_str()).collect();
    ids.iter().skip(10).filter(|id| !known.contains(id.as_str())).take(EXTRA_DETAIL_MAX).cloned().collect()
}

/// その巡の詳細取得 (最安 10 件の fetch) で出品者が取れたか。
///
/// 取れていない巡は「同じ出品者が並べ直したか」を見られないので、消えた判定をしない (2026-09-26 監査)。
/// `requested` はその巡で詳細を取りに行った件数 (0 なら取る物が無かっただけなので失敗ではない)
pub fn fetch_details_ok(requested: usize, entries: &[ListingRef]) -> bool {
    requested == 0 || entries.iter().any(|e| e.account.is_some())
}

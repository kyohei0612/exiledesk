//! 捌き速度の追跡 — 仕様 (2026-09-17 確定版)
//!
//! 「この商品は何日で売れるのか」を、公式 trade2 の出品を定期的に覗いて測る。
//! ジェム専用ではなく、trade2 のクエリを 1 本渡せば何でも追える。
//!
//! ## 1. 見る母集団: インスタントバイアウトだけ (status: securable)
//! 売値の表示も追跡も同じ条件で見る。オーナー指示:「インスタントバイアウトだけ見たらいい。
//! その中でルール決めるからエニーで見る必要が全くない」。
//! 母集団を 1 つに固定したので、画面の「再取得」で取った結果も自動巡回とまったく同じ
//! ルールで判定できる (条件が違う物を混ぜると、消えた/現れたが嘘になる)。
//!
//! トレードサイトのドロップダウンとの対応:
//!   available / securable / onlineleague / online / any
//!   = インスタントバイアウトおよび対面トレード / インスタントバイアウト /
//!     対面トレード (リーグにオンライン) / 対面トレード (オンライン) / 指定なし
//!
//! ## 2. 数え方: 出品 1 件ずつを ID で追う
//! 照合は **ID だけ**で行う (値段や順位は使わない)。安い出品が大量に増えて順位が下がっても、
//! ID 一覧に載っていれば生存。一覧 (最大 100) から溢れた分は直接照会に回す。
//! 追跡中の出品が最安 10 件に入っていれば値段を今の値に更新する (値下げに追従)。
//! 最安 10 件の listing ID を追跡対象に入れ、search が返す ID 一覧に載っているかを見る。
//! 「出品された時刻 (listing.indexed) → 消えた時刻」がその出品の寿命。
//! 窓 (最安 10 件) から押し出されただけの物を売れた扱いにしないため、ID で追う。
//! 例:「50 神が滞留しているところに 40 神が 20 件参戦」→ 最安 10 件は入れ替わるが、
//! 50 神の ID は追跡し続けるので売れたことにはならない。
//!
//! ## 3. 生きているかは「検索の ID 一覧」だけで見る (ここが一番大事)
//! search が返す ID 一覧が、その時点で実際に並んでいる出品そのもの。
//! 一覧から消えた = 売れた (か取り下げた) と数える。
//! オーナー指摘 (2026-09-17):「インスタから対面トレードに切り替える人は存在しない」
//! ので、即時購入の一覧から消えることは実質「売れた」を意味する。
//!
//! **ID を直接 fetch する裏取りは使えない**。2026-09-17 に実測したところ、
//! 既に市場から消えた出品 (指定なしの検索にも出てこない ID) に対しても fetch は
//! 200 で値段つきのデータを返した。つまり fetch はキャッシュの読み出しであって
//! 生存確認にならない。これに気づくまで「売れた」が 1 件も出ない状態が続いた。
//!
//! 誤判定を避けるための条件:
//!   - ID 一覧が総数に届いていない時 (100 件超で切れている) は判定しない。
//!     載っていない追跡分は「値段で沈んだ」として buried を進め、3 回続いたら追跡終了
//!   - 応答が空の時は判定しない (通信不良で全滅させない)
//!   - 消えた出品と同じ出品者が、前回その出品を見た後に新しく並べていたら値段の付け替えとみなし、
//!     売れた件数には数えない (RELIST_SLACK_SECS。見るのは最安 10 件の範囲)
//!   - 消えた扱いの ID がまた現れたら復活させ、日次の件数からも引く
//!
//! ### 出品が増えても回数は増えない
//! search は 1 銘柄 1 回で ID を最大 100 件まとめて返し、fetch も最安 10 件を 1 回なので、
//! **リクエストは銘柄数だけで決まる**。出品が 100 件を超えて一覧が切れている間は
//! 判定せず、載っていない追跡分の buried を進めて BURIED_MAX 回続いたら追跡をやめる
//! (日次の buried に畳む。売れたのか沈んだのかは分からないので survived とは分ける)。
//!
//! ## 4. 取得量 (trade2: 5/10 秒, 15/60 秒, 30/5 分, 600/6 時間 = 毎時 100 回)
//! 前回の一括取得 (手動 / 自動どちらでも swept_at に記録) から周期ぶん経ったら、
//! 全銘柄をまとめて 1 巡する。周期は画面から 1〜24 時間で変えられる (FlowStore.cycle_secs、既定 8 時間)。
//! オーナー指示 (2026-09-17):「自動が 8 時間に 1 回ね」。手動の一括取得はいつでも押せる。
//!   - search  … 1 銘柄 1 巡に 1 回 (生存確認)
//!   - fetch   … 1 銘柄 1 巡に 1 回。値段の更新に加えて、**新しい出品を追跡に入れるのがここ**。
//!               間隔を空けるとその間に出品されて売れた物を丸ごと取りこぼし、速度が遅い側に偏る
//! 送信の間隔は trade2 側の門番 (gate_acquire) が上限ヘッダから決める。罰則を食らう前に待つので
//! 1 巡の途中で長く止まらない (2026-09-18 オーナー指摘「レート止まる」)。
//! 429 や通信エラーで取れなかった銘柄だけ RETRY_GAP_SECS 後に取り直す (MAX_RETRY_ROUNDS 回まで)。
//! HTTP 400 など何度やっても同じ失敗は取り直さない (全銘柄を 10 分おきに回し直す事故を防ぐ)。
//!
//! ## 5. 保存済みクエリは毎回今のルールに直す
//! 追跡は登録時のクエリを使い回すので、条件を変えた時に上書きしないと古い条件のまま回る
//! (2026-09-17 に securable のまま / any のまま を両方踏んだ)。
//! 読み込み時と送信直前に normalize_track_status で status を直し、
//! 直した銘柄・条件が変わった銘柄・リーグが変わった時は記録を作り直す。
//!
//! ## 6. キャッシュの上限
//! 追跡は 1 ID につき 7 日で打ち切り、それ以降は日次集計に畳んで捨てる。
//! 自動リストから外れた銘柄の記録も、7 日触られなければ掃除する。
//!
//! ## 7. 判定 (フロント側 src/services/market-flow.ts)
//! 「1 日以内に売れた割合」で 速い / 普通 / 遅い を出す。割合の分母は結果が分かっている
//! 出品だけ (売れた + その時間を超えて売れ残った) で、齢が足りない物は数えない。
//! 売れ残りを 1 件も観測していないうちは必ず 100% になるので「(暫定)」を付ける。
//!
//! ## 経緯: 滞留時間をやめた理由
//! 最初は「今並んでいる出品が何分前に出された物か」で測っていたが、
//! examples/gem_flow_sim.rs で 6 パターンの市場を作って検算したところ **速い市場ほど遅く出た**。
//! 良い出品は覗く前に売れていて、目に入るのは売れ残りだけだから。そこで ID 追跡に切り替えた。
//!
//! ## 検証 (公式 API は叩かない)
//!   cargo run --example flow_audit   … 事故 8 パターンをダミー応答で再現
//!   pnpm check:flow                  … 判定ロジックと検索条件をダミーで検算

//! ## このモジュールの地図 (2026-09-19 に 1858 行から分割)
//!
//!   types.rs   記録の入れ物 (Watch / Tracked / Daily / WatchState / FlowStore) と定数
//!   tally.rs   取った出品を記録に畳み込む **判定の本体** (純粋関数、通信も I/O もしない)
//!   sweep.rs   巡回 (いつ・何本投げるか)。自動の 1 周 / 手動の一括 / 取り直し / スケジューラー
//!   store.rs   記録の読み書きと監視リストの合流 (merge_watches)
//!   state.rs   巡回中の状態 (走っているか / 進捗 / 直近のエラー / レートの残り)
//!   status.rs  画面に出す FlowStatus と周期の設定
//!   (ここ)     trade2 を叩くコマンド (verify / sample_now / record)
//!
//! 各サブモジュールは private で、ここが pub use でまとめて出すので
//! 呼ぶ側 (lib.rs / examples) は `crate::market_flow::…` のまま。テストはそれぞれのファイルにある。

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex as StdMutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::Manager;

mod tally;
mod sweep;
mod types;
mod state;
mod store;
mod status;
/// 記録の畳み込み (tally.rs) は親の名前でそのまま呼べるようにする
pub use tally::*;
/// 巡回 (sweep.rs) も親の名前で呼べるようにする
pub use sweep::*;
pub use types::*;
pub use state::*;
pub use store::*;
pub use status::*;




/// 記録と、今の検索結果を突き合わせた結果 (画面の「検索と突き合わせ」用)
#[derive(Serialize)]
pub struct VerifyResult {
    /// 今の出品総数
    pub total: u64,
    /// 検索が返した ID の数 (総数に届いていなければ一覧が切れている)
    pub ids: usize,
    /// 追跡中 (まだ消えていない) の件数
    pub tracked: usize,
    /// そのうち検索にも載っていた件数
    pub matched: usize,
    /// 追跡中だが検索に載っていない = 次の巡回で「売れた」と数える候補
    pub missing: Vec<String>,
    /// 検索には居るがまだ追跡していない件数 (最安 10 件に入っていない分)
    pub untracked: usize,
}

/// 記録している ID と、今の検索結果を突き合わせる (検索 1 回)。
///
/// オーナー指摘 (2026-09-17):「その検索がちゃんと機能してないと困る。確認する術ないの」。
/// 判定の土台が検索の ID 一覧なので、ここが噛み合っているかをいつでも確かめられるようにする。
#[tauri::command]
pub async fn market_flow_verify(app: tauri::AppHandle, key: String) -> Result<VerifyResult, String> {
    let store = load_store(&app);
    let watch = store.watches.iter().find(|w| w.key == key).ok_or("その銘柄は登録されていません")?;
    let mut query = watch.query.clone();
    if query.is_null() {
        return Err("この銘柄は検索条件を持っていません".to_string());
    }
    normalize_track_status(&mut query);
    let search = crate::trade2::SearchRequest { patient: true, league: store.league.clone(), site: Some("www".to_string()), query };
    let v = crate::trade2::trade2_search_with(crate::trade_history::session_value(&app), search)
        .await
        .map_err(|e| e.to_string())?;
    let total = v.get("total").and_then(|x| x.as_u64()).unwrap_or(0);
    let ids: Vec<String> = v
        .get("result")
        .and_then(|x| x.as_array())
        .map(|a| a.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let present: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let empty = WatchState::default();
    let state = store.states.get(&key).unwrap_or(&empty);
    let alive: Vec<&Tracked> = state.tracked.iter().filter(|t| t.gone_at.is_none()).collect();
    let tracked_ids: HashSet<&str> = alive.iter().map(|t| t.id.as_str()).collect();
    Ok(VerifyResult {
        total,
        ids: ids.len(),
        tracked: alive.len(),
        matched: alive.iter().filter(|t| present.contains(t.id.as_str())).count(),
        missing: alive.iter().filter(|t| !present.contains(t.id.as_str())).map(|t| t.id.clone()).collect(),
        untracked: ids.iter().filter(|id| !tracked_ids.contains(id.as_str())).count(),
    })
}

/// 今すぐ 1 周サンプルを取る (手動)。取得中なら何もしない。
#[tauri::command]
pub async fn market_flow_sample_now(app: tauri::AppHandle) -> Result<(), String> {
    sample_once(&app).await
}

#[derive(Deserialize)]
pub struct RecordRequest {
    /// 銘柄のキー
    pub key: String,
    /// 画面に出す名前 (未登録なら手動の銘柄として登録する)
    #[serde(default)]
    pub label: Option<String>,
    pub total: u64,
    /// search が返した ID 一覧 (生存確認に使う)
    #[serde(default)]
    pub ids: Vec<String>,
    /// 最安 10 件 (新しく追跡に入れる)
    #[serde(default)]
    pub entries: Vec<ListingRef>,
}

/// 見えていた出品 1 件 (ID と値段)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ListingRef {
    pub id: String,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
    /// 出品者のアカウント名。
    /// オーナー指示 (2026-09-17):「大事なのは出品者の名前と売値が最重要」。
    /// 同じ人がまとめて引き上げたのか、別々の人の出品が売れたのかを見分けるのに使う
    #[serde(default)]
    pub account: Option<String>,
    /// 出品時刻 (unix 秒)。trade2 の listing.indexed を読んだ物
    #[serde(default)]
    pub listed_at: Option<i64>,
}

/// 画面から手で取った結果を同じ記録に差し込む (ジェムコラプトの「再取得」)。
#[tauri::command]
pub fn market_flow_record(app: tauri::AppHandle, req: RecordRequest) -> Result<(), String> {
    let _store_guard = store_lock();
    let mut store = load_store(&app);
    let now = now_secs();
    // 2026-09-16: 画面で取った銘柄はそのまま記録対象にする (チェックを廃止したため)。
    // 手動扱いなので周期の一括取得には入らず、自動リストの入れ替えでも消えない。
    if !store.watches.iter().any(|w| w.key == req.key) {
        store.watches.push(Watch {
            key: req.key.clone(),
            label: req.label.clone().unwrap_or_else(|| req.key.clone()),
            query: serde_json::Value::Null,
            note: "画面で取得".to_string(),
            manual: true,
            auto: false,
        });
    }
    let key = req.key.clone();
    let state = store.states.entry(req.key).or_default();
    // 自動巡回とまったく同じルールで判定する (画面の売値も巡回も条件が同じ securable のため)。
    // ID 一覧が出品全部を含んでいる時だけ「消えた = 売れた」と数える。
    // 応答が空の時は判定しない (通信不良で全滅させないため)
    let list_complete = list_is_complete(&req.ids, req.total, &state.tracked);
    apply_sample(state, now, req.total, &req.ids, &req.entries, list_complete);
    // 自動経路と同じく、一覧が全部取れたかを画面に出す (手動経路だけ更新していなかった 2026-09-18)
    state.list_complete = list_complete;
    mark_buried(state, &req.ids, list_complete);
    prune(state, now);
    store.sampled_at = now;
    // 手動で取った分は自動巡回の成果として組み込む (オーナー指示 2026-09-19:
    // 「手動で取った情報は自動で取ったデータに組み込んで、自動で取った感じで記録しといて」)。
    // 記録そのものは上で同じ経路に入っている。加えて、いま自動巡回が走っていて
    // この銘柄にまだ来ていなければ「この巡では取った」扱いにして、同じ物を取り直させない
    if RUNNING_AUTO.load(Ordering::SeqCst)
        && store.watches.iter().any(|w| w.key == key && w.auto)
        && !store.sweep_done.contains(&key)
    {
        store.sweep_done.push(key);
    }
    save_store(&app, &store)?;
    Ok(())
}

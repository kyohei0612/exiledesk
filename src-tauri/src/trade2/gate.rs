//! trade2/gate.rs — 送り方を決める門番 (いつ投げるかだけ。HTTP は親)
//!
//! 2026-09-19 に trade2.rs (1066 行) から切り出した。
//! サブモジュールは private なので pub にしてもクレートの外には出ない。
use super::*;

// ============================================================================
// レートの門番 (2026-09-18 オーナー指示:「レート止まるね、どうにか止まらんようにしたい、一括で」)
// ============================================================================
//
// これまでは「送ってみて 429 を食らったら待つ」だったので、罰則 (retry-after) を食らうたびに
// 一括取得が数分〜20 分止まっていた。ここを通る全てのリクエスト (画面からの取得も、裏の一括取得も)
// を 1 か所で数え、**上限に当たる前に間隔を空ける**ようにする。罰則を食らわなければ止まらない。
//
// 規則はサーバーが毎回返す x-rate-limit-ip (上限:窓秒:罰則秒) をそのまま使い、
// x-rate-limit-ip-state (現在数:窓秒:残り罰則秒) で自分の記録とサーバーの数え方を突き合わせる
// (同じ IP から手で検索した分など、こちらの記録に無い呼び出しがあるため)。

/// 窓ごとの規則 (上限, 窓の長さ秒)
pub type Rule = (u32, i64);

#[derive(Default)]
pub struct Gate {
    /// 送った時刻 (ミリ秒)。窓の判定に使う
    pub sends: Vec<i64>,
    /// サーバーが返した規則。取れるまでは既定を使う
    pub rules: Vec<Rule>,
    /// 罰則などで送れない時刻 (ミリ秒)
    pub blocked_until: i64,
    /// 窓の長さ(秒) → (前回サーバーが返した現在数, その時刻ミリ秒)。
    ///
    /// 「サーバーの数 > こちらの記録」をそのまま別経路の証拠にすると外れる。2026-09-18 の 6 時間窓が
    /// まさにそれで、送信記録を保存するようになる前 (v0.1.168 より前) の自分の送信 90 回ぶんが
    /// こちらにだけ無く、ずっと「別経路がいる」と誤判定して枠を半分に絞っていた。
    /// 差が一定なら古い履歴、**伸び方がこちらの送信より速ければ**本当に別経路。そのための前回値。
    pub last_state: HashMap<i64, (i64, i64)>,
}

pub static GATES: StdMutex<Option<HashMap<String, Gate>>> = StdMutex::new(None);

/// レート規則ヘッダを丸ごと記録した窓口 (起動ごとに 1 回だけ出す)
pub static HEADERS_LOGGED: StdMutex<std::collections::BTreeSet<String>> =
    StdMutex::new(std::collections::BTreeSet::new());

/// 送信記録の保存先 (アプリを閉じても覚えておくため)。起動時に `load_gates` で入れる。
///
/// 2026-09-18 オーナー報告「一括でやった時に死ぬほどレート引っかかる」:
/// 記録がメモリだけだったので、アプリを再起動するたびに「まだ 1 回も送っていない」状態に戻り、
/// 上限いっぱいまで一気に投げて → サーバ側の枠を使い切って長い待ちに入る、を繰り返していた。
/// 今日は更新で 4 回再起動しているので、そのたびにバーストしていたことになる。
pub static GATE_STORE: StdMutex<Option<std::path::PathBuf>> = StdMutex::new(None);

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct StoredGate {
    sends: Vec<i64>,
    rules: Vec<Rule>,
    blocked_until: i64,
}

/// 起動時に 1 回。保存してあった送信記録を読み込む
pub fn load_gates(path: std::path::PathBuf) {
    if let Ok(mut g) = GATE_STORE.lock() {
        *g = Some(path.clone());
    }
    let Ok(raw) = std::fs::read_to_string(&path) else { return };
    let Ok(stored) = serde_json::from_str::<HashMap<String, StoredGate>>(&raw) else { return };
    let now = now_ms();
    let Ok(mut guard) = GATES.lock() else { return };
    let map = guard.get_or_insert_with(HashMap::new);
    for (kind, st) in stored {
        let sends: Vec<i64> = st.sends.into_iter().filter(|t| *t > now - 6 * 3600 * 1000).collect();
        let e = map.entry(kind).or_default();
        e.sends = sends;
        e.rules = st.rules;
        e.blocked_until = st.blocked_until;
    }
}

/// 送信記録を保存する (GATES の lock を持っている間に呼ぶ)
pub fn save_gates_locked(map: &HashMap<String, Gate>) {
    let Some(path) = GATE_STORE.lock().ok().and_then(|g| g.clone()) else { return };
    let stored: HashMap<&String, StoredGate> = map
        .iter()
        .map(|(k, g)| {
            (
                k,
                StoredGate {
                    sends: g.sends.clone(),
                    rules: g.rules.clone(),
                    blocked_until: g.blocked_until,
                },
            )
        })
        .collect();
    if let Ok(json) = serde_json::to_string(&stored) {
        let _ = std::fs::write(path, json);
    }
}

/// 規則が取れるまでの控えめな既定 (search の公表値より 1 段きつめ)
pub fn default_rules() -> Vec<Rule> {
    vec![(4, 10), (12, 60), (24, 300)]
}

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// エンドポイントごとの最低間隔。
///
/// 2026-09-18 オーナー報告「昨日は一括押しても止まらなかった」→ 何が変わったかを記録で突き合わせた。
/// v0.1.159 のレビューで、画面側 (pricing.ts) が持っていた最低間隔 (search 10.5 秒 / fetch 2.5 秒) を
/// 「Rust の門番があるから二重待ちになる」と外していた。門番は窓の上限しか見ないので、
/// 手動の再取得が **3 発を 1 秒以内**に出せるようになり (記録で確認: 18:28:49-50 に 3 発)、
/// そこから 429 (retry-after 600 秒) を踏んでいた。昨日まで効いていた値をこちらに移す。
///
/// 2026-09-26 オーナー「間隔だけど 8 割使いにしようか」: search の最低間隔を 10.5 秒 → 2.6 秒に。10.5 秒は
/// 「5 分 30 回」を 1 本ずつ均した値で、10 秒 5 回の burst 枠を全く使っていなかった (クラフト計算機の 1 回の
/// 貼り付け = 6 本で 60 秒待ち)。窓の上限 (10 秒 5 / 60 秒 15 / 5 分 30) は `window_wait` が 8 割で止めるので、
/// 2.6 秒は「10 秒に 4 本」の burst の中の並び間隔。連打でぶつかった 2026-09-18 の再発は窓の 8 割で防ぐ
pub fn min_spacing_ms(kind: &str) -> i64 {
    match kind {
        "search" => 2_600,
        _ => 2_500,
    }
}

/// 窓ごとの上限に対して「あと何ミリ秒待てば 1 枠空くか」。空いていれば 0
pub fn window_wait(sends: &[i64], rules: &[Rule], now: i64) -> i64 {
    let mut wait = 0;
    for &(max, period) in rules {
        // 上限の 8 割で止める (オーナー 2026-09-26:「8 割使い」。同じ IP の別経路 (ブラウザのトレードサイト等) の分が
        // サーバー側で足されるので、ぴったりまで使わない)。5:10 → 4、15:60 → 12、30:300 → 24
        let keep = ((max * 8) / 10).max(1) as usize;
        let window_ms = period * 1000;
        let in_window: Vec<i64> = sends.iter().copied().filter(|t| *t > now - window_ms).collect();
        if in_window.len() >= keep {
            // 一番古い物が窓から出た瞬間に 1 枠空く
            let oldest = in_window[in_window.len() - keep];
            wait = wait.max(oldest + window_ms + 300 - now);
        }
    }
    wait
}

/// その窓口だけで見た待ち時間
pub fn wait_for_rules(g: &Gate, now: i64, spacing_ms: i64) -> i64 {
    let mut wait = (g.blocked_until - now).max(0);
    // 直前の送信からは最低 spacing_ms 空ける (窓に余裕があっても burst にしない)
    if let Some(last) = g.sends.iter().max() {
        wait = wait.max(last + spacing_ms - now);
    }
    // 別経路 (ブラウザのトレード検索など) を見つけても枠は縮めない (2026-09-19 オーナー
    // 「アプリ側で制限かけるの良くない。送り方を統一して踏まないように」)。ログに残すだけ
    let rules = if g.rules.is_empty() { default_rules() } else { g.rules.clone() };
    wait.max(window_wait(&g.sends, &rules, now))
}


/// 待てる上限。これを超える待ちは「今は無理」と返して、呼び側にエラーを出させる
/// (2026-09-18: 上限が無く、罰則 10 分の時に「再取得」が無反応のまま 10 分固まっていた)
pub const MAX_GATE_WAIT_MS: i64 = 90_000;

/// 今、画面 (90 秒で諦める側) が枠を待っている数。
///
/// 2026-09-19 オーナー「次とってくれない、カルグール」: 巡回を「枠が空くまで 20 分粘る」に
/// したら、今度は画面の取得が巡回に枠を取られ続けて 90 秒で諦めるようになった
/// (どちらも 2 秒おきに覗くので、空いた枠は先に覗いた方が取る = ほぼ半々)。
/// 画面は人が待っているので、巡回は画面が待っている間は枠を譲る。
pub static IMPATIENT_WAITING: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
/// 画面が待っている間、巡回が譲って次に覗くまで
pub const PATIENT_YIELD_MS: i64 = 500;

/// 画面の待ちを数える (落ちても減るように Drop で戻す)
pub struct ImpatientGuard;
impl ImpatientGuard {
    fn new() -> Self {
        IMPATIENT_WAITING.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Self
    }
}
impl Drop for ImpatientGuard {
    fn drop(&mut self) {
        IMPATIENT_WAITING.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

/// 送ってよくなるまで待って、送った記録を残す。全ての trade2 リクエストがここを通る。
/// 待ちが長すぎる時は Err (呼び側が「レート制限中: あと N 秒」として返す)
pub async fn gate_acquire(kind: &str) -> Result<(), String> {
    gate_acquire_with(kind, MAX_GATE_WAIT_MS).await
}

/// 裏の巡回が待てる上限。画面の「再取得」と違って人を待たせないので、枠が空くまで粘ってよい。
///
/// 2026-09-19 オーナー「だめだ、どうがんばっても中止される、途中で訳わからん」:
/// 429 を踏んで合計の上限が下がると、枠が空くまでの待ちが 90 秒を超える。門番はそこで
/// 「今は無理」と返し、巡回はその銘柄を取りこぼしに回す。取り直しの周も同じ理由で即座に
/// 全滅し、12 周ぶん一瞬で使い切って「9 銘柄が取れませんでした」になっていた。
/// 待ちは罰則ではなく順番待ちなので、巡回は待てばよい。
pub const PATIENT_MAX_WAIT_MS: i64 = 20 * 60 * 1000;

pub async fn gate_acquire_with(kind: &str, max_wait_ms: i64) -> Result<(), String> {
    // 長く待てる側 (巡回) か、人が待っている側 (画面) か
    let patient = max_wait_ms > MAX_GATE_WAIT_MS;
    let _impatient = if patient { None } else { Some(ImpatientGuard::new()) };
    let mut waited = 0i64;
    loop {
        // (待ち ms, 罰則で止まっているか)
        let (wait, penalized) = {
            let mut guard = match GATES.lock() {
                Ok(g) => g,
                Err(_) => return Ok(()),
            };
            let map = guard.get_or_insert_with(HashMap::new);
            let now = now_ms();
            let g = map.entry(kind.to_string()).or_default();
            g.sends.retain(|t| *t > now - 6 * 3600 * 1000);
            let own = wait_for_rules(g, now, min_spacing_ms(kind));
            // 枠は IP 単位なので、全窓口を合わせた分も見る
            let mut wait = own.max(combined_wait(map, now));
            // 空いていても、画面が待っているなら巡回は譲る
            if wait <= 0 && patient && IMPATIENT_WAITING.load(std::sync::atomic::Ordering::SeqCst) > 0 {
                wait = PATIENT_YIELD_MS;
            }
            if wait <= 0 {
                map.entry(kind.to_string()).or_default().sends.push(now);
                bucket_take(now);
                save_gates_locked(map);
            }
            (wait, map.values().any(|g| g.blocked_until > now))
        };
        if wait <= 0 {
            return Ok(());
        }
        if waited + wait > max_wait_ms {
            // 罰則 (429) と枠待ち (自分の上限) は別物なので文を分ける。画面はどちらも秒数として読む
            let secs = (wait + 999) / 1000;
            return Err(if penalized {
                format!("trade2 レート制限中 (あと {secs} 秒)。少し待ってから取得してください")
            } else {
                format!("trade2 の枠待ち (あと {secs} 秒)。裏の巡回と枠を分け合っています")
            });
        }
        let step = wait.min(2000);
        waited += step;
        tokio::time::sleep(Duration::from_millis(step as u64)).await;
    }
}

/// 同じ瞬間の状態なので 1 回で返す。
#[derive(serde::Serialize, Clone, Copy, Default)]
pub struct GateStatus {
    /// 罰則 (429 / restricted) の解除予定 (unix 秒)。0 = 止まっていない。
    /// **これだけが「止まっている」**。下の wait_secs は順番待ちで、放っておけば進む
    pub penalty_until: i64,
    /// 次の 1 本を投げられるまで (秒)。一定の間隔 (300 秒 ÷ 上限) と最低間隔のうち長い方
    pub wait_secs: i64,
    /// 直近 5 分に全窓口あわせて送った数
    pub used_300: i64,
    /// 今の合計の 5 分上限 (429 を踏むと下がる)
    pub max_300: i64,
}

/// 門番の状態をまとめて返す (GATES の lock は 1 回)
pub fn gate_status() -> GateStatus {
    let Ok(mut guard) = GATES.lock() else { return GateStatus::default() };
    let map = guard.get_or_insert_with(HashMap::new);
    let now = now_ms();
    let mut penalty_until = 0;
    let mut wait = combined_wait(map, now);
    let mut used_300 = 0;
    for (kind, g) in map.iter() {
        if g.blocked_until > now {
            penalty_until = penalty_until.max(g.blocked_until / 1000);
        }
        wait = wait.max(wait_for_rules(g, now, min_spacing_ms(kind)));
        used_300 += g.sends.iter().filter(|t| **t > now - 300_000).count() as i64;
    }
    GateStatus { penalty_until, wait_secs: (wait + 999) / 1000, used_300, max_300: combined_cap() }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::trade2::testutil::*;

    /// 枠が余っていれば待たない (ただし直前の送信からは最低 MIN_SPACING_MS 空ける)
    #[test]
    fn free_slot_does_not_wait() {
        let now = 1_000_000;
        let g = gate(vec![now - 11_000], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now, SPACING), 0);
    }

    /// 枠が空いていても 1 秒以内に連発はしない (2026-09-18: 手動の再取得が 3 発を 1 秒で出していた)
    #[test]
    fn burst_is_spaced_out() {
        let now = 1_000_000;
        let g = gate(vec![now - 500], vec![(5, 10)], 0);
        assert_eq!(wait_for_rules(&g, now, SPACING), 10_000, "直前の送信から 10.5 秒空ける");
    }


    /// 上限の手前 (余裕 1) まで使ったら、一番古い送信が窓から出るまで待つ
    #[test]
    fn waits_until_oldest_leaves_the_window() {
        let now = 1_000_000;
        // 上限 5 / 10 秒 → 余裕 1 なので 4 件で止める。一番古いのは 3 秒前
        let sends = vec![now - 9_000, now - 8_000, now - 7_000, now - 6_000];
        let g = gate(sends, vec![(5, 10)], 0);
        // 9 秒前の分が窓 (10 秒) から出るまで = あと 1 秒 + 余白 0.3 秒。
        // ただし直前の送信 (6 秒前) から 10.5 秒の最低間隔の方が長いのでそちらが効く
        assert_eq!(wait_for_rules(&g, now, SPACING), 4_500);
    }

    /// 窓が複数ある時は一番長く待つ物に合わせる
    #[test]
    fn takes_the_longest_wait_of_all_windows() {
        let now = 1_000_000;
        let mut sends: Vec<i64> = (0..13).map(|i| now - 50_000 + i * 100).collect();
        sends.push(now - 11_000);
        let g = gate(sends, vec![(5, 10), (15, 60)], 0);
        // 60 秒窓 (上限 15、余裕 2 → 13 件) の方が長い
        assert!(wait_for_rules(&g, now, SPACING) > 9_000);
    }




    /// 罰則中はその解除まで待つ
    #[test]
    fn penalty_blocks_until_it_clears() {
        let now = 1_000_000;
        let g = gate(vec![], vec![(5, 10)], now + 30_000);
        assert_eq!(wait_for_rules(&g, now, SPACING), 30_000);
    }
}

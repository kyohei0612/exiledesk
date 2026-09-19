//! trade2/pace.rs — **どの速さで送るか** (合計の上限とトークンバケット)
//!
//! 429 を踏むたびに上限を下げ (= 間隔を伸ばし)、静かなら戻す。送り方は一定の間隔 +
//! 小さなバーストだけで決まる。窓ごとに数えて止めるやり方は 2026-09-19 にやめた
//! (オーナー「アプリ側で制限かけるの良くない。送り方さえ統一して踏まないように」)。
use super::*;

/// 全窓口あわせた枠。同じ長さの窓を持つ規則のうち**一番きつい上限**を、合計の送信数に当てる。
///
/// 2026-09-18 の実測。**公表されている規則ではこの 429 は説明がつかない**ので、経験則で置いている。
///
/// サーバーが返す規則は search が 5 分 30 回 (policy trade-search-request-limit)、
/// fetch が 5 分 50 回 (trade-fetch-request-limit)。どちらも rules は "Ip" だけで、
/// state の数え方も窓口ごとに独立している (片方を 1 回投げてももう片方の数は増えない)。
/// つまり公表ぶんは確かに窓口ごとの枠。それでも 429 が出る:
///   - 429 の応答には x-rate-limit-* が**1 つも付かない**。policy 名も無く、
///     本文は `{"error":{"code":3,"message":"Rate limit exceeded"}}` だけ。
///     公表された規則の違反ならヘッダが付いて restricted が立つはずなので、これは別の制限。
///     どの窓で断られたのかはサーバーからは永久に分からない = 手前で防ぐしかない
///   - 罰則は IP 単位 (search と fetch の 429 の解除時刻がミリ秒まで同じだった)
///   - 429 を食らった時の**合計**送信数 (直近 5 分) は 24 / 25 / 30 / 32 回。通ったのは最大 29 回。
///     窓口ごとの上限にはどちらも遠いが、合計で見ると 30 前後にきれいに揃う
/// ので「合計で 5 分 30 回」を隠れた上限とみなして手前で止める。別々に数えていた頃は
/// 合計 5 分 57 回投げていて (10.5 秒ごとに search と fetch を 1 組)、2 分ごとに 429 を踏んでいた。
/// この数字は観測から置いた推定値で、公表値ではない。
///
/// 2026-09-19 に引き下げ (オーナー了承)。それまで search の公表値 30 をそのまま合計に当てていたが、
/// 429 を食らった時の合計 (直近 5 分) の観測が 24 / 25 / 30 / 32 / **21** 回で、
/// 通ったのは最大 29 回。**21 回で断られた記録が出た**ので 30 では高すぎる。
/// 22 に下げる (門番は上限から 2 残すので、実際には 5 分 20 回 = 15 秒に 1 回まで)。
/// 代償: 42 銘柄 (84 リクエスト) の 1 巡が 20 分 → 約 27 分。止まるよりは待つ方を採る。
pub const COMBINED_MAX_300: u32 = 22;
/// これ以上は下げない (下げすぎると 1 巡が現実的でなくなる)
pub const COMBINED_MIN_300: u32 = 10;
/// 429 を食らわずにこれだけ経ったら 1 段戻す
pub const RECOVER_QUIET_MS: i64 = 45 * 60 * 1000;

/// 今使っている合計の 5 分上限。**429 を食らうたびに自分で下げる**。
///
/// 2026-09-19 オーナー「なんか取れんかったっぽい、マジで何でなん」:
/// 上限を 22 (実効 20) まで下げたのに、**ちょうど 20 回で 429** を 2 回食らった。
/// サーバーは 429 に規則を返さないので本当の線は分からず、こちらが当て続けるしかない。
/// 当てるのをやめて、踏んだら 4 分の 3 に下げ、しばらく踏まなければ 1 ずつ戻す。
pub static ADAPTIVE_MAX: StdMutex<u32> = StdMutex::new(COMBINED_MAX_300);
/// 最後に 429 を食らった時刻 (戻すかの判断に使う)
pub static LAST_PENALTY_AT: StdMutex<i64> = StdMutex::new(0);

pub fn adaptive_max() -> u32 {
    ADAPTIVE_MAX.lock().map(|g| *g).unwrap_or(COMBINED_MAX_300)
}

/// 429 を踏んだので上限を下げる。下がった値を返す
pub fn lower_adaptive_max(now: i64) -> u32 {
    if let Ok(mut at) = LAST_PENALTY_AT.lock() {
        *at = now;
    }
    let Ok(mut g) = ADAPTIVE_MAX.lock() else { return COMBINED_MAX_300 };
    *g = (*g * 3 / 4).max(COMBINED_MIN_300);
    *g
}

/// しばらく 429 を踏んでいなければ 1 段戻す (静かな時に少しずつ速さを取り戻す)
pub fn maybe_recover_adaptive_max(now: i64) {
    let last = LAST_PENALTY_AT.lock().map(|g| *g).unwrap_or(0);
    if last == 0 || now - last < RECOVER_QUIET_MS {
        return;
    }
    if let Ok(mut at) = LAST_PENALTY_AT.lock() {
        *at = now;
    }
    if let Ok(mut g) = ADAPTIVE_MAX.lock() {
        if *g < COMBINED_MAX_300 {
            *g += 1;
            crate::app_log::line_static(&format!("[trade2] 静かなので合計の 5 分上限を {} に戻します", *g));
        }
    }
}

/// 5 分窓の上限が前より大きくなったか (規則が広がった = 別の環境になった)
pub fn rules_widened(old: &[Rule], new: &[Rule]) -> bool {
    let max300 = |rs: &[Rule]| rs.iter().filter(|(_, p)| *p == 300).map(|(m, _)| *m).max();
    match (max300(old), max300(new)) {
        (Some(o), Some(n)) => n > o,
        _ => false,
    }
}

/// 合計 (search + fetch) に当てるのは **5 分あたりの隠れた上限だけ**。
///
/// 長い窓 (3 時間 600 / 1000 回) は窓口ごとに公表どおり数えられているので、合計に当てて
/// 自分を縛らない。2026-09-19 まで当てていて、合計 ≈300 で 27 分の偽の待ちを作っていた。
/// 実際の送り方はこの上限を 300 秒で割った**一定の間隔** (combined_wait のトークンバケット)。
pub fn combined_cap() -> i64 {
    adaptive_max() as i64
}

/// 合計の送り方は **一定の間隔 + 小さなバースト** (トークンバケット)。
///
/// 2026-09-19 オーナー「裏の巡回回してないのにレート制限なってる。アプリ側で制限かけるの
/// 良くない気がしてきた。送り方さえ統一して踏まないようにした方が良い」:
/// 5 分窓で合計を数えていると、短時間に 11 本 (ジェムを 2 つ開いただけ) → 「あと 203 秒」の
/// 停止、という波ができる。同じ量でも**一定の間隔で流す**なら止まる瞬間が無い。
///   - 間隔 = 300 秒 ÷ 合計上限 (22 なら 13.6 秒)。429 を踏めば上限が下がって間隔が伸びる
///   - バースト = 画面でジェムを 1 つ開く 6 本ぶんは待たずに出せる (貯めた分だけ)
/// 5 分の平均は今までの上限と同じで、最大でも「上限 + バースト」を超えない
pub const BURST: f64 = 6.0;

/// 今の合計の間隔 (ms)
pub fn pace_ms() -> i64 {
    300_000 / adaptive_max().max(1) as i64
}

/// トークンの残り (BURST まで貯まる) と、最後に数えた時刻
pub static BUCKET: StdMutex<(f64, i64)> = StdMutex::new((BURST, 0));

/// 貯まった分を足して今の残りを返す (消費はしない)
pub fn bucket_tokens(now: i64) -> f64 {
    let Ok(mut b) = BUCKET.lock() else { return BURST };
    let (tokens, at) = *b;
    let refilled = if at == 0 { BURST } else { (tokens + (now - at) as f64 / pace_ms() as f64).min(BURST) };
    *b = (refilled, now);
    refilled
}

/// 1 本ぶん消費する (gate_acquire で枠を取った時)
pub fn bucket_take(now: i64) {
    let t = bucket_tokens(now);
    if let Ok(mut b) = BUCKET.lock() {
        *b = ((t - 1.0).max(0.0), now);
    }
}

/// 全窓口を合わせた待ち時間 = 次のトークンが貯まるまで
pub fn combined_wait(_map: &HashMap<String, Gate>, now: i64) -> i64 {
    let t = bucket_tokens(now);
    if t >= 1.0 {
        0
    } else {
        ((1.0 - t) * pace_ms() as f64).ceil() as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trade2::testutil::*;

    /// 合計はトークンバケット: バーストぶんは待たず、その後は一定の間隔で 1 本ずつ (2026-09-19)
    #[test]
    fn combined_pace_is_a_token_bucket() {
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
        *BUCKET.lock().unwrap() = (BURST, 0);
        let map = HashMap::new();
        let now = 1_000_000_000;
        assert_eq!(combined_wait(&map, now), 0, "貯まっていれば待たない");
        for _ in 0..BURST as usize {
            bucket_take(now);
        }
        let w = combined_wait(&map, now);
        assert_eq!(w, pace_ms(), "使い切ったら次の 1 本は間隔ぶん待つ (22 回/5 分 = 13.6 秒)");
        assert_eq!(combined_wait(&map, now + pace_ms()), 0, "間隔が過ぎれば 1 本出せる");
        assert!(bucket_tokens(now + 10 * pace_ms()) <= BURST, "バースト以上には貯まらない");
        *BUCKET.lock().unwrap() = (BURST, 0);
    }

    /// 429 を食らったら合計の上限を自分で下げ、下限より下には行かない (2026-09-19)
    #[test]
    fn a_penalty_lowers_the_combined_cap() {
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
        let now = now_ms();
        assert_eq!(lower_adaptive_max(now), COMBINED_MAX_300 * 3 / 4, "4 分の 3 に下がる");
        for _ in 0..20 {
            lower_adaptive_max(now);
        }
        assert_eq!(adaptive_max(), COMBINED_MIN_300, "下限より下には行かない");
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
    }

    /// search と fetch は 1 つの枠として数える (罰則が IP 単位なので上限も IP 単位)。
    /// 別々に数えていた頃は、合計で 5 分 57 回投げて 429 を食らっていた (2026-09-18)
    #[test]
    fn search_and_fetch_share_one_budget() {
        // 適応する上限は全テストで共有なので、ここで基準値に戻してから測る
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
        let now = 1_000_000_000;
        let mut map = HashMap::new();
        // それぞれの上限 (30 / 50) には遠いが、合わせると search の 30 に届く
        map.insert("search".to_string(), gate((0..14).map(|i| now - i * 10_000).collect(), vec![(30, 300)], 0));
        map.insert("fetch".to_string(), gate((0..14).map(|i| now - i * 10_000 - 1_000).collect(), vec![(50, 300)], 0));
        for (kind, g) in map.iter() {
            assert_eq!(window_wait(&g.sends, &g.rules, now), 0, "{kind} 単体では空いている");
        }
        assert_eq!(combined_cap(), COMBINED_MAX_300 as i64, "5 分の合計上限は表示用に残す");
    }

    /// 3 時間窓は窓口ごとの枠 (search 600 / fetch 1000)。合計に当てて自分で縛らない (2026-09-19 22:19 の偽の 27 分待ち)
    #[test]
    fn long_windows_are_not_combined() {
        let _lock = GLOBAL_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        *ADAPTIVE_MAX.lock().unwrap() = COMBINED_MAX_300;
        let now = 1_000_000_000;
        let mut map = HashMap::new();
        // 3 時間に search 154 + fetch 145 (実測)。直近 5 分は 3 件だけ
        let sg = gate((0..154).map(|i| now - 400_000 - i * 60_000).collect(), vec![(8, 10), (15, 60), (60, 300), (600, 10800)], 0);
        let fg = gate((0..145).map(|i| now - 400_000 - i * 60_000).collect(), vec![(12, 4), (16, 12), (100, 300), (1000, 10800)], 0);
        map.insert("search".to_string(), sg);
        map.insert("fetch".to_string(), fg);
        *BUCKET.lock().unwrap() = (BURST, 0);
        assert_eq!(combined_wait(&map, now), 0, "3 時間の合計 299 で待ってはいけない");
        for (kind, g) in map.iter() {
            assert_eq!(window_wait(&g.sends, &g.rules, now), 0, "{kind} の 3 時間窓は公表どおり (600 / 1000) のまま");
        }
    }
}

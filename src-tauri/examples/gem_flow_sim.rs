//! 売れ行き指標の検証シミュレーション (2026-09-16、調査用)
//!
//! オーナー指摘: 「最安の奴は即売れ、かつその価格帯でずっと推移したら、
//! さばくのは速いのに遅い判定が出るのでは」。
//!
//! そこで市場をダミーで作り、1 時間ごとに「最安 10 件」を覗いた時に各指標が
//! どう出るかと、実際の待ち時間 (出品 → 売却) を突き合わせる。
//!
//! 実行: cargo run --example gem_flow_sim

/// 決定的な乱数 (mulberry32)
struct Rng(u32);
impl Rng {
    fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6D2B_79F5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64) / 4_294_967_296.0
    }
}

#[derive(Clone, Debug)]
struct Listing {
    id: u64,
    price: f64,
    listed_at: i64,
    /// 売れない (相場から外れた強気の値付け)
    stale: bool,
}

struct Scenario {
    name: &'static str,
    /// 1 時間あたりの出品数
    arrivals_per_hour: f64,
    /// 1 時間あたりの買い手の数
    buyers_per_hour: f64,
    /// 出品のうち「相場から外れて売れない」割合
    stale_ratio: f64,
    /// 売れる出品の価格 (相場) のばらつき
    price_spread: f64,
}

/// 1 サンプル (1 時間ごとに最安 10 件を覗いた結果)
#[derive(Default)]
struct Metrics {
    median: Vec<f64>,
    mean: Vec<f64>,
    p25: Vec<f64>,
    min: Vec<f64>,
    /// 最安の出品が前回から入れ替わっていた割合
    cheapest_changed: Vec<f64>,
    listed_total: Vec<f64>,
    /// 前回見えていた出品のうち、1 時間後に消えていた割合 (値段で見えるはずの物だけ数える)
    gone_rate: Vec<f64>,
    /// 消失から見積もった待ち時間 (見えている数 ÷ 1 時間の消失数)
    est_wait: Vec<f64>,
    /// 値段の補正をしない素朴な消失率 (押し出されただけの物も数える)
    gone_raw: Vec<f64>,
}

fn pct(sorted: &[i64], p: f64) -> f64 {
    if sorted.is_empty() {
        return f64::NAN;
    }
    let idx = ((sorted.len() - 1) as f64 * p).round() as usize;
    sorted[idx] as f64
}

fn mean(v: &[f64]) -> f64 {
    let v: Vec<f64> = v.iter().copied().filter(|x| x.is_finite()).collect();
    if v.is_empty() {
        return f64::NAN;
    }
    v.iter().sum::<f64>() / v.len() as f64
}

fn fmt_min(m: f64) -> String {
    if !m.is_finite() {
        return "—".to_string();
    }
    if m < 60.0 {
        format!("{m:.0} 分")
    } else if m < 1440.0 {
        format!("{:.1} 時間", m / 60.0)
    } else {
        format!("{:.1} 日", m / 1440.0)
    }
}

/// 判定 (今の実装): 中央値 60 分以内=速い / 360 分以内=普通 / それ以上=遅い
fn verdict(minutes: f64) -> &'static str {
    if !minutes.is_finite() {
        "—"
    } else if minutes <= 60.0 {
        "速い"
    } else if minutes <= 360.0 {
        "普通"
    } else {
        "遅い"
    }
}

fn run(sc: &Scenario, seed: u32) -> (f64, Metrics) {
    let mut rng = Rng(seed);
    let mut book: Vec<Listing> = Vec::new();
    let mut sold_wait: Vec<i64> = Vec::new(); // 実際の待ち時間 (分)
    let mut m = Metrics::default();
    let mut prev_cheapest: Option<(f64, i64)> = None;
    let mut prev_visible: Vec<(u64, f64)> = Vec::new(); // (id, price)
    let mut next_id: u64 = 0;

    let total_minutes = 14 * 24 * 60; // 14 日
    let warmup = 2 * 24 * 60; // 最初の 2 日は集計しない

    for t in 0..total_minutes {
        // 出品
        if rng.next_f64() < sc.arrivals_per_hour / 60.0 {
            let stale = rng.next_f64() < sc.stale_ratio;
            // 相場 100 を中心に散らす。stale は 1.6〜2.5 倍の強気
            let price = if stale {
                100.0 * (1.6 + rng.next_f64() * 0.9)
            } else {
                100.0 * (1.0 + (rng.next_f64() - 0.5) * sc.price_spread)
            };
            next_id += 1;
            book.push(Listing { id: next_id, price, listed_at: t, stale });
        }
        // 買い手: 一番安い「売れる出品」を買う (stale は相場外なので誰も買わない)
        if rng.next_f64() < sc.buyers_per_hour / 60.0 {
            let mut best: Option<usize> = None;
            for (i, l) in book.iter().enumerate() {
                if l.stale {
                    continue;
                }
                if best.is_none() || l.price < book[best.unwrap()].price {
                    best = Some(i);
                }
            }
            if let Some(i) = best {
                sold_wait.push(t - book[i].listed_at);
                book.remove(i);
            }
        }
        // 1 時間ごとにサンプル (アプリの取得と同じく最安 10 件を見る)
        if t % 60 == 0 && t >= warmup {
            let mut sorted = book.clone();
            sorted.sort_by(|a, b| a.price.partial_cmp(&b.price).unwrap());
            let top: Vec<&Listing> = sorted.iter().take(10).collect();
            let mut ages: Vec<i64> = top.iter().map(|l| t - l.listed_at).collect();
            ages.sort_unstable();
            if !ages.is_empty() {
                m.median.push(pct(&ages, 0.5));
                m.mean.push(ages.iter().sum::<i64>() as f64 / ages.len() as f64);
                m.p25.push(pct(&ages, 0.25));
                m.min.push(ages[0] as f64);
                // 消失の計測: 前回見えていた物が今も book にあるか。
                // ただし「今見えている最高値より高い物」は視界の外なので数えない (押し出されただけ)
                let visible_max = top.last().map(|l| l.price).unwrap_or(f64::INFINITY);
                if !prev_visible.is_empty() {
                    let ids: std::collections::HashSet<u64> = book.iter().map(|l| l.id).collect();
                    let mut checked = 0usize;
                    let mut gone = 0usize;
                    for (id, price) in &prev_visible {
                        if *price > visible_max {
                            continue; // 値上がりした周囲に押し出された = 判定不能
                        }
                        checked += 1;
                        if !ids.contains(id) {
                            gone += 1;
                        }
                    }
                    let raw_gone = prev_visible.iter().filter(|(id, _)| !ids.contains(id)).count();
                    m.gone_raw.push(raw_gone as f64 / prev_visible.len() as f64);
                    if checked > 0 {
                        let rate = gone as f64 / checked as f64;
                        m.gone_rate.push(rate);
                        // 見えている数 ÷ 1 時間あたりの消失数 = その価格帯が一巡する時間
                        m.est_wait.push(if gone > 0 { (top.len() as f64 / gone as f64) * 60.0 } else { f64::INFINITY });
                    }
                }
                prev_visible = top.iter().map(|l| (l.id, l.price)).collect();
                let cheapest = top.first().map(|l| (l.price, l.listed_at));
                if let (Some(p), Some(c)) = (prev_cheapest, cheapest) {
                    m.cheapest_changed.push(if p != c { 1.0 } else { 0.0 });
                }
                prev_cheapest = cheapest;
            }
            m.listed_total.push(book.len() as f64);
        }
    }

    // 実際の待ち時間 (直近で売れた分の中央値)
    sold_wait.sort_unstable();
    let truth = if sold_wait.is_empty() { f64::NAN } else { pct(&sold_wait, 0.5) };
    (truth, m)
}

fn main() {
    let scenarios = vec![
        Scenario { name: "A 速い市場 (需給均衡)", arrivals_per_hour: 6.0, buyers_per_hour: 6.0, stale_ratio: 0.0, price_spread: 0.3 },
        Scenario { name: "B 遅い市場 (供給過多)", arrivals_per_hour: 6.0, buyers_per_hour: 1.5, stale_ratio: 0.0, price_spread: 0.3 },
        Scenario { name: "C 速いが強気出品が居座る", arrivals_per_hour: 6.0, buyers_per_hour: 5.5, stale_ratio: 0.35, price_spread: 0.3 },
        Scenario { name: "D 薄い市場 (出品も買い手も少ない)", arrivals_per_hour: 0.6, buyers_per_hour: 0.5, stale_ratio: 0.1, price_spread: 0.3 },
        Scenario { name: "E 即売れ + 強気多数 (最悪ケース)", arrivals_per_hour: 4.0, buyers_per_hour: 3.8, stale_ratio: 0.6, price_spread: 0.2 },
        Scenario { name: "F 死んだ市場 (ほぼ売れない)", arrivals_per_hour: 3.0, buyers_per_hour: 0.2, stale_ratio: 0.2, price_spread: 0.3 },
    ];

    println!(
        "{:<34} {:>11} {:>11} {:>11} {:>11} {:>9} {:>11}",
        "シナリオ", "実際の待ち", "中央値", "最安の齢", "消失で推定", "消失率", "入替率"
    );
    println!("{}", "-".repeat(104));
    for sc in &scenarios {
        let (truth, m) = run(sc, 12345);
        let med = mean(&m.median);
        let avg = mean(&m.mean);
        let p25 = mean(&m.p25);
        let mn = mean(&m.min);
        let changed = mean(&m.cheapest_changed) * 100.0;
        let est = mean(&m.est_wait);
        let gone = mean(&m.gone_rate) * 100.0;
        let gone_raw = mean(&m.gone_raw) * 100.0;
        let _ = (avg, p25);
        println!(
            "{:<34} {:>11} {:>11} {:>11} {:>11} {:>8.0}% {:>10.0}%",
            sc.name,
            fmt_min(truth),
            fmt_min(med),
            fmt_min(mn),
            fmt_min(est),
            gone,
            changed
        );
        println!("{:<34} {:>11} (補正なしの消失率 {:.0}%)", "", "", gone_raw);
        println!(
            "{:<34} {:>11} {:>11} {:>11} {:>11}",
            "  → 判定",
            verdict(truth),
            verdict(med),
            verdict(mn),
            verdict(est)
        );
    }
    println!("\n実際の待ち = 売れた出品の「出品 → 売却」の中央値 (これが正解)。");
    println!("中央値 / 平均 / 下位25% / 最安の齢 = 1 時間ごとに最安 10 件を覗いた時の、経過時間の統計。");
    println!("入替率 = 1 時間で最安の出品が入れ替わっていた割合。");
}

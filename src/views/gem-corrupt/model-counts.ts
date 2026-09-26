/**
 * model-counts.ts — N 回やった時の個数 (段ごとに切り下げ) と、利回り・損益の分布
 *
 * 2026-09-21 に model.ts (601 行) から切り出した。中身は変えていない。
 * 外から使う時は今まで通り `./model` から読む (model.ts がまとめて出している)。
 */
import { type CorruptParams, type RouteResult, type SaleSlot } from "./model-types";
import { normalizedVaal } from "./model-probs";


/** N 回やった時の個数 (段ごとに切り下げ) */
export interface ExpectedCounts {
  /** 売る物 */
  level21: number;
  quality23: number;
  finished: number;
  other: number;
  /** 使う物 */
  crystals: number;
  /** 原石 (レベル 20)。売る物 (完成品 / レベル 21 / 品質 23%) の個数だけ使う */
  uncut20: number;
}

/**
 * N 回やった時の個数を、段ごとに切り下げながら数える (オーナー指示 2026-09-20)。
 *
 * 「期待値 × N」を項目ごとに独立して出すと、23% が 7.4 個できて結晶を 7.4 本使い
 * 完成品が 1.85 個…と小数のまま話が進む。実際は **7 個できて 7 本使い 1 個できる**。
 * 出来上がった個数を切り下げてから次の段に渡すので、ここで順に数える。
 *
 *   1. できた レベル 21 の素体 = floor(N × pLevel21)
 *   2. できた 品質 23%        = floor(N × pQuality23)
 *   3. 賭ける方に結晶を 1 本ずつ  → 当たりは floor(個数 × 当たり確率)
 *   4. 原石は **完成品 + レベル 21** の個数だけ (23% と外れには使わない)
 *
 * 切り下げは「収入は厳しく」の方針どおり (オーナー:「ジェムの期待値も切り下げ」)。
 */
export function expectedCounts(r: RouteResult, attempts: number, opts: { exact?: boolean } = {}): ExpectedCounts {
  const zero: ExpectedCounts = { level21: 0, quality23: 0, finished: 0, other: 0, crystals: 0, uncut20: 0 };
  const n = Math.max(0, Math.floor(attempts));
  const st = r.stage;
  if (!r.ok || n <= 0 || !st) return zero;
  // exact: 切り下げずに期待値そのまま (収支と素材の既定。オーナー 2026-09-26:「期待値でそのまま個数に出して」。
  // 切り下げだと回数が少ないうちは結晶や当たりが 0 のまま動かず、経路を変えても固定に見えた)
  const fl = (x: number): number => (!Number.isFinite(x) || x <= 0 ? 0 : opts.exact ? x : Math.floor(x + 1e-9));

  // 1-2. 賭ける前に出来上がった個数
  const made21 = fl(n * st.pLevel21);
  const made23 = fl(n * st.pQuality23);
  let other = fl(n * st.pJunk);

  // 3. 結晶を使う方は、できた個数ぶん 1 本ずつ賭ける
  let crystals = 0;
  let finished = 0;
  let level21 = made21;
  let quality23 = made23;
  if (st.gambleLevel21 && made21 > 0) {
    crystals += made21;
    finished += fl(made21 * st.hitFromLevel21);
    other += fl(made21 * (st.survive - st.hitFromLevel21));
    level21 = 0; // 全部賭けたので 21 のままでは残らない
  }
  if (st.gambleQuality23 && made23 > 0) {
    crystals += made23;
    finished += fl(made23 * st.hitFromQuality23);
    other += fl(made23 * (st.survive - st.hitFromQuality23));
    quality23 = 0;
  }

  // 4. 原石は完成品とレベル 21 にだけ (経路によっては要らない)
  const uncut20 =
    (st.uncutForFinished ? finished : 0) + (st.uncutForLevel21 ? level21 : 0) + (st.uncutForQuality23 ? quality23 : 0);
  return { level21, quality23, finished, other, crystals, uncut20 };
}

export function expectedSales(r: RouteResult): Record<SaleSlot, { qty: number; price: number | null }> {
  const acc: Record<SaleSlot, { qty: number; value: number }> = {
    level21: { qty: 0, value: 0 },
    quality23: { qty: 0, value: 0 },
    finished: { qty: 0, value: 0 },
    other: { qty: 0, value: 0 },
  };
  for (const o of r.outcomes) {
    if (!o.sale || o.p <= 0) continue;
    acc[o.sale].qty += o.p;
    acc[o.sale].value += o.p * o.gross;
  }
  const out = {} as Record<SaleSlot, { qty: number; price: number | null }>;
  for (const k of Object.keys(acc) as SaleSlot[]) {
    out[k] = { qty: acc[k].qty, price: acc[k].qty > 0 ? acc[k].value / acc[k].qty : null };
  }
  return out;
}

/** 利回り = 1 回の期待収支 ÷ 1 回の期待費用 (計算できない経路は null) */
export function roi(r: RouteResult): number | null {
  return r.ok && r.expectedCost > 0 && Number.isFinite(r.ev) ? r.ev / r.expectedCost : null;
}

/**
 * 利回りが最も高い経路 (計算できた物の中で)。
 * 2026-09-16 オーナー指摘「投資額が多いのに 1 回あたりで比べるのはおかしい」: 以前は 1 回あたりの期待収支の金額で選んでいて、
 * 1 回の費用が 10 倍近い「買って賭ける」経路ほど、少しのプラスでも金額が大きく見えて有利に出ていた。
 * 完成品を買う経路は利回り 0% の基準なので、他が全てマイナスなら「買った方が得」になる。
 */
export function bestRoute(routes: RouteResult[]): RouteResult | null {
  let best: RouteResult | null = null;
  let bestRoi = Number.NEGATIVE_INFINITY;
  for (const r of routes) {
    const v = roi(r);
    if (v != null && v > bestRoi) {
      best = r;
      bestRoi = v;
    }
  }
  return best;
}

export interface BudgetRisk {
  /** 予算でできる回数 (予算 ÷ 1 回の期待費用を丸め、最低 1 回) */
  attempts: number;
  /** 期待総費用 */
  cost: number;
  /** 期待損益 = 回数 × 1 回の期待収支 */
  profit: number;
  /** 赤字で終わる確率 */
  pLoss: number;
  /** 損益の下位 5% / 中央 / 上位 5% */
  p05: number;
  median: number;
  p95: number;
  /** 完成品が 1 個以上できる確率と期待数 */
  pAnyFinished: number;
  expectedFinished: number;
}

/**
 * 同じ予算でその経路をやった時の損益の分布 (2026-09-16)。
 * 結果ごとの 1 回の損益 (OutcomeLine.profit) を回数ぶん引く試行を `trials` 回やって集計する。
 * 乱数は種を固定しているので、同じ入力なら同じ数字が出る (表示がちらつかない)。
 */
export function budgetRisk(r: RouteResult, budget: number, trials = 10000): BudgetRisk | null {
  if (!r.ok || !(r.expectedCost > 0) || !(budget > 0)) return null;
  // 予算を超えないよう切り捨て (1 回分に届かない予算は呼び出し側で「予算不足」にする)。+1e-9 は n × 費用 ÷ 費用 の丸め誤差よけ
  const n = Math.max(1, Math.floor(budget / r.expectedCost + 1e-9));
  const lines = r.outcomes.filter((o) => o.p > 0);
  const total = lines.reduce((s, o) => s + o.p, 0);
  if (lines.length === 0 || !(total > 0)) return null;
  const cum: number[] = [];
  let acc = 0;
  for (const o of lines) cum.push((acc += o.p / total));
  // mulberry32
  let seed = 0x2f6b7a31;
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const results = new Float64Array(trials);
  let losses = 0;
  for (let t = 0; t < trials; t++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const u = rand();
      let i = 0;
      while (i < cum.length - 1 && u > cum[i]) i++;
      sum += lines[i].profit;
    }
    results[t] = sum;
    if (sum < -1e-6) losses++;
  }
  results.sort();
  const q = (x: number): number => results[Math.min(trials - 1, Math.floor(x * trials))];
  return {
    attempts: n,
    cost: n * r.expectedCost,
    profit: n * r.ev,
    pLoss: losses / trials,
    p05: q(0.05),
    median: q(0.5),
    p95: q(0.95),
    pAnyFinished: r.pFinished > 0 ? 1 - Math.pow(1 - r.pFinished, n) : 0,
    expectedFinished: n * r.pFinished,
  };
}

/** ヴァールオーブの表示用確率 (正規化後) */
export function vaalProbabilities(p: CorruptParams): { levelUp: number; qualityTop: number; junk: number } {
  const v = normalizedVaal(p);
  const steps = Math.max(2, Math.round(p.qualitySteps));
  const levelUp = v.level / 2;
  const qualityTop = v.quality / steps;
  return { levelUp, qualityTop, junk: 1 - levelUp - qualityTop };
}

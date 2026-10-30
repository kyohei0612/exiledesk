/**
 * report.mjs — N 人の結果 → 毎回同じ形の集計 (S-175)。費用の数えは _ev-common の summarize と同じ
 */
import { mean, q, summarize } from "../../analysis/_ev-common.mjs";

const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

export function report(rs, price, rule, ms) {
  const cost = (n) => Object.entries(n).reduce((a, [k, v]) => a + (k === "base" ? rule.basePrice ?? 0 : price(k)) * v, 0);
  const s = summarize(rs, cost);
  const N = rs.length, D = s.done.length, rate = D / N;
  // 1 個の費用 = 全員の費用 ÷ 完成数。比の幅は R = C/D の線形近似 (Σ(C_i − R·D_i)²)
  const R = s.perItem;
  const se = D ? Math.sqrt(rs.reduce((a, x) => a + (cost(x.n) - R * (x.done ? 1 : 0)) ** 2, 0)) / D : NaN;
  const ends = {}, stuck = {};
  for (const x of rs) {
    ends[x.how] = (ends[x.how] ?? 0) + 1;
    if (x.how === "stuck") stuck[x.reason] = (stuck[x.reason] ?? 0) + 1;
  }
  const keys = [...new Set(rs.flatMap((x) => Object.keys(x.n)))];
  const hands = Object.fromEntries(keys.map((k) => {
    const c = rs.reduce((a, x) => a + (x.n[k] ?? 0), 0) / (D || NaN);
    return [k, { perItem: r3(c), cost: r3(c * (k === "base" ? rule.basePrice ?? 0 : price(k))) }];
  }).sort((a, b) => (b[1].cost ?? 0) - (a[1].cost ?? 0)));
  const steps = s.done.map((x) => x.steps).sort((a, b) => a - b);
  return {
    people: N,
    doneRate: r3(rate),
    doneRateCi95: r3(1.96 * Math.sqrt(rate * (1 - rate) / N)),
    costPerItem: r3(R),
    costPerItemCi95: r3(1.96 * se),
    costDone: { mean: r3(s.m), ci95: r3(1.96 * s.se), median: r3(s.median), p90: r3(s.p90), p99: r3(q(s.costs, 0.99)) },
    steps: { perItem: r3(rs.reduce((a, x) => a + x.steps, 0) / (D || NaN)), doneMean: r3(mean(steps)), doneMedian: r3(q(steps, 0.5)) },
    restartsPerPerson: r3(mean(rs.map((x) => x.restarts))),
    ends, stuck, hands,
    ms,
  };
}

/** ひと目の 1 行 */
export const headOf = (x) =>
  `完成 ${(100 * x.doneRate).toFixed(1)}% (±${(100 * x.doneRateCi95).toFixed(1)})  1 個 ${x.costPerItem} 神 (±${x.costPerItemCi95})  手数 ${x.steps.perItem}  止まり ${x.ends.stuck ?? 0}`;

/** 2 つの結果の差と 95% の幅 */
export function compare(a, b) {
  const d = (x, y, ex, ey) => {
    const diff = y - x, w = Math.hypot(ex, ey);
    return { a: x, b: y, diff: r3(diff), ci95: r3(w), clear: Math.abs(diff) > w };
  };
  return {
    doneRate: d(a.doneRate, b.doneRate, a.doneRateCi95, b.doneRateCi95),
    costPerItem: d(a.costPerItem, b.costPerItem, a.costPerItemCi95, b.costPerItemCi95),
    stepsPerItem: { a: a.steps.perItem, b: b.steps.perItem, diff: r3(b.steps.perItem - a.steps.perItem) },
  };
}

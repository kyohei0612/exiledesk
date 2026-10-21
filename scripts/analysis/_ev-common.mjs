/**
 * _ev-common.mjs — 状態で手を決めて n 人回す台本 (boots-res-ev・es-gloves-ev・gold-ring-suffix-ev・mana-ring-ev) の共通の部品 (解析君、2026-10-22)
 * 値段の表・費用・打って数える手・完成した人の集計。台本は「次にどの手を打つか」だけを持つ
 */

/** 自分のサーバーの /boot.json (2026-10-20 16:00Z、Forbidden Rites、高貴建て。神 = 696.93) */
export const PRICES = {
  chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, divine: 696.929,
  OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.830, OmenofCatalysingExaltation: 33.189, OmenofSinistralCrystallisation: 298.594,
  catalyst_speed: 152.338, catalyst_cold: 13.655, catalyst_mana: 12.102, "essence:breach": 765.322,
};

/** 使った個数 (値段のキーごと) → 神 */
export const costOf = (n, prices = PRICES) => Object.entries(n).reduce((a, [k, v]) => a + (prices[k] ?? 0) * v, 0) / prices.divine;

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
/** 並べた xs の p 分位 */
export const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];

/**
 * エンジンの入口で 1 手打ち、使った個数を n に数える (お告げは omensUsed)。打てなければ止める。
 * keyOf = 数える時のキー (例: エッセンスの長い名前 → "ESS")
 */
export function counter(M, data, n, keyOf = (cur) => cur) {
  return (it, cur, rng, omens = [], hint = {}) => {
    const r = M.applyCurrency(data, it, cur, rng, omens, hint);
    if (!r.applied) throw new Error(`${cur} が打てない: ${r.reason}`);
    const key = keyOf(cur);
    n[key] = (n[key] ?? 0) + 1;
    for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
    return r;
  };
}

/** n 人の結果 ({ done, n }) → 完成率・1 個あたり・完成した人の平均 (± は 95%)・中央・90% */
export function summarize(rs, cost = costOf) {
  const done = rs.filter((r) => r.done);
  const costs = done.map((r) => cost(r.n)).sort((a, b) => a - b);
  const spent = rs.reduce((a, r) => a + cost(r.n), 0);
  const m = mean(costs), se = Math.sqrt(mean(costs.map((c) => (c - m) ** 2)) / (costs.length || 1));
  return { done, costs, spent, m, se, perItem: spent / (done.length || NaN), median: q(costs, 0.5), p90: q(costs, 0.9) };
}

/** 決まった形の 2 行目 (完成・1 個あたり・平均・中央・90%) */
export const headLine = (s, N) =>
  `完成 ${(100 * s.done.length / N).toFixed(1)}%  1 個あたり ${s.perItem.toFixed(2)} 神  完成した人の平均 ${s.m.toFixed(2)} (±${(1.96 * s.se).toFixed(2)})  中央 ${s.median?.toFixed(1)}  90% ${s.p90?.toFixed(1)}`;

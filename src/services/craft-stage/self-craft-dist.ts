/**
 * self-craft-dist.ts — ③ の「白から自作」の費用の分かれ方 (2026-10-20 オーナー「上限は一番高いベースに設定して、その金額まで回した結果どっちがええか」)。
 * 平均だけでは運の悪い道を見落とすので、1 人分を確率どおりに引いて足し、「買う値段までに作れる割合」と 2 人に 1 人を出す。
 *
 * 1 人分 = (1 本分の決まった費用 + マジックのループ) × フラクチャーが当たるまでの本数 + 固定の後の消去 + 反対側の狙いのカオス。
 *   - ループ: 「候補だけ」は増強 1 回 + 消去 2 回を当たるまで (③ の白からの式と同じ形)。「2 つ揃える」はマジックの状態 (側ごとに空・当たり・外れ) を 1 手ずつ
 *   - フラクチャー: 1 本ごとに 3 つに 1 つ (壁の分を除いた 3 つのうち 1 つ)
 *   - 反対側の狙いを固定の後にカオスで取る時は、当たるまでのカオスの回数
 * エンジンは回さない (式の部品だけで、2 万人分でも一瞬)
 */
import { mulberry32 } from "../htc/rng";

export type LoopModel =
  | { kind: "reroll"; p: number; perReroll: number }
  | { kind: "markov"; p: number; q: number | null; share: number; aug: number; annul: number };

export interface SelfCraftIn {
  /** 1 本分のうちループ以外の費用 (白・ルーン・変成・エッセンスか王者・壁・フラクチャーなど) */
  fixedPerAttempt: number;
  loop: LoopModel;
  /** 1 本でフラクチャーが狙いに当たる確率 */
  hit: number;
  /** 固定できた後に 1 回だけ (消去 × 2 など) */
  after: number;
  /** 固定の後に反対側の狙いをカオスで (無ければ undefined) */
  chaosAfter?: { p: number; price: number };
  n?: number;
  seed?: number;
}

/** 1 人分の費用を n 人分 (小さい順) */
export function selfCraftCosts(o: SelfCraftIn): number[] {
  const g = mulberry32(o.seed ?? 20261020);
  const n = o.n ?? 20000;
  const geo = (p: number): number => { if (!(p > 0)) return Infinity; let k = 1; while (g() >= p && k < 1e6) k++; return k; };
  const loopOnce = (): number => {
    const L = o.loop;
    if (L.kind === "reroll") return geo(L.p) * L.perReroll;
    // マジック: 変成で 1 つ (側は重みの割合)、外れがあれば消去 (どちらが消えるかは半々)、空いた側に増強。両側が当たりで終わり (q = null なら候補の側だけ)
    const need = L.q != null, q = L.q ?? 0.5;
    let a = 0, b = 0, cost = 0;
    if (g() < L.share) a = g() < L.p ? 1 : 2; else b = g() < q ? 1 : 2;
    for (let i = 0; i < 100000; i++) {
      if (a === 1 && (!need || b === 1)) break;
      if (a === 2 || (need && b === 2)) {
        cost += L.annul;
        if (a && b) { if (g() < 0.5) a = 0; else b = 0; } else if (a) a = 0; else b = 0;
      } else {
        cost += L.aug;
        const toA = a === 0 && b === 0 ? g() < L.share : a === 0;
        if (toA) a = g() < L.p ? 1 : 2; else b = g() < q ? 1 : 2;
      }
    }
    return cost;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const tries = geo(o.hit);
    let c = 0;
    for (let k = 0; k < tries && Number.isFinite(c); k++) c += o.fixedPerAttempt + loopOnce();
    c += o.after;
    if (o.chaosAfter) c += geo(o.chaosAfter.p) * o.chaosAfter.price;
    out.push(c);
  }
  return out.sort((x, y) => x - y);
}

/** その金額までに作れる割合と、2 人に 1 人の費用 */
export function withinBudget(costs: readonly number[], budget: number): { p: number; p50: number } {
  if (!costs.length) return { p: 0, p50: Infinity };
  let lo = 0, hi = costs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (costs[m]! <= budget) lo = m + 1; else hi = m; }
  return { p: lo / costs.length, p50: costs[Math.floor(costs.length / 2)]! };
}

/** ③ の計算 (use-sim-run の calc) から 1 人分の組み立てを作る */
export function whiteCraftIn(c: {
  once: number; rerolls: number; pHit: number; after: number; augKey: string;
  greater: { augment: number; annul: number; p: number; q: number | null; share: number; augKey: string; once: number } | null;
  keep: { use: "together" | "chaos"; chaosKey: string | null; chaosN: number | null; detail: { p: number; q: number; share: number; augKey: string } } | null;
}, price: (k: string) => number): SelfCraftIn {
  const annul = price("annul");
  if (c.greater) {
    const g = c.greater, aug = price(g.augKey);
    return { fixedPerAttempt: g.once - (g.augment * aug + g.annul * annul), loop: { kind: "markov", p: g.p, q: g.q, share: g.share, aug, annul }, hit: 1 / 3, after: 0 };
  }
  const perReroll = price(c.augKey) + 2 * annul;
  const fixed = c.once - (Number.isFinite(c.rerolls) ? c.rerolls * perReroll : 0);
  const k = c.keep;
  if (k?.use === "together") return { fixedPerAttempt: fixed, loop: { kind: "markov", p: k.detail.p, q: k.detail.q, share: k.detail.share, aug: price(k.detail.augKey), annul }, hit: 1 / 3, after: c.after };
  return { fixedPerAttempt: fixed, loop: { kind: "reroll", p: c.pHit, perReroll }, hit: 1 / 3, after: c.after,
    ...(k && k.chaosN && k.chaosKey ? { chaosAfter: { p: 1 / k.chaosN, price: price(k.chaosKey) } } : {}) };
}

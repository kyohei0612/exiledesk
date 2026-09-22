/**
 * ladder.ts — 売値の段 (ラダー): 1 回ぶんの結果を「当たる商品のうち一番高い売値」で判定する
 *
 * sim.ts が回した 1 万回の結果 (Float32Array) を、ルーンや加工を乗せた後の実際の数値に直して
 * 「どの段に当たったか」を数える。**乱数は使わない**ので、同じ結果には必ず同じ段が出る。
 *
 * 2026-09-19 に sim.ts (503 行) から切り出した。中身は変えていない。
 */
import { COL, NCOL, type Metric, type SimResult } from "./sim";


// ---------------------------------------------------------------------------
// 売値の段 (ラダー): 1 回ぶんの結果を「満たす段のうち一番高い売値」で売る
// ---------------------------------------------------------------------------

export interface PostOptions {
  baseEs: number;
  quality: number;
  /** ルーン (ソケット数ぶん足す) */
  rune: Partial<Record<"esPct" | "life" | "res" | "ms", number>>;
  runeCount: number;
}

export interface LadderBucket {
  key: string;
  label: string;
  conds: Partial<Record<Metric, number>>;
  price: number | null;
}

export interface LadderRow {
  key: string;
  label: string;
  /** 条件を満たす確率 */
  pReach: number;
  /** この段で売る確率 (もっと高い段に当たらなかった物) */
  pSold: number;
  price: number | null;
  contribution: number;
}

export interface LadderResult {
  rows: LadderRow[];
  floor: { pSold: number; price: number | null; contribution: number };
  /** 外れの条件にも届かず売れない確率 */
  below: { pSold: number };
  expectedSale: number;
  ev: number;
  /** 売値が 1 回の費用以上になる確率 */
  pProfit: number;
  means: Record<Metric, number>;
}

/**
 * **品質は %増加の枠に足すのではなく、最後に別で掛ける** (2026-09-22 に実物 2 個で確定)。
 *
 *   ES = (素の ES + フラット ES) × (1 + %ES の合計) × (1 + 品質)
 *
 * 検算:
 *   術師のティアラ (素 97) / 品質なし / ES% 58        → 97 × 1.58 = 153.3 → 表示 153 ✓
 *   同ベース / 品質 20% / フラット 72 / 36+42+85%     → 169 × 2.63 × 1.2 = 533.4 → 表示 533 ✓
 *   枠に足す式だと 478 で、実際の 533 に 55 足りない。
 *
 * ルーンの %防御は MOD と同じ扱い (枠に足す)。品質だけが別枠。
 */
function metricsOf(raw: Float32Array, i: number, post: PostOptions): Record<Metric, number> {
  const b = i * NCOL;
  const rc = post.runeCount;
  const esPct = raw[b + COL.esPct] + (post.rune.esPct ?? 0) * rc;
  const esFlat = raw[b + COL.esFlat];
  return {
    es: post.baseEs > 0 || esFlat > 0 ? (post.baseEs + esFlat) * (1 + esPct / 100) * (1 + post.quality / 100) : 0,
    life: raw[b + COL.life] + (post.rune.life ?? 0) * rc,
    res: raw[b + COL.res] + (post.rune.res ?? 0) * rc,
    chaos: raw[b + COL.chaos],
    ms: raw[b + COL.ms] + (post.rune.ms ?? 0) * rc,
  };
}

const meets = (m: Record<Metric, number>, conds: Partial<Record<Metric, number>>): boolean => {
  for (const k of Object.keys(conds) as Metric[]) {
    const v = conds[k];
    if (v != null && m[k] < v) return false;
  }
  return true;
};

export function evaluateLadder(
  sim: SimResult,
  post: PostOptions,
  buckets: LadderBucket[],
  floorConds: Partial<Record<Metric, number>>,
  floorPrice: number | null,
  cost: number,
): LadderResult {
  const reach = new Array(buckets.length).fill(0);
  const sold = new Array(buckets.length).fill(0);
  let floorSold = 0;
  let belowSold = 0;
  let saleSum = 0;
  let profit = 0;
  const sums: Record<Metric, number> = { es: 0, life: 0, res: 0, chaos: 0, ms: 0 };
  const order = buckets
    .map((b, i) => ({ i, price: b.price }))
    .filter((x) => x.price != null)
    .sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  for (let s = 0; s < sim.n; s++) {
    const m = metricsOf(sim.raw, s, post);
    for (const k of Object.keys(sums) as Metric[]) sums[k] += m[k];
    const ok = buckets.map((b) => meets(m, b.conds));
    ok.forEach((v, i) => {
      if (v) reach[i]++;
    });
    let price = 0;
    const top = order.find((x) => ok[x.i] && (x.price ?? 0) > (floorPrice ?? 0));
    const anyBucket = order.find((x) => ok[x.i]);
    if (top) {
      sold[top.i]++;
      price = top.price ?? 0;
    } else if (meets(m, floorConds)) {
      floorSold++;
      price = floorPrice ?? 0;
    } else if (anyBucket) {
      // 段には届いたが外れの条件を満たさない (条件を手で変えた時だけ起きる): その段の売値で売る
      sold[anyBucket.i]++;
      price = anyBucket.price ?? 0;
    } else {
      // 外れの条件にも届かない物は売れない扱い (2026-09-15 オーナー指示。以前は外れの売値で売れる計算だった)
      belowSold++;
    }
    saleSum += price;
    if (price >= cost) profit++;
  }
  const n = Math.max(1, sim.n);
  const rows = buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    pReach: reach[i] / n,
    pSold: sold[i] / n,
    price: b.price,
    contribution: (sold[i] / n) * (b.price ?? 0),
  }));
  const expectedSale = saleSum / n;
  const means = { es: sums.es / n, life: sums.life / n, res: sums.res / n, chaos: sums.chaos / n, ms: sums.ms / n };
  return {
    rows,
    floor: { pSold: floorSold / n, price: floorPrice, contribution: (floorSold / n) * (floorPrice ?? 0) },
    below: { pSold: belowSold / n },
    expectedSale,
    ev: expectedSale - cost,
    pProfit: profit / n,
    means,
  };
}


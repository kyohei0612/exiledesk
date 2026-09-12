/**
 * アドニアの賭け — 期待値モデル (純粋関数、UI 非依存) 2026-09-12
 *
 * 目的: 「品質 20% を超えて (最大 30%) 育てたベースを、可能性のお告げ + 可能性のオーブでユニークにする」
 * クラフト (代表例: 吸収のワンド → アドニアのエゴ) の、完成品 1 個あたりの実質コストと利益を出す。
 *
 * 手順 (クライアントの説明文より):
 *   1. ベースを買う → 品質通貨 (秘術師の彫刻針 など) で 20% にする
 *   2. ヴァールインフューザーで 1 回ごとに品質 +1 (一定確率で +2)。20% を超えた分だけコラプト化の危険がある
 *      (クライアント: 「最大品質を最大10%まで超過することができるが、一定確率でコラプト化してしまう」)
 *      コラプトしたらそのベースは失敗 (ベース + 彫刻針 + それまでのインフューザーが無駄)
 *   3. 目標品質に届いたら 可能性のお告げ (次の可能性のオーブはアイテムを破壊しない) + 可能性のオーブ → ユニーク
 *      お告げとオーブは成功したベースにしか使わない
 *
 * 確率 (GGG 非公開、UI で変更可):
 *   - +2 になる確率 (既定 0.2)
 *   - コラプト確率 = 1 ポイントあたりの上昇率 × (現在の品質 − 20)。20% ちょうどからの 1 回目は 0 (既定 0.052 / pt)
 * 金額は高貴 (Exalted) 建て。
 */

export interface OverqualityParams {
  /** インフューザー 1 回で +2 になる確率 */
  plusTwoChance: number;
  /** 品質 1 ポイント超過ごとのコラプト確率の増分 (現在品質 q のとき c = rate × (q − 20)) */
  brickRatePerPoint: number;
}

export const DEFAULT_OVERQUALITY_PARAMS: OverqualityParams = {
  plusTwoChance: 0.2,
  brickRatePerPoint: 0.052,
};

export interface OverqualityInputs {
  /** 目標品質 (21〜30) */
  targetQuality: number;
  /** ベース 1 個 (高貴) */
  basePrice: number | null;
  /** 20% にするための品質通貨の単価と必要数 */
  qualityCurrencyPrice: number | null;
  qualityCurrencyCount: number;
  /** ヴァールインフューザー 1 個 */
  infuserPrice: number | null;
  /** 可能性のお告げ / 可能性のオーブ */
  omenPrice: number | null;
  chancePrice: number | null;
  /** 完成品 (目標品質のユニーク) の売値 */
  salePrice: number | null;
}

export interface OverqualityResult {
  ok: boolean;
  missing: string[];
  /** 1 ベースが目標品質まで生き残る確率 */
  survival: number;
  /** 1 ベースあたりのインフューザー使用数の期待値 (途中で壊れた分も含む) */
  expectedInfusers: number;
  /** 1 ベースあたりの確定費用 (ベース + 品質通貨) */
  costPerBase: number;
  /** 1 ベースあたりの期待費用 (ベース + 品質通貨 + 期待インフューザー) */
  expectedCostPerAttempt: number;
  /** 完成品 1 個あたりの実質コスト = 期待費用 / 生存率 + お告げ + オーブ */
  costPerFinished: number;
  /** 完成品 1 個あたりの利益 / 利益率 */
  profit: number;
  margin: number;
  /** 損益分岐のベース価格 (これより高いベースを買うと赤字) */
  breakEvenBasePrice: number;
  /** 少なくとも 1 個成功するのに必要な試行数 (95% / 99%) とその資金 */
  bankroll95: { attempts: number; cost: number };
  bankroll99: { attempts: number; cost: number };
  /** 品質ごとの到達 / 破壊 確率 (表示用) */
  ladder: { quality: number; reach: number; brickHere: number }[];
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * 品質 20 から目標まで登る過程を状態遷移で解く。
 *   reach[q]: 品質 q に (壊れずに) 到達する確率
 *   各 q (20 ≤ q < target) でインフューザーを使う: 壊れる c(q)、+1 が (1−c)(1−p2)、+2 が (1−c)p2 (目標超えは目標で止まる)
 */
export function climb(target: number, p: OverqualityParams): { survival: number; expectedInfusers: number; ladder: OverqualityResult["ladder"] } {
  const t = Math.min(30, Math.max(21, Math.round(target)));
  const p2 = clamp01(p.plusTwoChance);
  const rate = Math.max(0, p.brickRatePerPoint);
  const reach: number[] = new Array(31).fill(0);
  reach[20] = 1;
  let expectedInfusers = 0;
  const ladder: OverqualityResult["ladder"] = [];
  for (let q = 20; q < t; q++) {
    const here = reach[q];
    if (here <= 0) {
      ladder.push({ quality: q, reach: 0, brickHere: 0 });
      continue;
    }
    const c = clamp01(rate * (q - 20));
    expectedInfusers += here; // この品質で 1 回使う
    const survive = here * (1 - c);
    const up1 = Math.min(t, q + 1);
    const up2 = Math.min(t, q + 2);
    reach[up1] += survive * (1 - p2);
    reach[up2] += survive * p2;
    ladder.push({ quality: q, reach: here, brickHere: here * c });
  }
  return { survival: reach[t], expectedInfusers, ladder };
}

export function evaluateOverquality(i: OverqualityInputs, p: OverqualityParams): OverqualityResult {
  const missing: string[] = [];
  if (i.basePrice == null) missing.push("ベース");
  if (i.qualityCurrencyPrice == null) missing.push("品質通貨");
  if (i.infuserPrice == null) missing.push("インフューザー");
  if (i.omenPrice == null) missing.push("可能性のお告げ");
  if (i.chancePrice == null) missing.push("可能性のオーブ");
  if (i.salePrice == null) missing.push("売値");
  const { survival, expectedInfusers, ladder } = climb(i.targetQuality, p);
  const empty: OverqualityResult = {
    ok: false,
    missing,
    survival,
    expectedInfusers,
    costPerBase: 0,
    expectedCostPerAttempt: 0,
    costPerFinished: 0,
    profit: 0,
    margin: 0,
    breakEvenBasePrice: 0,
    bankroll95: { attempts: 0, cost: 0 },
    bankroll99: { attempts: 0, cost: 0 },
    ladder,
  };
  if (missing.length > 0 || survival <= 0) return empty;
  const base = i.basePrice!;
  const qc = i.qualityCurrencyPrice! * Math.max(0, i.qualityCurrencyCount);
  const inf = i.infuserPrice!;
  const finish = i.omenPrice! + i.chancePrice!;
  const sale = i.salePrice!;

  const costPerBase = base + qc;
  const expectedCostPerAttempt = costPerBase + expectedInfusers * inf;
  const costPerFinished = expectedCostPerAttempt / survival + finish;
  const profit = sale - costPerFinished;
  const margin = sale > 0 ? profit / sale : 0;
  // 損益分岐: (base + qc + E[inf]·inf) / s + finish = sale → base = (sale − finish)·s − qc − E[inf]·inf
  const breakEvenBasePrice = (sale - finish) * survival - qc - expectedInfusers * inf;
  const attemptsFor = (conf: number): number => Math.max(1, Math.ceil(Math.log(1 - conf) / Math.log(1 - survival)));
  const bank = (conf: number) => {
    const attempts = attemptsFor(conf);
    return { attempts, cost: attempts * expectedCostPerAttempt + finish };
  };
  return {
    ok: true,
    missing,
    survival,
    expectedInfusers,
    costPerBase,
    expectedCostPerAttempt,
    costPerFinished,
    profit,
    margin,
    breakEvenBasePrice,
    bankroll95: bank(0.95),
    bankroll99: bank(0.99),
    ladder,
  };
}

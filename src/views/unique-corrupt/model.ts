/**
 * ユニークのコラプトの賭け — 期待値モデル (純粋関数、UI 非依存) 2026-09-13
 *
 * 安いユニークを買って束でヴァールオーブを打ち、「狙いのコラプト付加 (Vaal enchantment)」が付いた物を高く売る。
 * 続けてアーキテクトオーブで 2 個目の付加を賭ける (2 重コラプト) こともできる。
 *
 * 確率は GGG 非公開。既定値はコミュニティの仮定 (Maxroll / U4N 等、2026-09 時点) で、UI から全て変えられる:
 *   ヴァールオーブ (ユニーク装備): 変化なし / 各 MOD の値 ×0.78〜1.22 / コラプト付加を 1 つ追加 / ソケット +1 (ワンド・杖は品質、装飾品は何もなし)
 *                                  の 4 系統を等確率 (25% ずつ)。装飾品・ジュエルは 4 つ目が「変化なし」に落ちるので変化なし 50%。
 *   付加の中身: そのクラスのプール (クライアントの Mods、spawn_weights は 0/1) から一様 → 狙い 1 つの確率 = 付加確率 ÷ プール数
 *   アーキテクトオーブ: 50% で 2 個目の付加 (既にある付加と別グループ、プールから一様)、50% で破壊 (アイテム文言 + Maxroll / timesaver)
 * 「値が変わる」「ソケット」「その他の付加」で出来た物は、コラプト済みの最安 (外れの売値) で売る前提 (高ロール分は見ない、控えめ)。
 * 金額は全て高貴 (Exalted) 建て。
 */

export type FourthOutcome = "socket" | "quality" | "none";

export interface CorruptWeights {
  /** 変化なし */
  none: number;
  /** 各 MOD の値 ×0.78〜1.22 */
  values: number;
  /** コラプト付加を 1 つ追加 */
  enchant: number;
  /** ソケット +1 / 品質 / (装飾品は何もなし) */
  fourth: number;
}

export interface UniqueCorruptParams {
  weights: CorruptWeights;
  /** アーキテクトオーブで壊れずに 2 個目が付く確率 */
  architectSurvive: number;
}

export const DEFAULT_UNIQUE_CORRUPT_PARAMS: UniqueCorruptParams = {
  weights: { none: 1, values: 1, enchant: 1, fourth: 1 },
  architectSurvive: 0.5,
};

export interface TargetPrice {
  id: string;
  label: string;
  /** 狙いの付加が付いた物の売値 (高貴)。null は相場が取れていない */
  price: number | null;
}

export interface UniqueCorruptInputs {
  /** 未コラプトのユニークの最安 (材料) */
  basePrice: number | null;
  vaalPrice: number | null;
  /** コラプト済み (1 回) の最安 = 外れの売値 */
  floorPrice: number | null;
  /** そのクラスの付加プールの数 (N) */
  poolSize: number;
  fourth: FourthOutcome;
  /** 狙いの付加 (複数可) */
  targets: TargetPrice[];
}

export interface OutcomeLine {
  key: string;
  label: string;
  p: number;
  /** この結果の売値 (高貴)。null なら不明 */
  sale: number | null;
  /** 狙いの付加か */
  hit: boolean;
}

export interface UniqueCorruptResult {
  ok: boolean;
  missing: string[];
  /** 1 回の確定費用 = ユニーク + ヴァールオーブ */
  cost: number;
  /** 4 系統の確率 (装飾品は fourth が none に合流) */
  pNone: number;
  pValues: number;
  pEnchant: number;
  pFourth: number;
  /** 狙い 1 つあたりの確率 = pEnchant / N */
  pPerTarget: number;
  /** 狙いのどれかが付く確率 */
  pHit: number;
  outcomes: OutcomeLine[];
  /** 1 回の期待売上 */
  expectedSale: number;
  /** 1 回の期待収支 = 期待売上 − 費用 */
  ev: number;
  /** 当たり 1 個あたりの実質コスト = (費用 − 外れの期待回収) ÷ 当たり確率 */
  costPerHit: number | null;
  /** 当たりの平均売値 (狙いが複数なら確率で平均) */
  avgHitSale: number | null;
  /** 当たり 1 個あたりの利益 = 平均売値 − 実質コスト */
  profitPerHit: number | null;
  bankroll95: { attempts: number; cost: number } | null;
  bankroll99: { attempts: number; cost: number } | null;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const pos = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);

export function outcomeProbabilities(w: CorruptWeights, fourth: FourthOutcome): { none: number; values: number; enchant: number; fourth: number } {
  const a = [pos(w.none), pos(w.values), pos(w.enchant), pos(w.fourth)];
  const sum = a[0] + a[1] + a[2] + a[3];
  const p = sum > 0 ? a.map((x) => x / sum) : [0.25, 0.25, 0.25, 0.25];
  // 装飾品 / ジュエル: 4 つ目の系統は「何もなし」→ 変化なしに合流 (U4N: jewellery receive no change)
  if (fourth === "none") return { none: p[0] + p[3], values: p[1], enchant: p[2], fourth: 0 };
  return { none: p[0], values: p[1], enchant: p[2], fourth: p[3] };
}

function attemptsFor(pHit: number, confidence: number): number {
  if (pHit <= 0) return Infinity;
  if (pHit >= 1) return 1;
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - pHit));
}

export function evaluateUniqueCorrupt(i: UniqueCorruptInputs, params: UniqueCorruptParams): UniqueCorruptResult {
  const missing: string[] = [];
  if (i.basePrice == null) missing.push("未コラプトの最安");
  if (i.vaalPrice == null) missing.push("ヴァールオーブ");
  if (i.floorPrice == null) missing.push("コラプト済みの最安 (外れの売値)");
  if (i.poolSize <= 0) missing.push("付加プール");
  const priced = i.targets.filter((t) => t.price != null);
  const p = outcomeProbabilities(params.weights, i.fourth);
  const pPerTarget = i.poolSize > 0 ? p.enchant / i.poolSize : 0;
  const base: UniqueCorruptResult = {
    ok: false,
    missing,
    cost: 0,
    pNone: p.none,
    pValues: p.values,
    pEnchant: p.enchant,
    pFourth: p.fourth,
    pPerTarget,
    pHit: pPerTarget * priced.length,
    outcomes: [],
    expectedSale: 0,
    ev: 0,
    costPerHit: null,
    avgHitSale: null,
    profitPerHit: null,
    bankroll95: null,
    bankroll99: null,
  };
  if (missing.length > 0) return base;
  const basePrice = i.basePrice!;
  const vaal = i.vaalPrice!;
  const floor = i.floorPrice!;
  const cost = basePrice + vaal;

  const outcomes: OutcomeLine[] = [];
  outcomes.push({ key: "none", label: "変化なし (コラプト済みになるだけ)", p: p.none, sale: floor, hit: false });
  outcomes.push({ key: "values", label: "各 MOD の値が ×0.78〜1.22 (外れ扱いで売る)", p: p.values, sale: floor, hit: false });
  for (const t of priced) outcomes.push({ key: `hit:${t.id}`, label: `付加: ${t.label}`, p: pPerTarget, sale: t.price, hit: true });
  const pOther = Math.max(0, p.enchant - pPerTarget * priced.length);
  if (pOther > 0) outcomes.push({ key: "enchant-other", label: "付加: 狙い以外 (外れ扱いで売る)", p: pOther, sale: floor, hit: false });
  if (p.fourth > 0) {
    outcomes.push({
      key: "fourth",
      label: i.fourth === "socket" ? "ルーンソケット +1 (外れ扱いで売る)" : "品質が上がる (最大 23%、外れ扱いで売る)",
      p: p.fourth,
      sale: floor,
      hit: false,
    });
  }

  const pHit = pPerTarget * priced.length;
  const expectedSale = outcomes.reduce((s, o) => s + o.p * (o.sale ?? 0), 0);
  const salvage = outcomes.filter((o) => !o.hit).reduce((s, o) => s + o.p * (o.sale ?? 0), 0);
  const hitSale = outcomes.filter((o) => o.hit).reduce((s, o) => s + o.p * (o.sale ?? 0), 0);
  const avgHitSale = pHit > 0 ? hitSale / pHit : null;
  const costPerHit = pHit > 0 ? (cost - salvage) / pHit : null;
  const a95 = attemptsFor(pHit, 0.95);
  const a99 = attemptsFor(pHit, 0.99);
  return {
    ...base,
    ok: true,
    cost,
    pHit,
    outcomes,
    expectedSale,
    ev: expectedSale - cost,
    costPerHit,
    avgHitSale,
    profitPerHit: costPerHit != null && avgHitSale != null ? avgHitSale - costPerHit : null,
    bankroll95: Number.isFinite(a95) ? { attempts: a95, cost: a95 * cost } : null,
    bankroll99: Number.isFinite(a99) ? { attempts: a99, cost: a99 * cost } : null,
  };
}

/**
 * アーキテクトオーブ (2 重コラプト): 付加が 1 つ付いたコラプト済みの品に打つ。
 *   生存 (既定 50%) なら 2 個目の付加がプール (既にある付加のグループを除く N−1) から一様に付く。破壊なら 0。
 */
export interface ArchitectInputs {
  /** いま持っている品の価値 (1 個目の付加つきの売値)。これを賭ける */
  itemValue: number | null;
  orbPrice: number | null;
  /** 2 個目のプール数 (= N − 1) */
  poolSize: number;
  /** 2 個目の狙いと、その 2 重コラプト品の売値 */
  targets: TargetPrice[];
  /** 2 個目が狙い以外だった時の売値 (2 重コラプト品の最安) */
  floorPrice: number | null;
}

export interface ArchitectResult {
  ok: boolean;
  missing: string[];
  cost: number;
  pSurvive: number;
  pPerTarget: number;
  pHit: number;
  outcomes: OutcomeLine[];
  expectedSale: number;
  /** 期待収支 = 期待売値 − (いまの品の価値 + オーブ) */
  ev: number;
  costPerHit: number | null;
  avgHitSale: number | null;
}

export function evaluateArchitect(i: ArchitectInputs, params: UniqueCorruptParams): ArchitectResult {
  const missing: string[] = [];
  if (i.itemValue == null) missing.push("1 個目の付加つきの売値");
  if (i.orbPrice == null) missing.push("アーキテクトオーブ");
  if (i.floorPrice == null) missing.push("2 重コラプト品の最安 (外れの売値)");
  if (i.poolSize <= 0) missing.push("付加プール");
  const survive = clamp01(params.architectSurvive);
  const priced = i.targets.filter((t) => t.price != null);
  const pPerTarget = i.poolSize > 0 ? survive / i.poolSize : 0;
  const base: ArchitectResult = { ok: false, missing, cost: 0, pSurvive: survive, pPerTarget, pHit: pPerTarget * priced.length, outcomes: [], expectedSale: 0, ev: 0, costPerHit: null, avgHitSale: null };
  if (missing.length > 0) return base;
  const cost = i.itemValue! + i.orbPrice!;
  const floor = i.floorPrice!;
  const outcomes: OutcomeLine[] = [];
  outcomes.push({ key: "destroy", label: "破壊", p: 1 - survive, sale: 0, hit: false });
  for (const t of priced) outcomes.push({ key: `hit:${t.id}`, label: `2 個目の付加: ${t.label}`, p: pPerTarget, sale: t.price, hit: true });
  const pOther = Math.max(0, survive - pPerTarget * priced.length);
  if (pOther > 0) outcomes.push({ key: "other", label: "2 個目の付加: 狙い以外 (2 重コラプト品の最安で売る)", p: pOther, sale: floor, hit: false });
  const pHit = pPerTarget * priced.length;
  const expectedSale = outcomes.reduce((s, o) => s + o.p * (o.sale ?? 0), 0);
  const salvage = outcomes.filter((o) => !o.hit).reduce((s, o) => s + o.p * (o.sale ?? 0), 0);
  const hitSale = outcomes.filter((o) => o.hit).reduce((s, o) => s + o.p * (o.sale ?? 0), 0);
  return {
    ...base,
    ok: true,
    cost,
    pHit,
    outcomes,
    expectedSale,
    ev: expectedSale - cost,
    costPerHit: pHit > 0 ? (cost - salvage) / pHit : null,
    avgHitSale: pHit > 0 ? hitSale / pHit : null,
  };
}

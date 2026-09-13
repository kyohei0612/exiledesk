/**
 * ES 兜のクラフト — 期待値モデル (純粋関数、UI 非依存) 2026-09-14
 *
 * マジックの ES ティアラ (フラット ES 付き) を買い、強化の大エッセンス (%ES) → 保存された肋骨 + 左の降霊のお告げ (冒涜のハイブリッド ES) →
 * 大エグザルト ×2 (耐性 2 つ) で「ES 450 以上 + 元素耐性 合計 60 以上」の兜を作って売る (Fubgun 0.5.5 のレシピを 0.5 の枠に合わせた形)。
 * 上位ラインは 2 ソケットの規格外ベースで「耐性 80 以上」を狙う。
 *
 * 当たる確率は MOD の重みが非公開なので出せない。ここでは
 *   - 損益分岐の当たり率 = (費用 − 外れの売値) ÷ (当たりの売値 − 外れの売値)
 *   - 仮置きの確率 (当たり / 中 / 外れ、UI で可変) での期待収支と N 回の試算
 * を出し、収支ページの実測 (作った数と当たった数) と比べる。金額は全て高貴 (Exalted) 建て。
 */

export interface EsHelmetProbs {
  /** 当たり (ES 450+ · 耐性 60+) */
  hit: number;
  /** 中 (ES 400+ · 耐性 60+)。残りが外れ */
  mid: number;
}

export const DEFAULT_ES_HELMET_PROBS: EsHelmetProbs = { hit: 0.35, mid: 0.4 };

export interface EsHelmetInputs {
  /** ベース (マジック / 規格外ノーマル) の最安 */
  basePrice: number | null;
  /** 1 回に使う素材: 単価 × 数 (null は相場なし) */
  materials: { key: string; label: string; unit: number | null; qty: number }[];
  /** 当たり / 中 / 外れ の売値 (trade2 最安) */
  hitPrice: number | null;
  midPrice: number | null;
  missPrice: number | null;
}

export interface EsHelmetResult {
  ok: boolean;
  missing: string[];
  /** 1 回の費用 = ベース + 素材 */
  cost: number;
  materialsCost: number;
  pHit: number;
  pMid: number;
  pMiss: number;
  expectedSale: number;
  ev: number;
  /** 損益分岐の当たり率 (中を 0 と見た保守的な値)。外れの売値が費用以上なら 0 */
  breakeven: number;
  /** 当たり 1 個あたりの実質コスト = (費用 − 外れ側の期待回収) ÷ 当たり率 */
  costPerHit: number | null;
  bankroll95: { attempts: number; cost: number } | null;
  bankroll99: { attempts: number; cost: number } | null;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

function attemptsFor(p: number, confidence: number): number {
  if (p <= 0) return Infinity;
  if (p >= 1) return 1;
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
}

export function evaluateEsHelmet(i: EsHelmetInputs, probs: EsHelmetProbs): EsHelmetResult {
  const missing: string[] = [];
  if (i.basePrice == null) missing.push("ベースの最安");
  for (const m of i.materials) if (m.unit == null && m.qty > 0) missing.push(m.label);
  if (i.hitPrice == null) missing.push("当たりの売値");
  if (i.midPrice == null) missing.push("中の売値");
  if (i.missPrice == null) missing.push("外れの売値");
  const pHit = clamp01(probs.hit);
  const pMid = Math.min(clamp01(probs.mid), 1 - pHit);
  const pMiss = Math.max(0, 1 - pHit - pMid);
  const materialsCost = i.materials.reduce((s, m) => s + (m.unit ?? 0) * m.qty, 0);
  const base: EsHelmetResult = {
    ok: false,
    missing,
    cost: (i.basePrice ?? 0) + materialsCost,
    materialsCost,
    pHit,
    pMid,
    pMiss,
    expectedSale: 0,
    ev: 0,
    breakeven: 0,
    costPerHit: null,
    bankroll95: null,
    bankroll99: null,
  };
  if (missing.length > 0) return base;
  const cost = i.basePrice! + materialsCost;
  const hit = i.hitPrice!;
  const mid = i.midPrice!;
  const miss = i.missPrice!;
  const expectedSale = pHit * hit + pMid * mid + pMiss * miss;
  const salvage = pMid * mid + pMiss * miss;
  const breakeven = hit > miss ? clamp01((cost - miss) / (hit - miss)) : 1;
  const a95 = attemptsFor(pHit, 0.95);
  const a99 = attemptsFor(pHit, 0.99);
  return {
    ...base,
    ok: true,
    cost,
    expectedSale,
    ev: expectedSale - cost,
    breakeven,
    costPerHit: pHit > 0 ? (cost - salvage) / pHit : null,
    bankroll95: Number.isFinite(a95) ? { attempts: a95, cost: a95 * cost } : null,
    bankroll99: Number.isFinite(a99) ? { attempts: a99, cost: a99 * cost } : null,
  };
}

/** 仮置きの確率を変えた時の比較表 (当たり率ごとの期待収支) */
export function scenarioTable(i: EsHelmetInputs, midProb: number, hits: number[]): { hit: number; ev: number | null; evN10: number | null; pAny10: number }[] {
  return hits.map((h) => {
    const r = evaluateEsHelmet(i, { hit: h, mid: midProb });
    return { hit: h, ev: r.ok ? r.ev : null, evN10: r.ok ? r.ev * 10 : null, pAny10: 1 - Math.pow(1 - h, 10) };
  });
}

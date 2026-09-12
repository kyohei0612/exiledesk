/**
 * 聖別の賭け — 期待値モデル (純粋関数、UI 非依存) 2026-09-12
 *
 * 神のオーブ + 聖別のお告げ (クライアント: 「次回レアアイテムに使用する神のオーブはそのアイテムを聖別する」)。
 * コミュニティ観測では、聖別は「各モッドの数値に、モッドごとに独立な倍率 (0.78〜1.22 の一様乱数) を掛けて丸める」。
 * 聖別後はほぼ手を加えられない (ソケット・増強程度)。倍率の範囲は GGG 非公開なので UI で変更できる。
 *
 * 判定 (自前の単純化):
 *   - 各モッドに「重要」フラグ、ブリック値 (これ未満なら売り物にならない)、目標値 (これ以上なら当たり)、
 *     任意で大当たり値 を設定する
 *   - 結果は 4 区分: ブリック (重要モッドのどれかがブリック値未満) / 大当たり (重要モッド全部が大当たり値以上) /
 *     当たり (重要モッド全部が目標値以上) / 現状維持 (それ以外)
 *   - 区分ごとに売値を入れて、期待値 = Σ 確率 × 売値 − 費用 (神のオーブ + お告げ)
 *   - 未聖別のまま売る値段と比べる
 *
 * 品質: 表示値 = floor(実値 × (1 + 品質/100))。聖別は実値に掛かってから品質が再適用される。
 *       品質の影響を受けるモッドは「実値」に戻してから計算する (UI 側で品質と対象フラグを入力)。
 */

export interface SanctifyParams {
  factorMin: number;
  factorMax: number;
}
export const DEFAULT_SANCTIFY_PARAMS: SanctifyParams = { factorMin: 0.78, factorMax: 1.22 };

export interface SanctifyAffix {
  id: string;
  /** 表示名 */
  label: string;
  /** アイテムに表示されている値 (品質込み) */
  shown: number;
  /** 小数桁 (0 = 整数)。丸めの単位に使う */
  decimals: number;
  /** 品質の影響を受けるモッドか */
  qualityApplies: boolean;
  /** 重要モッド (売値判定に使う)。false なら分布だけ表示 */
  key: boolean;
  /** ブリック値 (これ未満はブリック)。null なら判定に使わない */
  brickBelow: number | null;
  /** 目標値 (これ以上で当たり) */
  target: number | null;
  /** 大当たり値 (これ以上で大当たり)。null なら大当たり無し */
  jackpot: number | null;
  /** GGG 内部 stat ID (貼り付け解析で取れた物)。trade2 の自動相場に使う。手で追加した物は空 */
  statIds?: string[];
}

export interface SanctifyPrices {
  /** 聖別せずに今売る値段 */
  unsanctified: number | null;
  /** 現状維持 (聖別したが大きく動かず) の売値 */
  unchanged: number | null;
  /** ブリック時の売値 (0 でも可) */
  bricked: number | null;
  hit: number | null;
  jackpot: number | null;
}

export interface AffixDistribution {
  affix: SanctifyAffix;
  /** 実値 (品質を外した値) */
  real: number;
  /** 結果値 (表示値ベース) → 確率 */
  outcomes: { value: number; p: number }[];
  pBrick: number;
  pTarget: number;
  pJackpot: number;
  /** 期待値 (表示値ベース) */
  mean: number;
}

export interface SanctifyResult {
  distributions: AffixDistribution[];
  /** 4 区分の確率 */
  pBrick: number;
  pHit: number;
  pJackpot: number;
  pUnchanged: number;
  /** 期待売上 / 費用 / 期待収支 (売値が揃っている時) */
  expectedRevenue: number | null;
  cost: number;
  ev: number | null;
  /** 未聖別で売る場合との差 (プラスなら聖別した方が得) */
  vsSell: number | null;
  missing: string[];
}

const round = (x: number, decimals: number): number => {
  const m = Math.pow(10, decimals);
  return Math.round(x * m) / m;
};

/** 表示値 → 実値 (品質を外す)。floor(real × (1+q)) = shown を満たす最小の real (丸め単位) */
export function realFromShown(shown: number, decimals: number, qualityPct: number, applies: boolean): number {
  if (!applies || qualityPct <= 0) return shown;
  const k = 1 + qualityPct / 100;
  const step = Math.pow(10, -decimals);
  let real = round(shown / k, decimals);
  // floor 側に寄せる: real×k を floor(丸め単位) して shown になるまで調整
  const shownOf = (r: number): number => Math.floor(r * k * Math.pow(10, decimals) + 1e-9) / Math.pow(10, decimals);
  let guard = 0;
  while (shownOf(real) < shown && guard++ < 1000) real = round(real + step, decimals);
  while (shownOf(real - step) >= shown && real - step > 0 && guard++ < 2000) real = round(real - step, decimals);
  return real;
}

/** 実値 → 表示値 (品質を掛けて切り捨て) */
function shownFromReal(real: number, decimals: number, qualityPct: number, applies: boolean): number {
  if (!applies || qualityPct <= 0) return round(real, decimals);
  const m = Math.pow(10, decimals);
  return Math.floor(real * (1 + qualityPct / 100) * m + 1e-9) / m;
}

/**
 * 1 モッドの結果分布。倍率 f が [min,max] の一様分布、結果 = round(real × f) (丸め単位 = decimals)。
 * 結果値 v になるのは f ∈ [(v−h)/real, (v+h)/real) (h = 半単位) の区間。
 */
export function affixDistribution(a: SanctifyAffix, qualityPct: number, p: SanctifyParams): AffixDistribution {
  const real = realFromShown(a.shown, a.decimals, qualityPct, a.qualityApplies);
  const outcomes: { value: number; p: number }[] = [];
  const fmin = Math.min(p.factorMin, p.factorMax);
  const fmax = Math.max(p.factorMin, p.factorMax);
  const width = fmax - fmin;
  if (real <= 0 || width <= 0) {
    outcomes.push({ value: a.shown, p: 1 });
  } else {
    const step = Math.pow(10, -a.decimals);
    const half = step / 2;
    const lo = round(real * fmin, a.decimals);
    const hi = round(real * fmax, a.decimals);
    for (let v = lo; v <= hi + 1e-9; v = round(v + step, a.decimals)) {
      const a0 = Math.max(fmin, (v - half) / real);
      const a1 = Math.min(fmax, (v + half) / real);
      const pr = Math.max(0, a1 - a0) / width;
      if (pr > 0) outcomes.push({ value: shownFromReal(v, a.decimals, qualityPct, a.qualityApplies), p: pr });
    }
    // 品質再適用で同じ表示値になる物をまとめる
    const merged = new Map<number, number>();
    for (const o of outcomes) merged.set(o.value, (merged.get(o.value) ?? 0) + o.p);
    outcomes.length = 0;
    for (const [value, pr] of [...merged.entries()].sort((x, y) => x[0] - y[0])) outcomes.push({ value, p: pr });
  }
  const sum = outcomes.reduce((s, o) => s + o.p, 0) || 1;
  for (const o of outcomes) o.p /= sum;
  const pBrick = a.brickBelow == null ? 0 : outcomes.filter((o) => o.value < a.brickBelow!).reduce((s, o) => s + o.p, 0);
  const pTarget = a.target == null ? 1 : outcomes.filter((o) => o.value >= a.target!).reduce((s, o) => s + o.p, 0);
  const pJackpot = a.jackpot == null ? 0 : outcomes.filter((o) => o.value >= a.jackpot!).reduce((s, o) => s + o.p, 0);
  const mean = outcomes.reduce((s, o) => s + o.value * o.p, 0);
  return { affix: a, real, outcomes, pBrick, pTarget, pJackpot, mean };
}

export function evaluateSanctify(
  affixes: SanctifyAffix[],
  qualityPct: number,
  prices: SanctifyPrices,
  cost: number,
  p: SanctifyParams,
): SanctifyResult {
  const distributions = affixes.map((a) => affixDistribution(a, qualityPct, p));
  const keys = distributions.filter((d) => d.affix.key);
  // 重要モッドは独立なので、ブリック無し確率 = Π(1−pBrick)、全部当たり = Π pTarget(ブリック無し条件込み)
  let pNoBrick = 1;
  let pAllTarget = 1;
  let pAllJackpot = 1;
  let anyJackpot = false;
  for (const d of keys) {
    pNoBrick *= 1 - d.pBrick;
    pAllTarget *= d.pTarget;
    if (d.affix.jackpot != null) {
      anyJackpot = true;
      pAllJackpot *= d.pJackpot;
    }
  }
  if (!anyJackpot) pAllJackpot = 0;
  // 目標値 ≥ ブリック値 が前提なので、当たりはブリック無しに含まれる。大当たりは当たりに含まれる。
  const pBrick = 1 - pNoBrick;
  const pJackpot = Math.min(pAllJackpot, pAllTarget);
  const pHit = Math.max(0, pAllTarget - pJackpot);
  const pUnchanged = Math.max(0, pNoBrick - pAllTarget);

  const missing: string[] = [];
  if (prices.unchanged == null) missing.push("現状維持の売値");
  if (prices.hit == null && pHit > 0) missing.push("当たりの売値");
  if (prices.jackpot == null && pJackpot > 0) missing.push("大当たりの売値");
  if (prices.bricked == null && pBrick > 0) missing.push("ブリック時の売値");
  const complete = missing.length === 0;
  const expectedRevenue = complete
    ? pBrick * (prices.bricked ?? 0) + pUnchanged * (prices.unchanged ?? 0) + pHit * (prices.hit ?? 0) + pJackpot * (prices.jackpot ?? 0)
    : null;
  const ev = expectedRevenue == null ? null : expectedRevenue - cost;
  const vsSell = ev == null || prices.unsanctified == null ? null : ev - prices.unsanctified;
  return { distributions, pBrick, pHit, pJackpot, pUnchanged, expectedRevenue, cost, ev, vsSell, missing };
}

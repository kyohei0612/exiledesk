/**
 * fracture-value.ts — 「その MOD を固定したら、いくら安くなるか」(2026-09-23)
 *
 * オーナー指摘:「カオススパムや安全に決定論クラフトなら、消えないように削減やらエッセンス使って
 * 完成品ができる場合もあるだろうから、その場合は別にフラクチャー品探さなくていいよね」。
 *
 * ## 「壊す手を使うか」では判定できません (試して捨てた案)
 * 最初は最適方策に `annul` / `chaos` が出てくるかで見ようとしました。**ほぼ全部当たります** ──
 * 1 個狙いでも「外したら消して振り直す」のが最安なので、消去は必ず出てきます。
 * 判定として使い物になりません。
 *
 * ## 差額で見る
 * フラクチャーが値打ちなのは「**固定したぶん安くなる**」からです。だったら測ればいい:
 *   固定しない場合の期待費用 − 固定した場合の期待費用
 * これが小さいなら、探す手間 (検索 1 回 = 10.5 秒) をかける価値がありません。
 *
 * 実測 2026-09-23 (太陽のアミュレット 4 目標): 素から 2,015 神 → 一番つきにくい 1 個を固定して
 * **231 神 (11%)**。この時は探す価値が大きい。
 *
 * ## 解くのは 2 回
 * 固定なしと固定ありで MDP を 1 回ずつ。目標が少なければ一瞬ですが、多いと分単位になります
 * ([[budget.ts]])。**押された時だけ**呼んでください。
 */
import { markovFromItem } from "../../vendor/poe2htc/optimizer/markovFromItem";
import { fracturedStart } from "./partial-start";
import { withEssenceAlternatives } from "./essence-route";
import { whiteItem } from "../../vendor/poe2htc/engine/item";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import { withCatalysing } from "./catalysing";

export interface FractureValue {
  modId: string;
  /** 固定しない場合の期待費用 (高貴建て) */
  without: number;
  /** その 1 個を固定した場合 (高貴建て) */
  with: number;
  /** `with / without`。小さいほど固定が効く */
  ratio: number | null;
  /**
   * 探す価値があるか。**固定して半分以下になるなら探す**。
   * それ未満の効きなら、検索 1 回 (10.5 秒) を他に使ったほうが得です。
   */
  worth: boolean;
  ms: number;
  /** 画面にそのまま出す 1 行 */
  note: string;
}

/** 効きの線引き。固定して**半分以下**になるなら探す価値がある */
const WORTH_RATIO = 0.5;

/**
 * その 1 個を固定した時の差額を出す。**MDP を 2 回解きます。**
 *
 * @param target 固定する候補 (ふつうは一番つきにくい物)
 */
export function fractureValue(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  targets: readonly TierTarget[],
  target: TierTarget,
  opts: { level?: number } = {},
): FractureValue {
  const t0 = Date.now();
  const level = opts.level ?? 82;
  const wide = withEssenceAlternatives(data, cls, targets, level);
  const a = markovFromItem(data, prices, whiteItem(cls, level), wide, withCatalysing(data, cls, wide));
  const fx = fracturedStart(data, cls, level, targets, [target]);
  const b = fx
    ? markovFromItem(data, prices, fx.start, withEssenceAlternatives(data, cls, fx.rest, level), withCatalysing(data, cls, fx.rest))
    : null;
  const without = a.expectedCost;
  const withIt = b?.expectedCost ?? Number.POSITIVE_INFINITY;
  const ok = Number.isFinite(without) && Number.isFinite(withIt) && without > 0;
  const ratio = ok ? withIt / without : null;
  const worth = ratio != null && ratio <= WORTH_RATIO;
  return {
    modId: target.modId,
    without,
    with: withIt,
    ratio,
    worth,
    ms: Date.now() - t0,
    note: ratio == null
      ? "差額が出せません (どちらかが解けない)。"
      : worth
        ? `固定すると **${Math.round(ratio * 100)}%** まで下がります。探す価値があります。`
        : `固定しても ${Math.round(ratio * 100)}% にしかなりません。**検索 1 回を他に使ったほうが得です。**`,
  };
}

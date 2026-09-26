/**
 * craft-slots.ts — 「確定で乗せられる MOD が何個あるか」を先に数える (2026-09-22)
 *
 * オーナー指示:「まず目標 MOD に決定論クラフト MOD が何個あるか確認作業がいる。それによって
 * 道順の計算がだいぶ楽になる。クラフト MOD 2 個の場合とか絶対アストリッドいる」。
 *
 * ## ゲームの決まり
 * **アイテムが持てるクラフト MOD は 1 個だけ** (patch 0.5.0「items can only have 1 crafted
 * modifier at a time」)。ここでいうクラフト MOD は**エッセンス / パーフェクトエッセンス / 合金**で、
 * 3 つは**同じ 1 枠を取り合います**。`アストリッドの創造性` を差すと 2 個まで持てます。
 *
 * ## 先に数えると何が良いか
 *   - **2 個ならアストリッドが要る**と即断できる (差さないと絶対に作れない)
 *   - 3 個以上なら**作れない**。解く前に断れる
 *   - 1 個で埋まっているなら、**他の MOD をエッセンスで出す道は塞がっている**
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { limitsOf } from "../../vendor/poe2htc/engine/item";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** アストリッドの創造性が足すクラフト枠 */
export const ASTRID_PLUS = 1;
/** そのルーンの id (`engine/runes.ts` の表と同じ) */
export const ASTRID_RUNE = "astrids-creativity";

/** その MOD が「確定で乗せる」種類か (エッセンス / パーフェクトエッセンス / 合金) */
export function isCraftedMod(mod: Mod | undefined): boolean {
  return !!mod && CRAFTED_SOURCES.has(mod.source);
}

/** 数えた結果 */
export interface CraftedSurvey {
  /** 確定で乗せる目標 */
  crafted: Array<{ modId: string; source: string }>;
  /** そのベースが持てるクラフト MOD の数 (既定 1) */
  limit: number;
  /** アストリッドを差せば持てる数 */
  limitWithAstrid: number;
  /** アストリッドが要るか (差さないと作れない) */
  needsAstrid: boolean;
  /** アストリッドを差しても作れないか */
  impossible: boolean;
  /** まだ使えるクラフト枠 (エッセンスに振り替えられる残り) */
  headroom: number;
  /** 画面にそのまま出す 1 行 */
  note: string;
}

/**
 * 目標のうち「確定で乗せる MOD」が何個あるかを数える。**解く前に呼ぶこと。**
 *
 * @param astrid アストリッドの創造性を差す前提なら true
 */
export function craftedSurvey(
  data: PatchData,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { astrid?: boolean } = {},
): CraftedSurvey {
  const crafted = targets
    .map((t) => ({ t, mod: data.mods.get(t.modId) }))
    .filter((x) => isCraftedMod(x.mod))
    .map((x) => ({ modId: x.t.modId, source: String(x.mod!.source) }));
  const baseLimit = limitsOf(cls).crafted ?? 1;
  const limitWithAstrid = baseLimit + ASTRID_PLUS;
  const limit = opts.astrid ? limitWithAstrid : baseLimit;
  const n = crafted.length;
  const needsAstrid = n > baseLimit && n <= limitWithAstrid;
  const impossible = n > limitWithAstrid;

  const note = impossible
    ? `確定で乗せる MOD が ${n} 個ありますが、アイテムは ${limitWithAstrid} 個までです (アストリッドを差しても足りません)。`
    : needsAstrid
      ? `確定で乗せる MOD が ${n} 個あります。**アストリッドの創造性が要ります** (差さないと ${baseLimit} 個までです)。`
      : n === limit
        ? `確定で乗せる MOD が ${n} 個で、枠 ${limit} 個を使い切っています。他の MOD をエッセンスで出す道はありません。`
        : `確定で乗せる MOD は ${n} 個 / 枠 ${limit} 個。あと ${limit - n} 個ぶんエッセンスに振り替えられます。`;

  return {
    crafted,
    limit,
    limitWithAstrid,
    needsAstrid,
    impossible,
    headroom: Math.max(0, limit - n),
    note,
  };
}

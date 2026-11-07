/**
 * sim-methods.ts — シミュレーターの狙う MOD の付け方 (2026-10-18 オーナー「2 の狙う時に T1 とかで選択時に付け方をその場で選ばせる、ポップアップで」)。
 * 普通の MOD は 高貴ガチャ / カオススパム / 増強スパム / 冒涜 / フラクチャー から選ぶ。冒涜の MOD は冒涜、エッセンス・合金の MOD はエッセンスに決まっている (選ばせない)。
 * 付け方のポップアップ (SimMethodPop・methodsOff) は 2026-10-23 にクラフト台の中の旧シミュと一緒に消えた
 */
import { type PatchData, freshItem, isCraftedSource, isDesecratedSource, limitOf } from "../craft-stage/engine";
import type { SimMethod } from "./quiz-build";

/**
 * その MOD に使える付け方 (最初が既定、1 つなら選ばせずにそれで足す)。シミュとクイズの組み立て (quiz-build の methodOfTarget) で同じ 1 本
 * (G-1 V-3 J-30、11-07。前は同じ名前の 2 つで、片方は fracture あり・エッセンスの判定が文字の直書き)。エッセンス・合金の MOD かはエンジンの isCraftedSource。
 * フラクチャーは付け方の並びに入れない (狙いに ✦ の印で別に持つ、methodOfTarget)。MOD が無ければ高貴だけ
 */
export function methodsFor(d: PatchData | null, modId: string): SimMethod[] {
  const m = d?.mods.get(modId);
  if (!m) return ["exalt"];
  if (isDesecratedSource(m.source)) return ["desecrate"];
  if (isCraftedSource(m.source)) return ["essence"];
  return ["exalt", "chaos", "augment", "desecrate"];
}

/** シミュレーターの狙い 1 つ (旧 state/sim-state.ts の simTargets と同じ形) */
export interface SimTargetLike { modId: string; minTierIndex: number; method?: SimMethod; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number; rest?: "exalt" | "chaos" | "desecrate" }

/** そのベースのレアの側ごとの枠 (特殊なベースの「プレ / サフィ ±N 個」込み) */
export function sideLimits(d: PatchData | null, base: string, itemLevel: number): { prefix: number; suffix: number } {
  if (!d) return { prefix: 3, suffix: 3 };
  try {
    const it = { ...freshItem(d, base, itemLevel), rarity: "rare" as const };
    return { prefix: limitOf(it, "prefix"), suffix: limitOf(it, "suffix") };
  } catch { return { prefix: 3, suffix: 3 }; }
}

/** シミュレーターの始め方 (3 で縦に全部並べて、ベースの値段を比べる。2026-10-18 オーナー「始め方はタブで出さず全部計算させるから縦にそれぞれ表示」) */
export type SimStartKind = "white" | "fractured" | "magic" | "four" | "item";

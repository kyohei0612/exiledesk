/**
 * sim-methods.ts — シミュレーターの狙う MOD の付け方 (2026-10-18 オーナー「2 の狙う時に T1 とかで選択時に付け方をその場で選ばせる、ポップアップで」)。
 * 普通の MOD は 高貴ガチャ / カオススパム / 増強スパム / 冒涜 / フラクチャー から選ぶ。冒涜の MOD は冒涜、エッセンス・合金の MOD はエッセンスに決まっている (選ばせない)。
 * 付け方のポップアップ (SimMethodPop・methodsOff) は 2026-10-23 にクラフト台の中の旧シミュと一緒に消えた
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimMethod } from "./quiz-build";
import { freshItem } from "../craft-stage/run-plan";
import { limitOf } from "../craft-stage/stage-core";

/** その MOD で選べる付け方 (1 つなら選ばせずにそれで足す) */
export function methodsFor(d: PatchData | null, modId: string): SimMethod[] {
  const src = d?.mods.get(modId)?.source;
  if (src === "desecrated") return ["desecrate"];
  if (src === "essence" || src === "perfect_essence") return ["essence"];
  return ["exalt", "chaos", "augment", "desecrate", "fracture"];
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

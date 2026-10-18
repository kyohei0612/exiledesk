/**
 * sim-methods.ts — シミュレーターの狙う MOD の付け方 (2026-10-18 オーナー「2 の狙う時に T1 とかで選択時に付け方をその場で選ばせる、ポップアップで」)。
 * 普通の MOD は 高貴ガチャ / カオススパム / 冒涜 / フラクチャー から選ぶ。冒涜の MOD は冒涜、エッセンス・合金の MOD はエッセンスに決まっている (選ばせない)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimMethod } from "./quiz-build";

export const METHOD_JA: Record<SimMethod, string> = { exalt: "高貴ガチャ", chaos: "カオススパム", desecrate: "冒涜", fracture: "フラクチャー", essence: "エッセンス" };
export const METHOD_EN: Record<SimMethod, string> = { exalt: "Exalt gamble", chaos: "Chaos spam", desecrate: "Desecrate", fracture: "Fracture", essence: "Essence" };

/** その MOD で選べる付け方 (1 つなら選ばせずにそれで足す) */
export function methodsFor(d: PatchData | null, modId: string): SimMethod[] {
  const src = d?.mods.get(modId)?.source;
  if (src === "desecrated") return ["desecrate"];
  if (src === "essence" || src === "perfect_essence") return ["essence"];
  return ["exalt", "chaos", "desecrate", "fracture"];
}

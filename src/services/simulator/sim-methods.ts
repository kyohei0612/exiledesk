/**
 * sim-methods.ts — シミュレーターの狙う MOD の付け方 (2026-10-18 オーナー「2 の狙う時に T1 とかで選択時に付け方をその場で選ばせる、ポップアップで」)。
 * 普通の MOD は 高貴ガチャ / カオススパム / 増強スパム / 冒涜 / フラクチャー から選ぶ。冒涜の MOD は冒涜、エッセンス・合金の MOD はエッセンスに決まっている (選ばせない)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimMethod } from "./quiz-build";
import { freshItem } from "../craft-stage/run-plan";
import { limitOf } from "../craft-stage/stage-core";
import { tr } from "../../i18n/lang";
import { sideOfMod } from "../craft-stage/engine";

export const METHOD_JA: Record<SimMethod, string> = { exalt: "高貴ガチャ", chaos: "カオススパム", augment: "増強スパム", desecrate: "冒涜", fracture: "フラクチャー", essence: "エッセンス" };
export const METHOD_EN: Record<SimMethod, string> = { exalt: "Exalt gamble", chaos: "Chaos spam", augment: "Augmentation spam", desecrate: "Desecrate", fracture: "Fracture", essence: "Essence" };

/** その MOD で選べる付け方 (1 つなら選ばせずにそれで足す) */
export function methodsFor(d: PatchData | null, modId: string): SimMethod[] {
  const src = d?.mods.get(modId)?.source;
  if (src === "desecrated") return ["desecrate"];
  if (src === "essence" || src === "perfect_essence") return ["essence"];
  return ["exalt", "chaos", "augment", "desecrate", "fracture"];
}

/** シミュレーターの狙い 1 つ (state/sim-state.ts の simTargets と同じ形) */
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

/**
 * カオススパムは片側だけ (2026-10-18 オーナー「サフィかプレでカオススパムの道順が違ってくるから、同時にスパムを選ぶのはなし。選ぶならどっちかで」。
 * [[sim-split-by-side]] と同じ考え)。反対側にもうカオススパムの狙いがあれば、その理由 (無ければ null)
 */
export function chaosBlocked(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): string | null {
  const side = (id: string): "prefix" | "suffix" => sideOfMod(d, id);
  const me = side(modId);
  const other = targets.find((t) => t.modId !== modId && t.method === "chaos" && side(t.modId) !== me);
  return other ? (me === "prefix" ? tr("カオススパムはサフィックスで選んでいる (片側だけ)", "Chaos spam is already on suffixes (one side only)") : tr("カオススパムはプレフィックスで選んでいる (片側だけ)", "Chaos spam is already on prefixes (one side only)")) : null;
}

/**
 * 増強スパム (2026-10-21 オーナー OK): マジックで付ける。プレ 1 つ・サフィ 1 つ、側ごとに別に動き、各側は 1 つの狙い (「どれか」の候補は同じ側なら可) だけ。
 * その側にもう増強スパムの狙い (かフラクチャーの候補。マジックで一緒に揃えるので同じ枠を取り合う) があれば、その理由 (無ければ null)
 */
export function augmentBlocked(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): string | null {
  const side = (id: string): "prefix" | "suffix" => sideOfMod(d, id);
  const me = side(modId);
  if (targets.some((t) => t.modId !== modId && t.method === "fracture" && [t, ...(t.alts ?? [])].some((x) => side(x.modId) === me))) return tr("フラクチャー予定と同じ側 (マジックの枠は側ごとに 1 つ)", "Same side as the fracture mod (magic has one slot per side)");
  // 同じ側の 2 つ目の増強スパムは止めない: 足す時にその側の増強スパムの「どれか 1 つ」の候補に入る (augmentHostOf。2026-10-21 モンキーチェック:
  // 見本の靴の「雷・火・冷気耐性のどれか」が 0 から組めなかった)
  return null;
}
/** その側に既にある増強スパムの狙い (2 つ目を選んだら、ここの候補 alts に足す)。無ければ null */
export function augmentHostOf<T extends SimTargetLike>(d: PatchData | null, targets: readonly T[], modId: string): T | null {
  const side = (id: string): "prefix" | "suffix" => sideOfMod(d, id);
  return targets.find((t) => t.modId !== modId && t.method === "augment" && side(t.modId) === side(modId)) ?? null;
}
/** 付け方のポップアップで選べない付け方と理由 (カオススパムは片側だけ・増強スパムは側ごとに 1 つ) */
export function methodsOff(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): Partial<Record<SimMethod, string>> {
  const c = chaosBlocked(d, targets, modId), a = augmentBlocked(d, targets, modId), f = fractureBlocked(d, targets, modId);
  return { ...(c ? { chaos: c } : {}), ...(a ? { augment: a } : {}), ...(f ? { fracture: f } : {}) };
}
/**
 * フラクチャー予定は増強スパムと別の側 (augmentBlocked の逆向き。マジックの枠は側ごとに 1 つ)。前は増強スパムを後から足す時だけ止めていて、
 * 増強スパムが先にあるとフラクチャー予定を同じ側に足せた (2026-10-21 モンキーチェック 10 人中 5 人)
 */
export function fractureBlocked(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): string | null {
  const side = (id: string): "prefix" | "suffix" => sideOfMod(d, id);
  const me = side(modId);
  return targets.some((t) => t.modId !== modId && t.method === "augment" && [t, ...(t.alts ?? [])].some((x) => side(x.modId) === me))
    ? tr("増強スパムと同じ側 (マジックの枠は側ごとに 1 つ)", "Same side as the augmentation spam mod (magic has one slot per side)") : null;
}

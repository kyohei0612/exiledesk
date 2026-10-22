/**
 * can-use.ts — その手がこのアイテムに打てるか (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B11)。
 * 打つ処理はエンジンの applyCurrency・omenBlock・fillCatalyst のまま。ここは「お告げ → 触媒の前のカタリスト → 手そのもの」の順に聞いて、
 * 最初に断られた理由を返すだけ (乱数で決まる物は打てる扱い。オーナーの方針 2026-10-12)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency, kindOf } from "../apply-currency";
import { catalystFull, catalystTagOf, fillCatalyst } from "./hand-effect";
import { omenBlock } from "../omen-block";
import { OMEN_FOR } from "../omens";
import { catalystOf } from "../stage-core";
import { mulberry32 } from "../../htc/rng";
import type { StageItem } from "../types";
import { tr } from "../../../i18n/lang";

/** 触媒の高貴のお告げ (掛けると、高貴の前にカタリストで品質を入れる手になる) */
export const CATALYSING_OMEN = "OmenofCatalysingExaltation";

/**
 * 手に付けたお告げを、その手に掛かる物 (now) と続けて打つ発現に掛かる物 (reveal = アビスの反響) に分ける。
 * 骨 (冒涜) の手に付けた反響は骨には掛からず (渡すとエンジンが弾く)、その後の発現で使う。発現の手そのものなら now
 */
export function handOmens(key: string, omens: readonly string[]): { now: string[]; reveal: string[] } {
  if (kindOf(key) === "reveal") return { now: [...omens], reveal: [] };
  const rv = OMEN_FOR.reveal ?? [];
  return { now: omens.filter((o) => !rv.includes(o)), reveal: omens.filter((o) => rv.includes(o)) };
}

/**
 * その手に付けられるお告げ (OMEN_FOR の手の種類の物)。骨 (冒涜) の手には、後の発現で使うアビスの反響も並べる
 * (2026-10-05 オーナー「骨持った瞬間に反響のお告げも ON にできるように」。掛けるだけで、使われるのは発現の手、handOmens)
 */
export function omensAllowedFor(key: string | null | undefined): string[] {
  if (!key) return [];
  const kind = kindOf(key);
  return [...(OMEN_FOR[kind] ?? []), ...(kind === "desecrate" ? OMEN_FOR.reveal ?? [] : [])];
}
/** カタリスト (品質だけ上げる手。catalyst_<タグ>・jcatalyst_<タグ>) か */
export const isCatalystKey = (key: string): boolean => kindOf(key) === "catalyst";

export interface UseSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ分ける) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ使う) */
  catalyst?: string | null;
}

/**
 * その手 (key + お告げ + 触媒の前のカタリスト) がこのアイテムに打てない理由。打てるなら null。
 * - お告げ: 1 枚ずつ omenBlock (触媒の時はカタリストで品質を入れた後のアイテムで聞く)。消せる物が無い側のお告げ・効かないお告げ (オーナー 10-22「進行不能」)
 * - カタリストの手: 1 個でも入る・もう最大なら打てる
 * - 触媒の高貴: カタリストが入らず、別の種類の品質しか無ければ打てない
 * - 手そのもの: applyCurrency が打てる・乱数で決まる (random) なら打てる
 */
export function canUse(data: PatchData, item: StageItem, key: string, spec: UseSpec = {}): string | null {
  const now = handOmens(key, spec.omens ?? []).now;
  const cat = spec.catalyst && now.includes(CATALYSING_OMEN) ? spec.catalyst : null;
  const filled = cat ? fillCatalyst(data, item, cat, mulberry32(1)).item : item;
  for (const o of now) { const why = omenBlock(data, filled, key, now, o); if (why) return why; }
  const rng = mulberry32(1);
  if (kindOf(key) === "catalyst") {
    const r = fillCatalyst(data, item, key, rng);
    return r.count || catalystFull(item, key) || r.random ? null : r.reason ?? tr("打てない", "Can't use");
  }
  let it = item;
  if (cat) {
    const r = fillCatalyst(data, it, cat, rng);
    if (!r.applied && r.count === 0 && catalystOf(it).tag !== catalystTagOf(cat)) return r.random ? null : r.reason ?? tr("打てない", "Can't use");
    it = r.item;
  }
  const r = applyCurrency(data, it, key, rng, now);
  return r.applied || r.random ? null : r.reason ?? tr("打てない", "Can't use");
}

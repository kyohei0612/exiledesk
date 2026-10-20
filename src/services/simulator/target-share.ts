/**
 * target-share.ts — ① の狙いの「付きやすさ」(2026-10-20 手 3、エンジンの入口に付け替え)
 *
 * その段以上が、同じ側の 1 回の抽選で出る割合。前は StageTargetSummary.vue で段の重みを自前で足していて、下限・系統の塞ぎを見なかった
 * (docs/org/emulator/notes/2026-10-20-engine-entry-plan.md の ①)。今は入口の 1 手の確率 (addHitOdds) から出す:
 *   - 普通の MOD: 空のレア (ルーンの MOD はそのルーンを差したレア) に、その側の高貴 (左右の高貴のお告げ) を 1 回打った時の当たりの割合
 *   - 冒涜の MOD: 同じ空のレアの、その側の冒涜の置き場の候補 (入口の candidates) での割合 (発現の候補 3 つに出る確率ではなく、重みの割合)
 * エッセンスは確定なので出さない (null)
 */
import { addHitOdds, candidates, CRAFTED_SOURCES, effectiveCls, freshItem, hitShare, RUNES, runeIdByName, startFrom, type PatchData, type StageItem, type StageSide } from "../craft-stage/engine";
import { SIDE_OMEN } from "./recipe-defs";

/** 狙いの MOD を付ける前の空のレア (ルーンの MOD はそのルーンを差した物) */
function emptyRare(data: PatchData, base: string, itemLevel: number, rune: string | undefined): StageItem | null {
  if (!rune) return freshItem(data, base, itemLevel, "rare");
  // ステージのルーンの名前 (相場・絵のキー) で差す。エンジンの名前とは ' と ’ が違う事がある (recipe-sim の runeStart と同じ)
  const en = Object.keys(RUNES).find((k) => runeIdByName(k) === rune);
  if (!en) return null;
  try { return startFrom(data, base, itemLevel, { rarity: "rare", sockets: 1, runes: [en] }, 1); } catch { return null; }
}

export function targetShare(data: PatchData, base: string, itemLevel: number, modId: string, minTierIndex: number): number | null {
  const m = data.mods.get(modId);
  if (!m || CRAFTED_SOURCES.has(m.source)) return null;
  const it = emptyRare(data, base, itemLevel, m.rune);
  if (!it) return null;
  const side: StageSide = m.type === "suffix" ? "suffix" : "prefix";
  const targets = [{ modId, minTierIndex }];
  if (m.source === "desecrated") {
    const pool = effectiveCls(it).pools.desecrated;
    const cs = candidates(data, it, [side], 0, { pools: (s) => (s === "suffix" ? pool?.suffixes : pool?.prefixes) ?? [] });
    return cs.length ? hitShare(cs, targets) : null;
  }
  const h = addHitOdds(data, it, "exalt", [SIDE_OMEN.exalt[side]], targets);
  return h && h.total > 0 ? h.p : null;
}

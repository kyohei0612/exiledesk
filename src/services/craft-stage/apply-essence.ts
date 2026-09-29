/**
 * クラフトステージ: エッセンス (2026-09-27、ADR-001)
 *
 * 規則はエンジン (probability.ts の essenceForcedProbability / perfectEssenceProbability、plan.ts) と計算機の sim と同じ:
 *   - 普通のエッセンス (レッサー / 普通 / グレーター): **マジック**にだけ。レアにして、その MOD を足す (付いている MOD は残る)
 *   - パーフェクト (とブリーチ): **レア**にだけ。固定済み以外から 1 つ消して、その MOD を足す。左右の結晶化のお告げで消す側を絞れる。
 *     足す側が埋まっている時は、その側から消す (お告げで反対側を指した時は打てない)
 *   - エッセンスの MOD はアイテムに 1 つまで (isEssenceMod)。系統が付いていれば打てない
 * キーは essence:<lesser|normal|greater|perfect>:<MOD の id>、ブリーチは essence:breach (指輪・アミュレットの品質の最大値の MOD)。
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { BREACH_FAMILY } from "../htc/omens";
import { allMods, listOf, makeStageMod, rareLimitOf, removeOne, room, SIDES, skip, takenRawFamilies, withMod } from "./stage-core";
import { essenceClash } from "../mods/mod-rules";
import type { StageApply, StageItem, StageSide } from "./types";

/** そのクラスのエッセンスの MOD (側つき) */
function essenceMods(data: PatchData, item: StageItem): Array<{ mod: Mod; side: StageSide }> {
  return SIDES.flatMap((side) => item.cls.pools.essence[side === "prefix" ? "prefixes" : "suffixes"].flatMap((id) => {
    const mod = data.mods.get(id);
    return mod ? [{ mod, side }] : [];
  }));
}

/** キー → 段の強さと MOD (このクラスで使えない物は null) */
export function essenceTarget(data: PatchData, item: StageItem, key: string): { level: string; mod: Mod; side: StageSide } | null {
  const list = essenceMods(data, item);
  if (key === "essence:breach") {
    const hit = list.find((x) => x.mod.family === BREACH_FAMILY);
    return hit ? { level: "perfect", ...hit } : null;
  }
  const m = /^essence:(lesser|normal|greater|perfect):(.+)$/.exec(key);
  if (!m) return null;
  const hit = list.find((x) => x.mod.id === m[2]);
  return hit ? { level: m[1]!, ...hit } : null;
}

export function applyEssence(data: PatchData, item: StageItem, key: string, rng: () => number, used: readonly string[]): StageApply {
  const t = essenceTarget(data, item, key);
  if (!t) return skip(item, "このベースには使えないエッセンス");
  const { mod, side, level } = t;
  // 段: 普通のエッセンスは段の名前 (Lesser / Greater / 無印) で選ぶ。パーフェクトは 1 段
  const tierIndex = level === "perfect" ? 0 : mod.tiers.findIndex((x) => essenceLevelOf(String(x.name ?? "")) === level);
  const tier = mod.tiers[tierIndex];
  if (!tier) return skip(item, "このエッセンスの段が無い");
  if (tier.ilvl > item.itemLevel) return skip(item, `アイテムレベルが足りない (${tier.ilvl} 以上)`);
  if (allMods(item).some((m) => m.crafted)) return skip(item, "エッセンスの MOD はアイテムに 1 つまで");
  const clash = (it: StageItem) => essenceClash(mod, takenRawFamilies(data, it));
  const sm = { ...makeStageMod(mod, side, tierIndex, rng), crafted: true };

  if (level !== "perfect") {
    if (item.rarity !== "magic") return skip(item, "マジックのアイテムにだけ使える (レアにはパーフェクト)");
    if (listOf(item, side).length >= rareLimitOf(item, side)) return skip(item, "足す側に空きが無い");
    if (clash(item)) return skip(item, "同じ系統の MOD が付いている");
    return { applied: true, item: withMod({ ...item, rarity: "rare" }, sm), added: [sm], removed: [] };
  }

  if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
  // 結晶化のお告げ: 消す側。足す側が埋まっていれば、その側から消すしかない
  const omenSide: StageSide | null = used.includes("OmenofSinistralCrystallisation") ? "prefix" : used.includes("OmenofDextralCrystallisation") ? "suffix" : null;
  const full = !room(item, side);
  if (full && omenSide && omenSide !== side) return skip(item, "足す側が埋まっているので、お告げの側からは消せない");
  const removeSides = omenSide ? [omenSide] : full ? [side] : SIDES;
  const r = allMods(item).length ? removeOne(item, rng, removeSides) : null;
  if (allMods(item).length && !r) return skip(item, "外せる MOD が無い");
  const rest = r?.item ?? item;
  if (!room(rest, side)) return skip(item, "足す側に空きが無い");
  if (clash(rest)) return skip(item, "同じ系統の MOD が付いている");
  return { applied: true, item: withMod(rest, sm), added: [sm], removed: r ? [r.mod] : [] };
}

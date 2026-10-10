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
import { allMods, listOf, makeStageMod, rareLimitOf, removeOne, room, SIDES, skip, takenCraftedFamilies, withMod } from "./stage-core";
import { essenceClash } from "../mods/mod-rules";
import { ESSENCE_KEYS } from "../htc/essence-key-table";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { tr } from "../../i18n/lang";

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

/**
 * エッセンスの段は、ゲームでは普通の MOD の段そのもの (EssenceMods → Mods: 肉体のグレーターエッセンスのアミュレット = IncreasedLife7
 * = Rotund、85〜99、ライフ 9 段の上から 3 番目)。ティアの数え方と段の名前を普通の MOD の系統で出す (2026-10-06 POE2Tube 要望 ㉝ の 4。
 * 前はエッセンスの 3 段で数えて「T1」、名前も Greater Essence of the Body)。同じ系統・同じ側で MOD レベルと値の幅が同じ段を探す。無ければそのまま
 */
/** エッセンスの MOD の段の名前を、普通の MOD の段で数え直す (エッセンスの 3 段で数えると T1 になる。要望 ㉝-4) */
export function normalTierOf(data: PatchData, item: StageItem, mod: Mod, tier: Mod["tiers"][number]): { tierName: string; affix: string } | {} {
  const pool = item.cls.pools.normal;
  const r0 = tier.ranges[0];
  for (const id of mod.type === "prefix" ? pool.prefixes : pool.suffixes) {
    const m = data.mods.get(id);
    if (!m || m.source !== "normal" || m.family !== mod.family) continue;
    const i = m.tiers.findIndex((t) => t.ilvl === tier.ilvl && String(t.ranges[0]) === String(r0));
    if (i >= 0) return { tierName: `T${m.tiers.length - i}`, affix: String(m.tiers[i]!.name ?? "") };
  }
  return {};
}

/**
 * 無限のエッセンス: 筋力・器用さ・知性のどれかが付く (poe2db はどの部位にも 3 つ並べている。2026-10-09)。
 * 同じ強さ (レッサー / 普通 / グレーター) の 3 つの鍵から、付いていない系統を等しく引く。それ以外のエッセンスは鍵の MOD そのまま
 */
export const isInfiniteEssence = (key: string): boolean => / of the Infinite$/.test(ESSENCE_KEYS[key]?.en ?? "");
function pickInfinite(data: PatchData, item: StageItem, key: string, rng: () => number): { level: string; mod: Mod; side: StageSide } | null {
  const level = /^essence:([a-z]+):/.exec(key)?.[1];
  const en = ESSENCE_KEYS[key]?.en;
  const taken = takenCraftedFamilies(data, item);
  const list = essenceMods(data, item).filter((x) => ESSENCE_KEYS[`essence:${level}:${x.mod.id}`]?.en === en && !essenceClash(x.mod, taken));
  if (!level || !list.length) return null;
  return { level, ...list[Math.floor(rng() * list.length)]! };
}

export function applyEssence(data: PatchData, item: StageItem, key: string, rng: () => number, used: readonly string[]): StageApply {
  const t = isInfiniteEssence(key) ? pickInfinite(data, item, key, rng) ?? essenceTarget(data, item, key) : essenceTarget(data, item, key);
  if (!t) return skip(item, tr("このベースには使えないエッセンス", "This Essence can't be used on this base"));
  const { mod, side, level } = t;
  // 段: 普通のエッセンスは段の名前 (Lesser / Greater / 無印) で選ぶ。パーフェクトは 1 段
  const tierIndex = level === "perfect" ? 0 : mod.tiers.findIndex((x) => essenceLevelOf(String(x.name ?? "")) === level);
  const tier = mod.tiers[tierIndex];
  if (!tier) return skip(item, tr("このエッセンスのティアが無い", "No tier for this Essence"));
  // アイテムレベルの制限は無い。MOD の要求レベルが高ければアイテムの要求レベルを上書きする (poe2wiki Essence、POE2Tube 要望 ㉞-4。
  // 前はアイテムレベル不足で打てなくしていた)。要求レベルは stage-bases.ts の reqOfItem
  // クラフト MOD は 1 つまで、アストリッドの創造性をはめていれば 2 つ (2026-10-03: 前はアストリッドを見ていなかった)
  const limit = craftedLimitOf(item);
  if (allMods(item).filter((m) => m.crafted).length >= limit) return skip(item, limit > 1 ? tr("クラフト MOD はアストリッドの創造性込みで 2 つまで", "Max 2 crafted mods (with Astrid's Creativity)") : tr("エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で 2 つ)", "Only 1 Essence mod per item (2 with Astrid's Creativity)"));
  const clash = (it: StageItem) => essenceClash(mod, takenCraftedFamilies(data, it));
  const sm = { ...makeStageMod(mod, side, tierIndex, rng), ...normalTierOf(data, item, mod, tier), crafted: true };

  if (level !== "perfect") {
    if (item.rarity !== "magic") return skip(item, tr("マジックのアイテムにだけ使える (レアにはパーフェクト)", "Magic items only (use a Perfect Essence on Rares)"));
    if (listOf(item, side).length >= rareLimitOf(item, side)) return skip(item, tr("足す側に空きが無い", "No open slot on that side"));
    if (clash(item)) return skip(item, tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item"));
    return { applied: true, item: withMod({ ...item, rarity: "rare" }, sm), added: [sm], removed: [] };
  }

  if (item.rarity !== "rare") return skip(item, tr("レアのアイテムにだけ使える", "Rare items only"));
  if (mod.family === ABYSS_FAMILY) return applyAbyss(item, sm, rng, used);
  // 結晶化のお告げ: 消す側。足す側が埋まっていれば、その側から消すしかない
  const omenSide: StageSide | null = used.includes("OmenofSinistralCrystallisation") ? "prefix" : used.includes("OmenofDextralCrystallisation") ? "suffix" : null;
  const full = !room(item, side);
  if (full && omenSide && omenSide !== side) return skip(item, tr("足す側が埋まっているので、お告げの側からは消せない", "The Essence's side is full, so it can't remove from the Omen's side"));
  const removeSides = omenSide ? [omenSide] : full ? [side] : SIDES;
  const r = allMods(item).length ? removeOne(item, rng, removeSides) : null;
  if (allMods(item).length && !r) return skip(item, tr("外せる MOD が無い", "No mod can be removed"));
  const rest = r?.item ?? item;
  if (!room(rest, side)) return skip(item, tr("足す側に空きが無い", "No open slot on that side"));
  if (clash(rest)) return skip(item, tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item"));
  return { applied: true, item: withMod(rest, sm), added: [sm], removed: r ? [r.mod] : [] };
}

/** 深淵のエッセンスの MOD の系統 (深淵の王の印) */
export const ABYSS_FAMILY = "EssenceAbyss";
/** 持てるクラフト MOD の数 (アストリッドの創造性で +1) */
export const craftedLimitOf = (item: StageItem): number => 1 + ((item.augments ?? []).some((a) => a.en === "Astrid's Creativity") ? 1 : 0);

/**
 * 深淵のエッセンス (2026-10-03、SaVeQ 0.5.5 / poe2fun): 固定済み以外から 1 つ消し (結晶化のお告げで側を指せる)、消した側に「深淵の王の印」。
 * 印はクライアントでは両側にある (EssenceAbyssPrefix / Suffix。計算機のデータはプレだけ) ので、消した側に付ける。消す物が無ければ空いている側
 * (お告げの側を先)。冒涜の MOD がある間は打てない (先にエッセンス・合金で上書きする。計算機と同じ決まり)。次の骨は印を置き換える
 */
function applyAbyss(item: StageItem, sm: StageMod, rng: () => number, used: readonly string[]): StageApply {
  if (allMods(item).some((m) => m.desecrated)) return skip(item, tr("冒涜の MOD がある間は使えない (先にエッセンス・合金で上書き)", "Can't be used while a Desecrated mod is present (overwrite it first with an Essence or Alloy)"));
  if (allMods(item).some((m) => m.abyssMark)) return skip(item, tr("印はもう付いている", "Already has a Mark"));
  const omenSide: StageSide | null = used.includes("OmenofSinistralCrystallisation") ? "prefix" : used.includes("OmenofDextralCrystallisation") ? "suffix" : null;
  const r = removeOne(item, rng, omenSide ? [omenSide] : SIDES);
  if (omenSide && !r && !room(item, omenSide)) return skip(item, tr("お告げの側に外せる MOD も空きも無い", "No removable mod or open slot on the Omen's side"));
  const rest = r?.item ?? item;
  const side: StageSide | undefined = r ? r.mod.side : omenSide ?? SIDES.find((x) => room(rest, x));
  if (!side) return skip(item, tr("外せる MOD も空きも無い", "No removable mod or open slot"));
  const mark: StageMod = { ...sm, side, abyssMark: true };
  return { applied: true, item: withMod(rest, mark), added: [mark], removed: r ? [r.mod] : [] };
}

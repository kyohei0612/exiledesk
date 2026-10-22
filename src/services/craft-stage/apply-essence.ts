/**
 * クラフトステージ: エッセンス (2026-09-27、ADR-001)。打つ処理は 2026-10-16 から spec/essence-specs.ts (ADR-004)。ここに残るのは付く MOD の選び方など共通の物
 *
 * 規則はエンジン (probability.ts の essenceForcedProbability / perfectEssenceProbability、plan.ts) と計算機の sim と同じ:
 *   - 普通のエッセンス (レッサー / 普通 / グレーター): **マジック**にだけ。レアにして、その MOD を足す (付いている MOD は残る)
 *   - パーフェクト (とブリーチ): **レア**にだけ。固定済み以外から 1 つ消して、その MOD を足す。左右の結晶化のお告げで消す側を絞れる。
 *     足す側が埋まっている時は、その側から消す (お告げで反対側を指した時は打てない)
 *   - エッセンスの MOD はアイテムに 1 つまで (isEssenceMod)。系統が付いていれば打てない
 * キーは essence:<lesser|normal|greater|perfect>:<MOD の id>、ブリーチは essence:breach (指輪・アミュレットの品質の最大値の MOD)。
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { BREACH_FAMILY } from "../htc/omens";
import { runeEffectPct, SIDES, takenCraftedFamilies } from "./stage-core";
import { boostedPlus } from "../../vendor/poe2htc/engine/runes";
import { essenceClash, hasRawFamily, sharesRawFamily } from "../mods/mod-rules";
import { ESSENCE_KEYS } from "../htc/essence-key-table";
import type { StageItem, StageSide } from "./types";

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
    const hit = list.find((x) => hasRawFamily(x.mod, BREACH_FAMILY));
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
    if (!m || m.source !== "normal" || !sharesRawFamily(m, mod)) continue;
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
export function pickInfinite(data: PatchData, item: StageItem, key: string, rng: () => number): { level: string; mod: Mod; side: StageSide } | null {
  const level = /^essence:([a-z]+):/.exec(key)?.[1];
  const en = ESSENCE_KEYS[key]?.en;
  const taken = takenCraftedFamilies(data, item);
  const list = essenceMods(data, item).filter((x) => ESSENCE_KEYS[`essence:${level}:${x.mod.id}`]?.en === en && !essenceClash(x.mod, taken));
  if (!level || !list.length) return null;
  return { level, ...list[Math.floor(rng() * list.length)]! };
}


/** 深淵のエッセンスの MOD の系統 (アビサルロードの紋章) */
export const ABYSS_FAMILY = "EssenceAbyss";
/** 持てるクラフト MOD の数 (アストリッドの創造性で +1) */
/** クラフト MOD の上限: 1 + アストリッドの創造性 (ソケットの効果 100% 以上で +2。stage-core の runeEffectPct・engine の boostedPlus) */
export const craftedLimitOf = (item: StageItem): number => 1 + (item.augments ?? []).filter((a) => a.en === "Astrid's Creativity").reduce((n) => n + boostedPlus(1, runeEffectPct(item)), 0);


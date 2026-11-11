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
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { allMods, runeEffectPct, SIDES, takenFamilies } from "./stage-core";
import { familiesOf } from "../../vendor/poe2htc/engine/pool";
import { isCraftedSource } from "./tier-rank";
import { boostedPlus } from "../../vendor/poe2htc/engine/runes";
import { familyBlocked, hasFamily, sharesFamily } from "../mods/mod-rules";
import { ESSENCE_KEYS } from "../htc/essence-key-table";
import { essenceKey, parseKey, type EssenceTier } from "./key";
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
  const k = parseKey(key); // 鍵の読みは key.ts の parseKey 1 か所
  if (k.type === "essence" && k.breach) {
    const hit = list.find((x) => hasFamily(x.mod, BREACH_FAMILY));
    return hit ? { level: "perfect", ...hit } : null;
  }
  if (k.type !== "essence" || !k.tier || !k.modId) return null;
  const hit = list.find((x) => x.mod.id === k.modId);
  return hit ? { level: k.tier, ...hit } : null;
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
    if (!m || m.source !== "normal" || !sharesFamily(m, mod)) continue;
    const i = m.tiers.findIndex((t) => t.ilvl === tier.ilvl && String(t.ranges[0]) === String(r0));
    if (i >= 0) return { tierName: `T${m.tiers.length - i}`, affix: String(m.tiers[i]!.name ?? "") };
  }
  return {};
}

/** 品質の上限を上げる MOD か (ブリーチのエッセンスの「品質の最大値 +20%」= LocalMaximumQuality の系統、E-71)。木の狙い・品質の上限の見せ方が同じ物 */
export const isQualityCapMod = (data: PatchData, modId: string): boolean => { const m = data.mods.get(modId); return !!m && hasFamily(m, BREACH_FAMILY); };
/**
 * エッセンスの MOD のその段を付けるエッセンスの棚の鍵 (essence:<レッサー / 普通 / グレーター>:<MOD の id>)。段の名前から強さを読むのは essenceLevelOf
 * (11-07 jin-base4、シミュ部長の頼み: 木の sim-greater.ts の essenceKeyFor の写し)。パーフェクトは段の名前に出ないので返さない (前の写しと同じ)
 */
export const essenceKeyForTier = (data: PatchData, modId: string, tierIndex: number): string =>
  essenceKey(essenceLevelOf(String(data.mods.get(modId)?.tiers[tierIndex]?.name ?? "")) as EssenceTier, modId);
/** 鍵の段 (essence:<段>:<MOD の id> の段。ブリーチ・形の違う鍵は undefined) */
const essenceTierOf = (key: string): string | undefined => { const k = parseKey(key); return k.type === "essence" && k.modId ? k.tier ?? undefined : undefined; };
/** 無限のエッセンスで付きうる MOD (付いていない系統のうち、同じ強さで同じ名前のエッセンスの物)。pickInfinite はここから等しく 1 つ (engine-sim の行き先の一覧も同じ一覧で枝を分ける) */
export function infiniteChoices(data: PatchData, item: StageItem, key: string): Array<{ mod: Mod; side: StageSide }> { // E-50
  const level = essenceTierOf(key);
  const en = ESSENCE_KEYS[key]?.en;
  const taken = takenFamilies(data, item);
  return essenceMods(data, item).filter((x) => ESSENCE_KEYS[essenceKey(level as EssenceTier, x.mod.id)]?.en === en && !familyBlocked(x.mod, taken));
}
/**
 * 無限のエッセンス: 筋力・器用さ・知性のどれかが付く (poe2db はどの部位にも 3 つ並べている。2026-10-09)。
 * 同じ強さ (レッサー / 普通 / グレーター) の 3 つの鍵から、付いていない系統を等しく引く。それ以外のエッセンスは鍵の MOD そのまま
 */
export const isInfiniteEssence = (key: string): boolean => / of the Infinite$/.test(ESSENCE_KEYS[key]?.en ?? "");
export function pickInfinite(data: PatchData, item: StageItem, key: string, rng: () => number): { level: string; mod: Mod; side: StageSide } | null {
  const level = essenceTierOf(key);
  const list = infiniteChoices(data, item, key);
  if (!level || !list.length) return null;
  return { level, ...list[Math.floor(rng() * list.length)]! };
}

/** エッセンスの段の番号: 普通のエッセンスは段の名前 (Lesser / Greater / 無印) で選ぶ。パーフェクト・合金は 1 段 (prepareEssence・resolveEssence も同じ物) */
export const essenceTierIndex = (level: string, mod: { tiers: ReadonlyArray<{ name?: unknown }> }): number =>
  level === "perfect" ? 0 : mod.tiers.findIndex((x) => essenceLevelOf(String(x.name ?? "")) === level);
/** 鍵のエッセンス / 合金で付く MOD とその段の MOD レベル (このベースに無い・段が無い時は null) */
function essenceAim(data: PatchData, item: StageItem, key: string): { mod: Mod; level: number } | null {
  const t = essenceTarget(data, item, key);
  const tier = t ? t.mod.tiers[essenceTierIndex(t.level, t.mod)] : undefined;
  return t && tier ? { mod: t.mod, level: tier.ilvl } : null;
}
/** 段の比べ (E-56): 付く = 同じ系統が無い、飛ばす = 系統が全部、同格以上 (MOD レベルが同じか上) の普通の MOD で埋まっている、塞がる = それ以外で被る */
export type EssenceTierVerdict = "lands" | "skip" | "blocked";
/**
 * この品にこのエッセンス / 合金を打つと、前の手で付いた同じ系統の普通の MOD の段から「付く / 飛ばす / 塞がる」(E-56、11-08 オーナー「他OK」)。
 * 普通の MOD = クラフト MOD (エッセンス・合金) 以外。2 系統の MOD は片方でも低い段・クラフト MOD・タグ (E-11i) で被れば塞がる、片方だけ被っても塞がる。
 * 無限のエッセンスは付いていない能力値が残れば付く、無ければ塞がる (段は比べない、E-50)。このベースに無い・段が無い鍵は null (打てるかは useReason)。
 * 打てるか (クラフト MOD の数・結晶化のお告げの側など) はここで見ない。「付く」でも打てない事はある。
 * families = 付いている MOD と当たった系統 (付く時は空。11-08 シミュ部長 back7 の頼み)
 */
export function essenceTierVerdict(data: PatchData, item: StageItem, key: string): { verdict: EssenceTierVerdict; families: string[] } | null {
  if (isInfiniteEssence(key)) return essenceTarget(data, item, key) ? { verdict: infiniteChoices(data, item, key).length ? "lands" : "blocked", families: [] } : null;
  const aim = essenceAim(data, item, key);
  if (!aim) return null;
  if (!familyBlocked(aim.mod, takenFamilies(data, item))) return { verdict: "lands", families: [] };
  // 系統は 1 品に 1 つ (E-11a) なので、系統ごとに埋めている MOD は多くて 1 つ。全部が同格以上の普通の MOD なら飛ばす
  const held = allMods(item).flatMap((m) => { const md = data.mods.get(m.modId); return md ? [{ m, md }] : []; });
  const hit = familiesOf(aim.mod).filter((f) => held.some(({ md }) => familiesOf(md).includes(f)));
  const high = (f: string) => held.some(({ m, md }) => familiesOf(md).includes(f) && !isCraftedSource(md.source) && m.modLevel >= aim.level);
  return { verdict: familiesOf(aim.mod).every(high) ? "skip" : "blocked", families: hit };
}
/**
 * このアイテムクラス・アイテムレベルで、エッセンス / 合金の系統が普通の MOD (一般 MOD の置き場、E-10a) に付きうる段の数 (E-56)。
 * lower = エッセンスの段より MOD レベルが低い段 (付いていれば塞がる)、atOrAbove = 同格以上 (付いていれば飛ばす)。アイテムレベルを超える段は数えない (E-11b)。
 * シミュが塞がる枝を作るかは lower > 0 で見る。このベースに無い・段が無い鍵・無限のエッセンスは null
 */
export function essenceFamilyNormalTiers(data: PatchData, item: StageItem, key: string): { lower: number; atOrAbove: number } | null {
  if (isInfiniteEssence(key)) return null;
  const aim = essenceAim(data, item, key);
  if (!aim) return null;
  const pool = item.cls.pools.normal;
  const out = { lower: 0, atOrAbove: 0 };
  for (const id of [...pool.prefixes, ...pool.suffixes]) {
    const m = data.mods.get(id);
    if (!m || isCraftedSource(m.source) || !sharesFamily(m, aim.mod)) continue;
    for (const t of m.tiers) if (t.ilvl <= item.itemLevel) out[t.ilvl >= aim.level ? "atOrAbove" : "lower"]++;
  }
  return out;
}


/** アストリッドの創造性 (クラフト MOD の上限を増やすルーン、E-11h) の英名 */
export const ASTRID_EN = "Astrid's Creativity";
/** 深淵のエッセンスの MOD の系統 (アビサルロードの紋章) */
export const ABYSS_FAMILY = "EssenceAbyss";
/** 持てるクラフト MOD の数 (アストリッドの創造性で +1) */
/** クラフト MOD の上限: 1 + アストリッドの創造性 (ソケットの効果 100% 以上で +2。stage-core の runeEffectPct・engine の boostedPlus) */
export const craftedLimitOf = (item: StageItem): number => // E-11h クラフト MOD は 1 つ (アストリッドの創造性で +1)
  1 + (item.augments ?? []).filter((a) => a.en === ASTRID_EN).reduce((n) => n + boostedPlus(1, runeEffectPct(item)), 0);
/**
 * クラフト MOD を n 個持つのに要るアストリッドの創造性の本数 (craftedLimitOf の逆。1 本で増える数はその品のソケットの効果で決まる)。
 * 無理なら Infinity (11-07 jin-base4)
 */
export const astridsFor = (item: StageItem, n: number): number => {
  const per = boostedPlus(1, runeEffectPct(item));
  return n <= 1 ? 0 : per > 0 ? Math.ceil((n - 1) / per) : Infinity;
};


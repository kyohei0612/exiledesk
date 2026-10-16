/**
 * エッセンスを説明文の分解で書いた物 (2026-10-16、ADR-004 の 4 段目)
 *
 * クライアントの説明文は 2 つだけ (currency-hover-*.json、tests/currency-spec-essence.test.ts が全部のエッセンスで確かめる):
 *   - レッサー / 普通 / グレーター「Upgrades a Magic item to a Rare item, adding a guaranteed modifier」= レアにする + 保証の MOD
 *   - パーフェクト・特別な物 (ヒステリー・ブリーチ・深淵 …)「Removes a random modifier and augments a Rare item with a new guaranteed modifier」
 *     = 消す + 保証の MOD (ADR-004 の決めたこと 2: 付ける側が埋まっている時はその側から消す、2026-10-14 オーナーがゲームで確認)
 * 付く MOD (どの部位に何が付くか) はエンジンのエッセンスの置き場 (item.cls.pools.essence = クライアントの EssenceMods) から引く。
 * 深淵のエッセンスだけ、付くのが「深淵の王の印」(消した側に付く、次の骨が置き換える)。説明文は同じ。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { essenceLevelOf } from "../../../vendor/poe2htc/optimizer/cost";
import { essenceClash } from "../../mods/mod-rules";
import { ESSENCE_KEYS } from "../../htc/essence-key-table";
import { ABYSS_FAMILY, essenceTarget, isInfiniteEssence, normalTierOf, pickInfinite } from "../apply-essence";
import { makeStageMod, takenCraftedFamilies } from "../stage-core";
import type { StageItem, StageMod, StageSide } from "../types";
import type { CurrencySpec, OmenSpec, Source, Words } from "./types";
import { tr } from "../../../i18n/lang";

const UPGRADE_TEXT = {
  en: ["Upgrades a [ItemRarity|Magic] item to a [ItemRarity|Rare] item, adding a guaranteed modifier"],
  ja: ["[ItemRarity|マジック]アイテムを、保証されたモッドを1個含む[ItemRarity|レア]アイテムにアップグレードする。"],
};
const PERFECT_TEXT = {
  en: ["Removes a random modifier and augments a [ItemRarity|Rare] item with a new guaranteed modifier"],
  ja: ["[ItemRarity|レア]アイテムからランダムなモッドを1個取り除き、新しい保証されたモッドを1個追加する。"],
};
const ESSENCE_SOURCE: Source = {
  client: "currency-hover の説明文、EssenceMods (エンジンのエッセンスの置き場)、用語集 Crafted (クラフト MOD は 1 つ)",
  owner: "アイテムレベルの制限は無い (poe2wiki Essence、要望 ㉞-4)・クラフト MOD どうしの系統はぶつかる (2026-10-11)",
};

/** レッサー / 普通 / グレーター */
export const ESSENCE_SPEC: CurrencySpec = {
  key: "essence:upgrade",
  stageKey: "essence:",
  kind: "essence",
  text: UPGRADE_TEXT,
  target: { rarity: ["magic"], rarityReason: { ja: "マジックのアイテムにだけ使える (レアにはパーフェクト)", en: "Magic items only (use a Perfect Essence on Rares)" } },
  actions: [{ setRarity: "rare" }, { addEssence: { side: "ofMod" } }],
  limits: [{ kind: "craftedSlot" }],
  source: ESSENCE_SOURCE,
};
/** パーフェクト・ブリーチ・ヒステリーなど (深淵を除く) */
export const PERFECT_ESSENCE_SPEC: CurrencySpec = {
  key: "essence:perfect",
  stageKey: "essence:perfect:",
  kind: "essence_perfect",
  text: PERFECT_TEXT,
  target: { rarity: ["rare"] },
  // MOD が 0 のレアは消さずに付ける。付ける側が埋まっていればその側から消す
  actions: [{ remove: { n: 1, pick: "equal", ifAny: true, sideWhenFull: true } }, { addEssence: { side: "ofMod" } }],
  limits: [{ kind: "craftedSlot" }],
  source: { ...ESSENCE_SOURCE, coe: "付ける側が埋まっている時はその側から消す (package.js の poe2_perfect_essence)" },
};
/** 深淵のエッセンス: 消した側に深淵の王の印。消せる物が無ければお告げの側か空いている側 (2026-10-03 SaVeQ 0.5.5 / poe2fun) */
export const ABYSS_ESSENCE_SPEC: CurrencySpec = {
  key: "essenceoftheabyss",
  stageKey: "essence:perfect:",
  kind: "essence_perfect",
  text: PERFECT_TEXT,
  target: { rarity: ["rare"] },
  actions: [{ remove: { n: 1, pick: "equal", optional: true } }, { addEssence: { side: "removedSide" } }],
  limits: [{ kind: "craftedSlot" }, { kind: "noDesecrated" }, { kind: "noAbyssMark" }],
  source: { ...ESSENCE_SOURCE, community: "印は消した側に付く・冒涜の MOD がある間は使えない (SaVeQ 0.5.5 / poe2fun、計算機と同じ。外の正解は無い)" },
};
/**
 * 合金 (Adaptive Alloy など 13 種): 英語の説明文はパーフェクトエッセンスと同じ、日本語は別の文。
 * 結晶化のお告げの説明文は「Perfect or Corrupted Essence」だが、合金にも掛かってお告げが減る (2026-10-16 オーナーがゲームで確認「減るね」)
 * → パーフェクトエッセンスと同じ手の種類 (essence_perfect) にする
 */
export const ALLOY_SPEC: CurrencySpec = {
  ...PERFECT_ESSENCE_SPEC,
  key: "alloy",
  kind: "essence_perfect",
  text: { en: PERFECT_TEXT.en, ja: ["ランダムなモッドを1個取り除き、[Rarity|レア]アイテムに確定で新しいモッドを追加する"] },
};
export const ESSENCE_SPECS: readonly CurrencySpec[] = [ESSENCE_SPEC, PERFECT_ESSENCE_SPEC, ABYSS_ESSENCE_SPEC, ALLOY_SPEC];
/** 合金か (クライアントの名前の「Alloy」。エッセンスの鍵の表に一緒に入っている) */
export const isAlloyKey = (key: string): boolean => / Alloy$/.test(ESSENCE_KEYS[key]?.en ?? "");

/** 手順の鍵 (essence:<段>:<MOD の id> / essence:breach) → 段 (アイテムを見ない) */
export function essenceLevelOfKey(key: string): string | null {
  if (key === "essence:breach") return "perfect";
  return /^essence:(lesser|normal|greater|perfect):/.exec(key)?.[1] ?? null;
}

export interface EssenceResolved { spec: CurrencySpec; reason?: string }
/**
 * 手順の鍵 → どの説明文のエッセンスか。このベースに付く MOD が無い・段が無い時は reason (今の関数と同じ文)。
 * 深淵かどうかは付く MOD の系統で見る (説明文は同じ)
 */
export function resolveEssence(data: PatchData, item: StageItem, key: string): EssenceResolved | null {
  const level = essenceLevelOfKey(key);
  if (!level) return null;
  const spec = level !== "perfect" ? ESSENCE_SPEC : isAlloyKey(key) ? ALLOY_SPEC : PERFECT_ESSENCE_SPEC;
  const t = essenceTarget(data, item, key);
  if (!t) return { spec, reason: tr("このベースには使えないエッセンス", "This Essence can't be used on this base") };
  if (tierIndexOf(t.level, t.mod) < 0) return { spec, reason: tr("このエッセンスのティアが無い", "No tier for this Essence") };
  return { spec: t.mod.family === ABYSS_FAMILY ? ABYSS_ESSENCE_SPEC : spec };
}
/** 段: 普通のエッセンスは段の名前 (Lesser / Greater / 無印) で選ぶ。パーフェクトは 1 段 */
const tierIndexOf = (level: string, mod: { tiers: ReadonlyArray<{ name?: unknown }> }): number =>
  level === "perfect" ? 0 : mod.tiers.findIndex((x) => essenceLevelOf(String(x.name ?? "")) === level);

/**
 * 付く MOD を作る (打つ直前。乱数は今の関数と同じ順: 無限のエッセンスの能力値 → 値)。
 * 無限のエッセンス: 筋力・器用さ・知性のどれか (付いていない系統から等しく。2026-10-09 オーナーがゲームの説明で確認)
 */
export function prepareEssence(data: PatchData, item: StageItem, key: string, rng: () => number): { mod: StageMod; side: StageSide; clash: (it: StageItem) => boolean } | null {
  const t = isInfiniteEssence(key) ? pickInfinite(data, item, key, rng) ?? essenceTarget(data, item, key) : essenceTarget(data, item, key);
  if (!t) return null;
  const i = tierIndexOf(t.level, t.mod);
  const tier = t.mod.tiers[i];
  if (!tier) return null;
  const mod: StageMod = { ...makeStageMod(t.mod, t.side, i, rng), ...normalTierOf(data, item, t.mod, tier), crafted: true };
  return { mod, side: t.side, clash: (it) => essenceClash(t.mod, takenCraftedFamilies(data, it)) };
}

const crystal = (key: string, hover: string, side: "prefix" | "suffix", word: Words): OmenSpec => ({
  key, hover, appliesTo: "essence_perfect",
  text: {
    en: ["While this item is active in your inventory your next", `Perfect or Corrupted Essence will remove only ${word.en} modifiers`],
    ja: ["インベントリ内でアクティブ状態の時", `次回使用するパーフェクトまたはコラプトエッセンスは${word.ja}モッドだけを取り除く`],
  },
  effect: { removeSide: side },
  source: { client: "currency-hover の説明文", owner: "付ける側が埋まっていて反対側を指すと打てない (2026-10-10、CoE も同じ)" },
});
export const ESSENCE_OMEN_SPECS: readonly OmenSpec[] = [
  crystal("OmenofSinistralCrystallisation", "omenofsinistralcrystallisation", "prefix", { en: "Prefix", ja: "プレフィックス" }),
  crystal("OmenofDextralCrystallisation", "omenofdextralcrystallisation", "suffix", { en: "Suffix", ja: "サフィックス" }),
];

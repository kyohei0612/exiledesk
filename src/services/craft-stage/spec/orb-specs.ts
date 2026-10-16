/**
 * オーブ類 (変成・増強・王者・錬金・高貴・カオス・神・フラクチャー) を説明文の分解で書いた物 (2026-10-16、ADR-004 の 3 段目)
 *
 * 説明文はクライアントの currency-hover-*.json の写し (tests/currency-spec-orbs.test.ts が同じか確かめる)。
 * 上級・完全は説明文が同じで、段の下限 (用語集 BetterCurrencyMinimumLevel、poe2db の Minimum Modifier Level) だけ違う。
 * 「消す」と「付ける」は別の部品 (ADR-004 の決めたこと 2): カオス = 消す + 付ける。消した側と関係なく空いている側に付く。
 * 消去 (annul) は冒涜まわりと一緒に desecrate-specs.ts に置いてある。
 */
import { CURRENCY_FLOOR } from "../../../vendor/poe2htc/engine/types";
import type { CurrencySpec, Limit, OmenSpec, Source } from "./types";

type Strength = "base" | "greater" | "perfect";
const STRENGTHS: readonly Strength[] = ["base", "greater", "perfect"];
/** カオスの段の下限 (poe2db の Minimum Modifier Level、2026-10-14 確認。エンジンの CURRENCY_FLOOR には無い) */
const CHAOS_FLOOR: Record<Strength, number> = { base: 0, greater: 35, perfect: 50 };
const floorOf = (kind: string, s: Strength): number =>
  kind === "chaos" ? CHAOS_FLOOR[s] : (CURRENCY_FLOOR as Record<string, Record<Strength, number>>)[kind]?.[s] ?? 0;

/** 手順の鍵 (price-keys.json): transmute / transmute_greater / transmute_perfect */
const stageKeyOf = (kind: string, s: Strength): string => (s === "base" ? kind : `${kind}_${s}`);
/** クライアントの鍵: orboftransmutation / greaterorboftransmutation / perfectorboftransmutation */
const hoverOf = (name: string, s: Strength): string => (s === "base" ? name : `${s}${name}`);
/** 段の下限があれば「アイテムレベルが下限未満には使えない」(用語集 BetterCurrencyMinimumLevel) */
const floorLimits = (floor: number): Limit[] => (floor > 0 ? [{ kind: "itemLevelAtLeast", level: floor }] : []);

const ORB_SOURCE: Source = {
  client: "currency-hover の説明文、用語集 BetterCurrencyMinimumLevel・ItemRarity",
  poe2db: "段の下限 (Minimum Modifier Level、2026-10-14)",
};

interface OrbDef {
  kind: string;
  /** クライアントの鍵 (強さの頭を除いた物) */
  name: string;
  strengths: readonly Strength[];
  text: { en: string[]; ja: string[] };
  /** 強さの段の下限を受け取って、対象・動作・制約 */
  build: (floor: number) => Pick<CurrencySpec, "target" | "actions" | "limits"> & { source?: Source };
}

const ORBS: readonly OrbDef[] = [
  {
    kind: "transmute", name: "orboftransmutation", strengths: STRENGTHS,
    text: { en: ["Upgrades a [ItemRarity|Normal] item to a [ItemRarity|Magic] item with 1 modifier"], ja: ["[ItemRarity|ノーマル]アイテムをモッドを1個持つ[ItemRarity|マジック]アイテムにアップグレードする。"] },
    // マジックの枠が 0 のベース (不在のアミュレット = プレ -1 / サフィ -1) は MOD 無しのマジックになる (ゲームで確認、要望 19c7d2de)
    build: (floor) => ({
      target: { rarity: ["normal"] },
      actions: [{ setRarity: "magic" }, { add: { n: 1, floor, emptyOk: true } }],
      limits: floorLimits(floor),
      source: { ...ORB_SOURCE, owner: "枠が 0 のマジックは MOD 無しのマジック (要望 19c7d2de、ゲームで確認)" },
    }),
  },
  {
    kind: "augment", name: "orbofaugmentation", strengths: STRENGTHS,
    text: { en: ["Augments a [ItemRarity|Magic] item with a new random modifier"], ja: ["[ItemRarity|マジック]アイテムを1個の新しいランダムなモッドで強化する。"] },
    build: (floor) => ({
      target: { rarity: ["magic"] },
      actions: [{ add: { n: 1, floor } }],
      limits: [...floorLimits(floor), { kind: "openSlot", reason: { ja: "マジックの枠が埋まっている", en: "No room for another mod on this Magic item" } }],
    }),
  },
  {
    kind: "regal", name: "regalorb", strengths: STRENGTHS,
    text: { en: ["Upgrades a [ItemRarity|Magic] item to a [ItemRarity|Rare] item, adding 1 modifier"], ja: ["[ItemRarity|マジック]アイテムを[ItemRarity|レア]アイテムにアップグレードし、モッドを1個追加する。"] },
    build: (floor) => ({
      target: { rarity: ["magic"] },
      actions: [{ setRarity: "rare" }, { add: { n: 1, floor } }],
      limits: floorLimits(floor),
    }),
  },
  {
    kind: "alchemy", name: "orbofalchemy", strengths: ["base"],
    text: { en: ["Upgrades a [ItemRarity|Normal] or [ItemRarity|Magic] item to a [ItemRarity|Rare] item with 4 random modifiers"], ja: ["[ItemRarity|ノーマル]アイテムまたは[ItemRarity|マジック]アイテムをモッドを4個持つ[ItemRarity|レア]アイテムにアップグレードする。"] },
    // 「with 4 random modifiers」: マジックに使った時は付いている MOD は残らない (0.3.1「the original modifiers are not retained」、POE2Tube 要望 ㉞-1)
    build: (floor) => ({
      target: { rarity: ["normal", "magic"] },
      actions: [{ remove: { n: "all", pick: "equal" } }, { setRarity: "rare" }, { add: { n: 4, floor } }],
      limits: floorLimits(floor),
      source: { ...ORB_SOURCE, community: "マジックの MOD は残らない (0.3.1 パッチノート、要望 ㉞-1)" },
    }),
  },
  {
    kind: "exalt", name: "exaltedorb", strengths: STRENGTHS,
    text: { en: ["Augments a [ItemRarity|Rare] item with a new random modifier"], ja: ["[ItemRarity|レア]アイテムを1個の新しいランダムなモッドで強化する。"] },
    build: (floor) => ({
      target: { rarity: ["rare"] },
      actions: [{ add: { n: 1, floor } }],
      limits: [...floorLimits(floor), { kind: "openSlot" }],
    }),
  },
  {
    kind: "chaos", name: "chaosorb", strengths: STRENGTHS,
    text: { en: ["Removes a random modifier and augments a [ItemRarity|Rare] item with a new random modifier"], ja: ["[ItemRarity|レア]アイテムからランダムなモッドを1個取り除き、ランダムな新しいモッドを1個追加する。"] },
    // 消す + 付ける (ADR-004 の決めたこと 2)。付けるのは消した後に空いている側から重みで、どこにも付かなくても消した分は残る
    build: (floor) => ({
      target: { rarity: ["rare"] },
      actions: [{ remove: { n: 1, pick: "equal", overLimitVoids: true } }, { add: { n: 1, floor, optional: true } }],
      limits: floorLimits(floor),
      source: { ...ORB_SOURCE, owner: "上限を超えている側に当たったら不成立 (2026-10-14 ゲームで確認)・付けるのはプレフィックスとサフィックスの両方から (2026-10-14)" },
    }),
  },
  {
    kind: "divine", name: "divineorb", strengths: ["base"],
    text: { en: ["Randomises the numeric values of modifiers on an item"], ja: ["アイテム上の明示モッドが持つ数値をランダムに変化させる。"] },
    build: () => ({
      target: {},
      actions: [{ reroll: "values" }],
      limits: [],
      source: { client: "currency-hover の説明文、用語集 Fracture (固定は変わらない)", owner: "暗黙の数値も振り直す (2026-10-12)・ユニークも (2026-10-08)" },
    }),
  },
  {
    kind: "fracture", name: "fracturingorb", strengths: ["base"],
    text: { en: ["[Fracture|Fracture] a random modifier on a rare item with at least 4 modifiers, locking it in place."], ja: ["4個以上のモッドを持つレアアイテム上のランダムなモッド1個を[Fracture|フラクチャー]し固定する。"] },
    build: () => ({
      target: { rarity: ["rare"] },
      actions: [{ fracture: true }],
      limits: [{ kind: "fracturableClass" }, { kind: "modsAtLeast", n: 4 }, { kind: "noFractured" }],
      source: { client: "currency-hover の説明文、ItemClasses の CanBeFractured", owner: "固定は 1 つ・冒涜の MOD は選ばれない (2026-10-08・10-10 実測)", coe: "対象から等しく 1 つ (package_poe2.js EmulatorManager.fracture、2026-10-16)" },
    }),
  },
];

export const ORB_SPECS: readonly CurrencySpec[] = ORBS.flatMap((o) => o.strengths.map((s): CurrencySpec => {
  const floor = floorOf(o.kind, s);
  const b = o.build(floor);
  return {
    key: hoverOf(o.name, s),
    stageKey: stageKeyOf(o.kind, s),
    kind: o.kind,
    text: { en: [...o.text.en], ja: [...o.text.ja] },
    target: b.target,
    actions: b.actions,
    limits: b.limits,
    source: b.source ?? ORB_SOURCE,
  };
}));
export const ORB_SPEC_BY_KEY: ReadonlyMap<string, CurrencySpec> = new Map(ORB_SPECS.map((s) => [s.stageKey, s]));

const omenText = (en: string, ja: string): { en: string[]; ja: string[] } => ({
  en: ["While this item is active in your inventory your next", en],
  ja: ["インベントリ内でアクティブ状態の時", ja],
});
const CLIENT: Source = { client: "currency-hover の説明文" };

/** オーブに掛かるお告げ (今のゲームにある物。戴冠・錬金・大いなる消去は相場に無い = REMOVED_OMENS で打てない) */
export const ORB_OMEN_SPECS: readonly OmenSpec[] = [
  { key: "OmenofSinistralExaltation", hover: "omenofsinistralexaltation", appliesTo: "exalt", text: omenText("Exalted Orb will add only prefix modifiers", "次に使用する高貴なオーブはプレフィックスモッドをのみを追加する。"), effect: { side: "prefix" }, source: CLIENT },
  { key: "OmenofDextralExaltation", hover: "omenofdextralexaltation", appliesTo: "exalt", text: omenText("Exalted Orb will add only suffix modifiers", "次に使用する高貴なオーブはサフィックスモッドをのみを追加する。"), effect: { side: "suffix" }, source: CLIENT },
  { key: "OmenofGreaterExaltation", hover: "omenofgreaterexaltation", appliesTo: "exalt", text: omenText("Exalted Orb will add two random modifiers", "次に使用する高貴なオーブはモッドを2個追加する。"), effect: { addCount: 2 }, source: { client: "currency-hover の説明文", owner: "空きが 1 つなら 1 つ", coe: "付かなくなったら止まる (package_poe2.js rollAffixes、2026-10-16)" } },
  {
    key: "OmenofCatalysingExaltation", hover: "omenofcatalysingexaltation", appliesTo: "exalt",
    text: {
      en: ["While this item is active in your inventory your next", "Exalted Orb will consume all [Catalyst] [Quality] to increase", "the chance of the corresponding type of Modifier"],
      ja: ["インベントリ内でアクティブ状態の時", "次回使用する高貴なオーブは[Catalyst|カタリスト]の[Quality|品質]を全て消費し", "対応するモッドを追加する確率を上げる"],
    },
    effect: { catalysing: true },
    limits: [{ kind: "hasCatalystQuality" }],
    source: { client: "currency-hover の説明文", community: "重く引く倍率は catalysing-multiplier.ts (品質から)" },
  },
  { key: "OmenofWhittling", hover: "omenofwhittling", appliesTo: "chaos", text: omenText("Chaos Orb will remove the lowest level modifier", "次に使用する混沌のオーブは最もレベルの低いモッドを取り除く。"), effect: { pickLowest: true }, source: { client: "currency-hover の説明文", poe2wiki: "未発現の枠は MOD レベル 1 (0.3.1、要望 ㉞-6)", coe: "同じ MOD レベルが並んだら等しく (package_poe2.js poe2_chaos の OmenOnChaosLowestLevelMod、2026-10-16)" } },
  { key: "OmenofSinistralErasure", hover: "omenofsinistralerasure", appliesTo: "chaos", text: omenText("Chaos Orb will remove only prefix modifiers", "次に使用する混沌のオーブはプレフィックスモッドをのみを取り除く。"), effect: { removeSide: "prefix" }, source: CLIENT },
  { key: "OmenofDextralErasure", hover: "omenofdextralerasure", appliesTo: "chaos", text: omenText("Chaos Orb will remove only suffix modifiers", "次に使用する混沌のオーブはサフィックスモッドをのみを取り除く。"), effect: { removeSide: "suffix" }, source: CLIENT },
  {
    key: "OmenoftheBlessed", hover: "omenoftheblessed", appliesTo: "divine",
    text: { en: ["While this item is active in your inventory your next", "Divine Orb will only reroll Implicit Modifiers"], ja: ["インベントリ内でアクティブ状態の時", "次回使用する神のオーブは暗黙モッドだけをリロールする"] },
    effect: { implicitOnly: true }, source: CLIENT,
  },
];

/** 移していないお告げ (これが掛かった手は今の関数で打つ)。聖別はヴァールの仲間で移さない (ADR-004 の決めたこと 1) */
export const UNPORTED_OMENS: readonly string[] = ["OmenofSanctification"];

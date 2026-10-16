/**
 * 冒涜まわりのカレンシーとお告げを説明文の分解で書いた物 (2026-10-16、ADR-004 の 2 段目)
 *
 * 説明文はクライアントの currency-hover-*.json の写し (tests/currency-spec-parity.test.ts が同じか確かめる。パッチで変わったら落ちる)。
 * 骨は「保存された / 古代の / 噛み切られた / 変質した」× 部位 (顎骨・肋骨・鎖骨・頭蓋骨) で 1 つずつ。
 * 手順の鍵 (desecrate / desecrate_ancient …) は部位を持たないので、アイテムの部位に合う物を対象から選ぶ ([[run-spec.ts]] の resolveSpec)。
 * 部位の名前は書かない (まとまりは item-classes.ts、クライアントの表)。
 */
import { ANCIENT_BONE_FLOOR } from "../../../vendor/poe2htc/engine/probability";
import { ABYSS_MARK_FLOOR } from "../../htc/omens";
import { GNAWED_MAX_ILVL } from "../stage-core";
import type { Action, CurrencySpec, Limit, ModPool, OmenSpec, Source, Target } from "./types";

/** 深淵の王の印から打つ骨の段の下限 (用語集 MarkofAbyssalLord「a higher tier」。値 33 は poe2fun の 1 件だけ = 仮、2026-10-10 オーナーが仮のまま確定) */
export const MARK_FLOOR = ABYSS_MARK_FLOOR;

/** 骨の部位ごとの説明文と対象 (種類 = 噛み切られた / 保存された / 古代の は同じ文) */
const BONE_PARTS = {
  jawbone: {
    en: ["[Abyssalify|Desecrates] a [ItemRarity|Rare] Weapon or [Quiver]"],
    ja: ["[ItemRarity|レア]の武器または[Quiver|矢筒]を[Abyssalify|冒涜]する"],
    groups: ["weapon", "quiver"],
  },
  rib: {
    en: ["[Abyssalify|Desecrates] a [ItemRarity|Rare] [EquipArmour|Armour]"],
    ja: ["[ItemRarity|レア]の[EquipArmour|防具]を[Abyssalify|冒涜]する"],
    groups: ["armour"],
  },
  collarbone: {
    en: ["[Abyssalify|Desecrates] a [ItemRarity|Rare] Amulet, Ring or Belt"],
    ja: ["[ItemRarity|レア]のアミュレット、指輪またはベルトを[Abyssalify|冒涜]する"],
    groups: ["jewellery"],
  },
  cranium: {
    en: ["[Abyssalify|Desecrates] a [ItemRarity|Rare] [Jewel]"],
    ja: ["[ItemRarity|レア]の[Jewel|ジュエル]を[Abyssalify|冒涜]する"],
    groups: ["jewel"],
  },
} as const;
type BonePart = keyof typeof BONE_PARTS;

/** 骨の種類 → 手順の鍵・段の下限・制約 */
const GRADES = {
  // 噛み切られた骨: アイテムレベル 64 以下だけ。冒涜専用の MOD もアイテムレベルの決まりのまま (2026-10-10 オーナー)
  gnawed: { stageKey: "desecrate_gnawed", floor: 0, exclusiveAnyLevel: false, limits: [{ kind: "itemLevelAtMost", level: GNAWED_MAX_ILVL }, { kind: "oneDesecratedMod" }] as Limit[] },
  preserved: { stageKey: "desecrate", floor: 0, exclusiveAnyLevel: true, limits: [{ kind: "oneDesecratedMod" }] as Limit[] },
  // 古代の骨: 最低 MOD レベル 40 (poe2db)。用語集 BetterCurrencyMinimumLevel でアイテムレベル 40 未満には使えない
  ancient: { stageKey: "desecrate_ancient", floor: ANCIENT_BONE_FLOOR, exclusiveAnyLevel: true, limits: [{ kind: "oneDesecratedMod" }, { kind: "itemLevelAtLeast", level: ANCIENT_BONE_FLOOR }] as Limit[] },
} as const;
type Grade = keyof typeof GRADES;

/** 発現の候補の置き場: 普通の MOD と冒涜専用の MOD (変質した鎖骨は異界の MOD も) */
const BONE_POOLS: ModPool[] = ["normal", "desecrated"];

const BONE_SOURCE: Source = {
  client: "currency-hover (BaseItemTypes の説明文)、用語集 Abyssalify・BetterCurrencyMinimumLevel、AbyssBenchTicketTypes.MaximumItemLevel",
  poe2wiki: "満杯なら同じ側を 1 つ消して付ける (2026-10-14 総点検)",
  owner: "冒涜専用の MOD はアイテムレベルを見ない・噛み切られた骨は見る (2026-10-10)",
};

function bone(grade: Grade, part: BonePart): CurrencySpec {
  const g = GRADES[grade];
  const p = BONE_PARTS[part];
  return {
    key: `${grade}${part}`,
    stageKey: g.stageKey,
    kind: "desecrate",
    text: { en: [...p.en], ja: [...p.ja] },
    target: { rarity: ["rare"], groups: [...p.groups] },
    actions: [{ addUnrevealed: { pools: BONE_POOLS, floor: g.floor, exclusiveAnyLevel: g.exclusiveAnyLevel } }],
    limits: g.limits,
    source: BONE_SOURCE,
  };
}

/** 骨 (クライアントにある物だけ: 頭蓋骨は保存された物だけ、変質した骨は鎖骨だけ。2026-10-11 poe2db とクライアント) */
export const BONE_SPECS: readonly CurrencySpec[] = [
  bone("gnawed", "jawbone"), bone("preserved", "jawbone"), bone("ancient", "jawbone"),
  bone("gnawed", "rib"), bone("preserved", "rib"), bone("ancient", "rib"),
  bone("gnawed", "collarbone"), bone("preserved", "collarbone"), bone("ancient", "collarbone"),
  bone("preserved", "cranium"),
  {
    key: "alteredcollarbone",
    stageKey: "desecrate_altered",
    kind: "desecrate",
    text: {
      en: ["[Abyssalify|Desecrates] a [ItemRarity|Rare] Amulet, Ring or Belt with a", "chance for otherworldly modifiers"],
      ja: ["[ItemRarity|レア]のアミュレット、指輪またはベルトを[Abyssalify|冒涜]し、一定確率で異世界のモッドを付与する。"],
    },
    target: { rarity: ["rare"], groups: ["jewellery"], groupsReason: { ja: "変質した鎖骨はアミュレット・指輪・ベルトだけ", en: "Altered Collarbone: Amulets, Rings and Belts only" } },
    actions: [{ addUnrevealed: { pools: [...BONE_POOLS, "otherworldly"], floor: 0, exclusiveAnyLevel: true } }],
    limits: [{ kind: "oneDesecratedMod" }],
    source: BONE_SOURCE,
  },
];

/**
 * 発現 (魂の井戸)。カレンシーではないが手の 1 つ。候補 3 つ (専用 MOD の個数の割合は Reddit 563 回の実測、engine の DESECRATION_EXCLUSIVE_COUNT)。
 * 腐食のお告げでコラプトした品の未発現も発現できる
 */
export const REVEAL_SPEC: CurrencySpec = {
  key: "keyword:Abyssalify",
  stageKey: "reveal",
  kind: "reveal",
  text: {
    en: ["These modifiers can be revealed at the Well of Souls."],
    ja: ["未発現の冒涜モッドは魂の井戸で発現させることができる。"],
  },
  target: {},
  actions: [{ reveal: { offers: 3 } }],
  limits: [{ kind: "hasUnrevealed" }],
  allowCorrupted: true,
  source: { client: "用語集 Abyssalify", community: "専用 MOD の個数 1 / 2 / 3 = 85.3 / 13.9 / 0.9% (Reddit u/Civil-Bee-f 指輪 563 回、2026-10-09)" },
};

/**
 * 消去のオーブ (光のお告げが掛かるのでここに置く。オーブ類の 3 段目で他と一緒に見直す)。
 * 説明文はレアリティを書いていない。ノーマルは消す物が無いので、今の作りの「マジックかレアだけ」の一言を残す (オーナー確認待ち)
 */
export const ANNUL_SPEC: CurrencySpec = {
  key: "orbofannulment",
  stageKey: "annul",
  kind: "annul",
  text: { en: ["Removes a random modifier from an item"], ja: ["アイテムのモッド1個をランダムに取り除く。"] },
  target: { rarity: ["magic", "rare", "unique"] },
  actions: [{ remove: { n: 1, pick: "equal" } }],
  limits: [],
  source: { client: "currency-hover の説明文", assumed: "ユニークに打てる (CoE はユニークを扱わない)", coe: "ノーマルには打てない (rarity_not_normal)・固定以外から等しく 1 つ (package_poe2.js annul、2026-10-16)" },
};

export const CURRENCY_SPECS: readonly CurrencySpec[] = [...BONE_SPECS, REVEAL_SPEC, ANNUL_SPEC];

/** 勢力のお告げの対象。説明文は「Weapon or Jewellery」、矢筒は Craft of Exile のデータで使える (2026-10-14 総点検 C → B。ゲームで未確認) */
const FACTION_TARGET: Target = {
  groups: ["weapon", "jewellery", "quiver"],
  groupsReason: { ja: "勢力のお告げは武器・宝飾品・矢筒だけ", en: "Faction Omens: weapons, jewellery and quivers only" },
};
const faction = (key: string, hover: string, tag: string, name: { en: string; ja: string }): OmenSpec => ({
  key, hover, appliesTo: "desecrate",
  text: {
    en: ["While this item is active in your inventory your next", `Weapon or Jewellery [Abyssalify|Desecration] attempt will guarantee a random ${name.en} modifier`],
    ja: ["インベントリ内でアクティブな時", "次に行う武器または宝飾品への", `[Abyssalify|冒涜]化の試行は、ランダムな${name.ja}のモッドを1個必ず付与する`],
  },
  target: FACTION_TARGET,
  effect: { guaranteeTag: tag },
  source: { client: "currency-hover の説明文、MOD のタグ", owner: "勢力の MOD は等しい確率・足りない分は普通の MOD (2026-10-10・10-11)", coe: "矢筒 (2026-10-14)・お告げに部位の縛り無し・冒涜の MOD の重みは全部 1 = 等しい (data.json 4.5.5.3、2026-10-16)" },
});

/** 腐食のお告げの動作: 固定以外を全部消し、枠いっぱいまで未発現 (発現は普通の MOD だけ)、コラプト */
const PUTREFY: Action[] = [
  { remove: { n: "all", pick: "equal" } },
  // 発現は普通の MOD だけなので、冒涜専用の MOD のアイテムレベルの扱いは関係ない。古代の骨でも段の下限は掛からない (PoE2 Wiki)
  { addUnrevealed: { pools: ["normal"], floor: 0, exclusiveAnyLevel: true, fill: true } },
  { corrupt: true },
];

export const OMEN_SPECS: readonly OmenSpec[] = [
  {
    key: "OmenofSinistralNecromancy", hover: "omenofsinistralnecromancy", appliesTo: "desecrate",
    text: { en: ["While this item is active in your inventory your next", "[Abyssalify|Desecration] attempt will add only prefix modifiers"], ja: ["インベントリ内でアクティブな時", "次に行う", "[Abyssalify|冒涜]化の試行は、プレフィックスモッドだけを追加する"] },
    effect: { side: "prefix" },
    source: { client: "currency-hover の説明文", poe2wiki: "満杯ならその側を 1 つ消して付く (2026-10-14)" },
  },
  {
    key: "OmenofDextralNecromancy", hover: "omenofdextralnecromancy", appliesTo: "desecrate",
    text: { en: ["While this item is active in your inventory your next", "[Abyssalify|Desecration] attempt will add only suffix modifiers"], ja: ["インベントリ内でアクティブな時", "次に行う", "[Abyssalify|冒涜]化の試行は、サフィックスモッドだけを追加する"] },
    effect: { side: "suffix" },
    source: { client: "currency-hover の説明文", poe2wiki: "満杯ならその側を 1 つ消して付く (2026-10-14)" },
  },
  faction("OmenoftheSovereign", "omenofthesovereign", "ulaman_mod", { en: "Ulaman", ja: "ウラマン" }),
  faction("OmenoftheLiege", "omenoftheliege", "amanamu_mod", { en: "Amanamu", ja: "アマナム" }),
  faction("OmenoftheBlackblooded", "omenoftheblackblooded", "kurgal_mod", { en: "Kurgal", ja: "クルガル" }),
  {
    key: "OmenofPutrefaction", hover: "omenofputrefaction", appliesTo: "desecrate",
    text: {
      en: ["While this item is active in your inventory your next", "[Abyssalify|Desecration] attempt will replace all modifiers on the item", "creating an item with up to 6 Unrevealed modifiers and [Corrupted|Corrupting] the item"],
      ja: ["インベントリ内でアクティブな時", "次に行う", "[Abyssalify|冒涜]化の試行は、アイテムの全てのモッドを置き換え", "未発現の冒涜モッドを最大6個持ったアイテムを生成し、そのアイテムを[Corrupted|コラプト状態]にする"],
    },
    effect: { replace: PUTREFY, plain: true },
    alone: true,
    source: { client: "currency-hover の説明文", poe2wiki: "発現は普通の MOD だけ・段の下限は掛からない", owner: "単体で効く (2026-10-05)" },
  },
  {
    key: "OmenofAbyssalEchoes", hover: "omenofabyssalechoes", appliesTo: "reveal",
    text: { en: ["While this item is active in your inventory the next time you", "reveal [Abyssalify|Desecrated] modifiers you can reroll the options once"], ja: ["インベントリ内でアクティブ状態の時", "次回行う[Abyssalify|冒涜]モッドの発現はオプションをもう一度リロールできるようになる"] },
    effect: { rerolls: 1 },
    source: { client: "currency-hover の説明文", coe: "候補をもう 1 組引く (package_poe2.js reveal の params.reroll、2026-10-16)" },
  },
  {
    key: "OmenofLight", hover: "omenoflight", appliesTo: "annul",
    text: { en: ["While this item is active in your inventory your next", "Orb of Annulment will remove only [Abyssalify|Desecrated] modifiers"], ja: ["インベントリ内でアクティブな時", "次に使用する消去のオーブは[Abyssalify|冒涜]モッドのみを取り除く"] },
    effect: { pick: "desecrated" },
    source: { client: "currency-hover の説明文", owner: "骨で付いた普通の MOD も消す (2026-10-10)", coe: "冒涜で付いた物 (未発現・発現済み) だけ (package_poe2.js getRemovableModifiers の OmenOnAnnulRemoveAbyssMod、2026-10-16)" },
  },
  {
    key: "OmenofSinistralAnnulment", hover: "omenofsinistralannulment", appliesTo: "annul",
    text: { en: ["While this item is active in your inventory your next", "Orb of Annulment will remove only prefix modifiers"], ja: ["インベントリ内でアクティブ状態の時", "次に使用する消去のオーブはプレフィックスモッドをのみを取り除く。"] },
    effect: { side: "prefix" },
    source: { client: "currency-hover の説明文" },
  },
  {
    key: "OmenofDextralAnnulment", hover: "omenofdextralannulment", appliesTo: "annul",
    text: { en: ["While this item is active in your inventory your next", "Orb of Annulment will remove only suffix modifiers"], ja: ["インベントリ内でアクティブ状態の時", "次に使用する消去のオーブはサフィックスモッドをのみを取り除く。"] },
    effect: { side: "suffix" },
    source: { client: "currency-hover の説明文" },
  },
];
export const OMEN_SPEC_BY_KEY: ReadonlyMap<string, OmenSpec> = new Map(OMEN_SPECS.map((o) => [o.key, o]));

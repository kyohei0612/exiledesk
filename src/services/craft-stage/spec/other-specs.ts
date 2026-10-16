/**
 * 品質のカレンシー・触媒・ルーン (とアーティフィサー) を説明文の分解で書いた物 (2026-10-16、ADR-004 の 4 段目)
 *
 * 説明文はクライアントの currency-hover-*.json の写し (tests/currency-spec-other.test.ts が同じか確かめる)。
 *   - 品質: 「Improves the quality of a martial weapon / an armour / a flask / a Skill Gem / a wand, staff or sceptre」。
 *     上限は用語集 Quality「up to a default maximum of 20%」。1 回で上がる量は説明文に無い (2026-10-06・10-07 オーナーがゲームで確認)
 *   - 触媒: 「Adds quality that enhances … modifiers on a ring or amulet / on a jewel」「Replaces other quality types」
 *   - アーティフィサー: 「Adds an Augment Socket to a Martial Weapon, wand, staff or Armour」
 *   - ルーン: はめ方は説明文から作った表 (augment-rules.json、2026-10-03) が元から正なので、その表に通す今の関数を部品にした
 */
import { QUALITY_MAX, QUALITY_STEP, QUALITY_STEP_ITEM_ROLLS, QUALITY_TARGET } from "../apply-act";
import { CATALYSTS } from "../../htc/quality";
import type { CurrencySpec, Source, Words } from "./types";

const QUALITY_SOURCE: Source = {
  client: "currency-hover の説明文、用語集 Quality (既定の上限 20%)",
  owner: "1 回で上がる量: 装備は 1 か 2 (等分、2026-10-07)・フラスコ 1・ジェム 5 (2026-10-06 ゲームで確認)",
};
interface QualityDef { stageKey: string; hover: string; text: { en: string[]; ja: string[] }; steps: number[] }
const QUALITY_DEFS: readonly QualityDef[] = [
  { stageKey: "whetstone", hover: "blacksmithswhetstone", text: { en: ["Improves the [Quality|quality] of a [MartialWeapon|martial weapon]"], ja: ["[MartialWeapon|マーシャル武器]の[Quality|品質]を向上させる。"] }, steps: [...QUALITY_STEP_ITEM_ROLLS] },
  { stageKey: "scrap", hover: "armourersscrap", text: { en: ["Improves the [Quality|quality] of an armour"], ja: ["防具の[Quality|品質]を向上させる。"] }, steps: [...QUALITY_STEP_ITEM_ROLLS] },
  { stageKey: "bauble", hover: "glassblowersbauble", text: { en: ["Improves the [Quality|quality] of a [Flask|flask]"], ja: ["[Flask|フラスコ]の[Quality|品質]を向上させる。"] }, steps: [QUALITY_STEP.item] },
  { stageKey: "gemcutter", hover: "gemcuttersprism", text: { en: ["Improves the [Quality|quality] of a Skill Gem"], ja: ["スキルジェムの[Quality|品質]を向上させる。"] }, steps: [QUALITY_STEP.gem] },
  { stageKey: "etcher", hover: "arcanistsetcher", text: { en: ["Improves the [Quality|quality] of a wand, staff or sceptre"], ja: ["ワンド、スタッフまたはセプターの[Quality|品質]を向上させる。"] }, steps: [...QUALITY_STEP_ITEM_ROLLS] },
];
/** 品質のカレンシー。部位のまとまりと打てない時の一言は QUALITY_TARGET (説明文の言葉) から */
export const QUALITY_SPECS: readonly CurrencySpec[] = QUALITY_DEFS.map((d) => {
  const t = QUALITY_TARGET[d.stageKey]!;
  return {
    key: d.hover,
    stageKey: d.stageKey,
    kind: "quality",
    text: d.text,
    target: { groups: [t.group], groupsReason: { ja: `${t.ja}にだけ使える`, en: `${t.en} only` } },
    actions: [{ quality: { steps: d.steps, max: QUALITY_MAX } }],
    limits: [{ kind: "qualityBelow", max: QUALITY_MAX }],
    modless: true,
    source: QUALITY_SOURCE,
  };
});

/** 触媒の「Adds quality that enhances ◯◯ modifiers」の ◯◯ (クライアントの説明文のまま。タグは catalysts.json) */
const CATALYST_WORDS: Readonly<Record<string, Words>> = {
  life: { en: "Life", ja: "ライフ" },
  mana: { en: "Mana", ja: "マナ" },
  defences: { en: "[Armour], [Evasion] and [EnergyShield|Energy Shield]", ja: "[Armour|アーマー]、[Evasion|回避力]および[EnergyShield|エナジーシールド]" },
  physical: { en: "[Physical]", ja: "[Physical|物理]" },
  fire: { en: "[Fire]", ja: "[Fire|火]" },
  cold: { en: "[Cold]", ja: "[Cold|冷気]" },
  lightning: { en: "[Lightning]", ja: "[Lightning|雷]" },
  chaos: { en: "[Chaos]", ja: "[Chaos|混沌]" },
  attack: { en: "[Attack]", ja: "[Attack|アタック]" },
  caster: { en: "[Spell|Caster]", ja: "[Spell|キャスター]" },
  speed: { en: "Speed", ja: "スピード" },
  attribute: { en: "[Attributes|Attribute]", ja: "[Attributes|能力値]" },
  minion: { en: "[Minion]", ja: "[Minion|ミニオン]" },
};
const CATALYST_SOURCE: Source = {
  client: "currency-hover の説明文 (指輪またはアミュレット / ジュエル、他の品質の種類を置き換える)",
  owner: "1 手で上限まで (使った数 = 上げた品質 ÷ 1%)、手順の再生は 1 手 1 個 (2026-10-05・要望 ㉜ の 2)",
};
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** 触媒 (指輪・アミュレット) と精製された触媒 (ジュエル)。手順の鍵は catalyst_<タグ> / jcatalyst_<タグ> */
export const CATALYST_SPECS: readonly CurrencySpec[] = CATALYSTS.flatMap((c) => {
  const w = CATALYST_WORDS[c.tag];
  if (!w) return [];
  const one = (refined: boolean): CurrencySpec => ({
    key: `${refined ? "refined" : ""}${squash(c.en)}`,
    stageKey: `${refined ? "jcatalyst" : "catalyst"}_${c.tag}`,
    kind: "catalyst",
    text: {
      en: [`Adds [Quality|quality] that enhances ${w.en} modifiers on ${refined ? "a jewel" : "a ring or amulet"}`, "Replaces other quality types"],
      ja: [`${w.ja}モッドを強化する[Quality|品質]を${refined ? "ジュエル" : "指輪またはアミュレット"}に追加する。`, "他の品質タイプを置き換える。"],
    },
    target: refined
      ? { groups: ["jewel"], groupsReason: { ja: "精製されたカタリストはジュエルだけ", en: "Refined Catalysts: Jewels only" } }
      : { groups: ["ringAmulet"], groupsReason: { ja: "カタリストは指輪・アミュレットだけ (ジュエルは精製されたカタリスト)", en: "Catalysts: Rings and Amulets only (Jewels use Refined Catalysts)" } },
    actions: [{ catalyst: true }],
    limits: [{ kind: "qualityBelow", max: "catalyst" }],
    source: CATALYST_SOURCE,
  });
  return [one(false), one(true)];
});
export const CATALYST_SPEC_BY_KEY: ReadonlyMap<string, CurrencySpec> = new Map(CATALYST_SPECS.map((s) => [s.stageKey, s]));

/** アーティフィサー。セプターは説明文に無い (今の関数は武器・防具の全部に使える = docs/reviews/2026-10-16-adr-004-orbs-diff.md) */
export const ARTIFICER_SPEC: CurrencySpec = {
  key: "artificersorb",
  stageKey: "artificer",
  kind: "artificer",
  text: {
    en: ["Adds an [Augment] Socket to a [MartialWeapon|Martial Weapon], wand, staff or Armour"],
    ja: ["[MartialWeapon|マーシャル武器]、ワンド、スタッフまたは防具に[Augment|オーグメント]ソケットを1個追加する"],
  },
  target: { groups: ["martial", "wandStaff", "armour"], groupsReason: { ja: "マーシャル武器・ワンド・スタッフ・防具にだけ使える", en: "Martial Weapons, Wands, Staves and Armour only" } },
  actions: [{ addSocket: true }],
  limits: [{ kind: "socketsBelowCap" }],
  source: { client: "currency-hover の説明文", community: "上限はベースごと (PoB の socketLimit − 2)" },
};

/**
 * ルーン・ソウルコア・アイドル (はめる手)。部位・はめられる数・置き換え・コラプトや聖別の後でもはめられるかは、
 * 説明文から作った augment-rules.json と SoulCores の表で決まる (stage-runes.ts の applyRune)。用語集 Augment の文が根拠
 */
export const RUNE_SPEC: CurrencySpec = {
  key: "keyword:Augment",
  stageKey: "rune:",
  kind: "rune",
  text: {
    en: ["Augments are items which can be placed into Augment sockets, usually on [Equipment] items. Once socketed, they can be replaced by other Augments, but cannot be removed by normal means."],
    ja: ["オーグメントはオーグメントソケットにはめることができるアイテムである。オーグメントソケットは通常[Equipment|装備品]が持つ。一度ソケットしてしまうと、他のオーグメントで置き換えることはできるが、通常の方法で取り外すことはできない。"],
  },
  target: {},
  actions: [{ socketAugment: true }],
  limits: [],
  allowCorrupted: true,
  allowSanctified: true,
  modless: true,
  source: { client: "用語集 Augment、SoulCores (Limit・CanSocketInCorruptedSanctified)・SoulCoreStats、augment-rules.json (説明文から作った表)" },
};

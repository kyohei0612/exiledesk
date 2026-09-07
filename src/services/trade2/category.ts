/**
 * GGG の ItemClasses.Id (例 "Body Armour") → trade2 API の type_filters.category.option
 *
 * クラフト収支 (2026-09-07): 貼り付けた装備のベース名 → 装備種別 → trade2 カテゴリ を引くために追加。
 * ベース名 → 種別は `src/i18n/base-item-classes.json` (scripts/build-essences-from-client.mjs 生成)。
 * trade2 の option 値は公式トレードサイトの「アイテムカテゴリ」ドロップダウンの内部値。
 */

import baseItemClasses from "../../i18n/base-item-classes.json";

export interface BaseClassInfo {
  cls: string;
  lvl: number;
}

const BASE_CLASSES = baseItemClasses as Record<string, BaseClassInfo>;

const CLASS_TO_TRADE_CATEGORY: Record<string, string> = {
  Ring: "accessory.ring",
  Amulet: "accessory.amulet",
  Belt: "accessory.belt",
  Talisman: "accessory.talisman",
  Helmet: "armour.helmet",
  "Body Armour": "armour.chest",
  Gloves: "armour.gloves",
  Boots: "armour.boots",
  Shield: "armour.shield",
  Buckler: "armour.buckler",
  Focus: "armour.focus",
  Quiver: "armour.quiver",
  Bow: "weapon.bow",
  Crossbow: "weapon.crossbow",
  Wand: "weapon.wand",
  Staff: "weapon.staff",
  Warstaff: "weapon.warstaff",
  Sceptre: "weapon.sceptre",
  "One Hand Mace": "weapon.onemace",
  "Two Hand Mace": "weapon.twomace",
  Spear: "weapon.spear",
  Flail: "weapon.flail",
  Claw: "weapon.claw",
  Dagger: "weapon.dagger",
  "One Hand Sword": "weapon.onesword",
  "Two Hand Sword": "weapon.twosword",
  "One Hand Axe": "weapon.oneaxe",
  "Two Hand Axe": "weapon.twoaxe",
  Jewel: "jewel",
  Charm: "flask.charm",
  "Life Flask": "flask.life",
  "Mana Flask": "flask.mana",
};

/** 英語ベース名 → 装備種別 (無ければ null) */
export function baseClassOf(baseEn: string): BaseClassInfo | null {
  return BASE_CLASSES[baseEn] ?? null;
}

/** ItemClasses.Id → trade2 category option (無ければ null) */
export function tradeCategoryOfClass(cls: string): string | null {
  return CLASS_TO_TRADE_CATEGORY[cls] ?? null;
}

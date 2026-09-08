/**
 * 装備種別 (GGG ItemClasses.Id) / 発見 V2 のスロット → クライアントの spawn タグ (2026-09-08)
 *
 * mods-bundle の spawn[].t と突合してティア表を絞るために使う (services/mods/tiers.ts)。
 * 防具の str / dex / int 系タグはベースごとに違うので、種別単位では全部含める (やや広め)。
 */

import type { SlotKey } from "../craft-v2/types";

/**
 * 防具 / 盾はベースの属性種別 (str / dex / int …) でタグが変わり、spawn には `str_armour:0` の後に `gloves:1`
 * のような並びが 27 件ある (order-sensitive)。和集合で評価すると最初の 0 で誤って除外するので、
 * サブタイプごとに別のタグ集合を作り「どれかで出れば出る」と評価する。
 */
const ARMOUR_SUBTYPES = ["str_armour", "dex_armour", "int_armour", "str_dex_armour", "str_int_armour", "dex_int_armour", "str_dex_int_armour"];
const SHIELD_SUBTYPES = ["str_shield", "dex_shield", "int_shield", "str_dex_shield", "str_int_shield", "dex_int_shield"];
const ONE_HAND = ["weapon", "one_hand_weapon"];
const TWO_HAND = ["weapon", "two_hand_weapon"];

const armourSets = (slotTag: string) => ARMOUR_SUBTYPES.map((sub) => [slotTag, "armour", sub]);
const shieldSets = () => SHIELD_SUBTYPES.map((sub) => ["shield", sub]);

/** 装備種別 → タグ集合の一覧 (1 種別が複数集合を持つのは防具 / 盾のサブタイプ) */
const CLASS_TAG_SETS: Record<string, string[][]> = {
  Ring: [["ring"]],
  Amulet: [["amulet"]],
  Belt: [["belt"]],
  Talisman: [["talisman"]],
  Helmet: armourSets("helmet"),
  "Body Armour": armourSets("body_armour"),
  Gloves: armourSets("gloves"),
  Boots: armourSets("boots"),
  Shield: shieldSets(),
  Buckler: shieldSets(),
  Focus: [["focus"]],
  Quiver: [["quiver"]],
  Bow: [["bow", "ranged", ...TWO_HAND]],
  Crossbow: [["crossbow", "ranged", ...TWO_HAND]],
  Wand: [["wand", ...ONE_HAND]],
  Sceptre: [["sceptre", ...ONE_HAND]],
  Staff: [["staff", ...TWO_HAND]],
  Warstaff: [["warstaff", ...TWO_HAND]],
  "One Hand Mace": [["mace", ...ONE_HAND]],
  "Two Hand Mace": [["mace", ...TWO_HAND]],
  "One Hand Sword": [["sword", ...ONE_HAND]],
  "Two Hand Sword": [["sword", ...TWO_HAND]],
  "One Hand Axe": [["axe", ...ONE_HAND]],
  "Two Hand Axe": [["axe", ...TWO_HAND]],
  Spear: [["spear", ...ONE_HAND]],
  Flail: [["flail", ...ONE_HAND]],
  Claw: [["claw", ...ONE_HAND]],
  Dagger: [["dagger", ...ONE_HAND]],
  Jewel: [["strjewel"], ["dexjewel"], ["intjewel"], ["radius_jewel", "str_radius_jewel"], ["radius_jewel", "dex_radius_jewel"], ["radius_jewel", "int_radius_jewel"]],
  Charm: [["utility_flask"]],
  "Life Flask": [["life_flask"]],
  "Mana Flask": [["mana_flask"]],
  "Trap Tool": [["trap"]],
  "Fishing Rod": [["fishing_rod"]],
};

/** 装備種別 → spawn タグ集合の一覧。未知の種別は null (= 絞らない) */
export function tagSetsForItemClass(itemClass: string): string[][] | null {
  return CLASS_TAG_SETS[itemClass] ?? null;
}

const WEAPON_CLASSES = ["Bow", "Crossbow", "Wand", "Sceptre", "Staff", "Warstaff", "One Hand Mace", "Two Hand Mace", "One Hand Sword", "Two Hand Sword", "One Hand Axe", "Two Hand Axe", "Spear", "Flail", "Claw", "Dagger"];
const OFFHAND_CLASSES = ["Shield", "Buckler", "Focus", "Quiver"];

function setsOf(classes: string[]): string[][] {
  return classes.flatMap((c) => CLASS_TAG_SETS[c] ?? []);
}

/**
 * 発見 V2 のスロット → 種別ごとの spawn タグ集合 (武器 / オフハンドは全種別)。
 * 出現判定は spawn の並び順に依存するので、種別ごとに別々の集合として評価する (和集合にしない)。
 */
export function tagSetsForSlot(slot: SlotKey): string[][] {
  switch (slot) {
    case "ring":
      return CLASS_TAG_SETS.Ring;
    case "amulet":
      return CLASS_TAG_SETS.Amulet;
    case "helm":
      return CLASS_TAG_SETS.Helmet;
    case "gloves":
      return CLASS_TAG_SETS.Gloves;
    case "body":
      return CLASS_TAG_SETS["Body Armour"];
    case "boots":
      return CLASS_TAG_SETS.Boots;
    case "weapon":
      return setsOf(WEAPON_CLASSES);
    case "weapon2":
      return setsOf([...WEAPON_CLASSES, ...OFFHAND_CLASSES]);
  }
}

/** スロットで実際に使われていたベースの種別 (Id 列) に絞る。種別が引けなければスロット既定 */
export function tagSetsForSlotWithClasses(slot: SlotKey, classes: string[]): string[][] {
  const known = setsOf([...new Set(classes)]);
  return known.length ? known : tagSetsForSlot(slot);
}

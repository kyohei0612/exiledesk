/**
 * poe.ninja character endpoint の items[] 要素の型と、スロット分類
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 *
 * items[] は以下の wrapper 構造 (Rust 側 character_items_to_cached と同じ前提):
 * ```
 * { itemSlot: "Ring1", itemData: { frameType: 2, inventoryId: "Ring", explicitMods: [...] } }
 * ```
 */

import type { SlotKey } from "./types";

export interface PoeNinjaItem {
  itemSlot?: string;
  itemData?: {
    frameType?: number;
    inventoryId?: string;
    explicitMods?: string[];
    implicitMods?: string[];
    /** POE2 では `baseType` 寄りの「ベース表示」が入るケースあり。trade2 検索には `name` 優先。 */
    typeLine?: string;
    /** ベースタイプ (例: "Heavy Belt") */
    baseType?: string;
    /** poe.ninja `data.name` 生値 = ユニュ正式名 (例: "Atziri's Splendour") */
    name?: string;
    icon?: string;
    flavourText?: string | string[];
    requirements?: unknown[];
    properties?: unknown[];
    level?: number;
    ilvl?: number;
    /** poe.ninja `extended.subcategories` (盾 / フォーカス / クィーバー等、現状未使用) */
    extended?: {
      subcategories?: string[];
    };
    /**
     * アイテムが付与するスキル (2026-09-12)。`values[0][0]` が "Level 20 Cast on Critical" 形式。
     * 不在のアミュレット / 王笏 / 一部ユニークが持つ。
     */
    grantedSkills?: { name?: string; values?: unknown[][] }[];
    /**
     * 付与スキルの穴に入っているジェム。`socketedItems[0]` が付与スキル本体で、
     * その `socketedItems[]` に装着ジェム (typeLine) が入る。
     */
    socketedItems?: { typeLine?: string; socketedItems?: { typeLine?: string }[] }[];
  };
}

/** "Level 20 Cast on Critical" → { level: 20, name: "Cast on Critical" }。形式外は level null。 */
export function parseGrantedSkill(raw: string): { level: number | null; name: string } {
  const m = raw.match(/^Level ([0-9]+) (.+)$/);
  if (m) return { level: Number(m[1]), name: m[2].trim() };
  return { level: null, name: raw.trim() };
}

/** items[] 1 件から付与スキル文字列 (生値) の配列を取り出す。 */
export function grantedSkillStrings(item: PoeNinjaItem): string[] {
  const out: string[] = [];
  for (const g of item.itemData?.grantedSkills ?? []) {
    const v = g?.values?.[0]?.[0];
    if (typeof v === "string" && v) out.push(v);
  }
  return out;
}

/** items[] 1 件から「付与スキルの穴に入っているジェム名」を取り出す。 */
export function socketedGemNames(item: PoeNinjaItem): string[] {
  const out: string[] = [];
  for (const holder of item.itemData?.socketedItems ?? []) {
    for (const g of holder?.socketedItems ?? []) {
      if (typeof g?.typeLine === "string" && g.typeLine) out.push(g.typeLine);
    }
  }
  return out;
}

export function isPoeNinjaItem(x: unknown): x is PoeNinjaItem {
  return typeof x === "object" && x !== null;
}

/**
 * inventoryId (poe.ninja の生値) を UI スロットキーに変換。
 *
 *   Ring / Ring2             → "ring"
 *   Amulet                   → "amulet"
 *   Weapon                   → "weapon"
 *   Weapon2/Offhand/Offhand2 → "weapon2"
 *   Helm / Gloves / BodyArmour / Boots → 各スロット
 *   Belt は意図的に除外 (オーナー指示: 指輪枠に紛れて UX を汚す)。
 *   将来追加する場合は SLOT_KEYS と uniquesBySlot 初期化、slotToTradeCategory も同時に拡張。
 *
 * 第 2 引数 `subcategories` は将来のサブスロット分割用に予約 (現在は未使用)。
 */
function inventoryIdToSlot(
  inventoryId: string,
  _subcategories: readonly string[],
): SlotKey | null {
  switch (inventoryId) {
    case "Ring":
    case "Ring2":
      return "ring";
    case "Amulet":
      return "amulet";
    case "Weapon":
      return "weapon";
    case "Weapon2":
    case "Offhand":
    case "Offhand2":
      return "weapon2";
    case "Helm":
      return "helm";
    case "Gloves":
      return "gloves";
    case "BodyArmour":
      return "body";
    case "Boots":
      return "boots";
    default:
      return null;
  }
}

/** Rare (frameType=2) かつ 8 スロットいずれかの item のスロット。対象外は null。 */
export function classifyEquipItem(item: PoeNinjaItem): SlotKey | null {
  const data = item.itemData;
  if (!data) return null;
  if (data.frameType !== 2) return null;
  if (!data.inventoryId) return null;
  const subcats = data.extended?.subcategories ?? [];
  return inventoryIdToSlot(data.inventoryId, subcats);
}

/** ユニーク (frameType=3) かつ 8 スロットいずれかの item のスロット。対象外は null。 */
export function classifyUniqueItem(item: PoeNinjaItem): SlotKey | null {
  const data = item.itemData;
  if (!data) return null;
  if (data.frameType !== 3) return null;
  if (!data.inventoryId) return null;
  const subcats = data.extended?.subcategories ?? [];
  return inventoryIdToSlot(data.inventoryId, subcats);
}

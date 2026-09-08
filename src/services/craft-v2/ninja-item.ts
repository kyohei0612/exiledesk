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
  };
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

/**
 * MOD の表の型 (エンジン側。2026-10-20 手 2 で craft-v2/types/aggregate.ts から移した。craft-v2 はここから読み直す)
 */

export type AffixKind = "P" | "S";

/**
 * 装備スロット種別 (8 種)。poe.ninja の `itemData.inventoryId` とのマッピングは
 * ninja-item.ts の `inventoryIdToSlot` を参照。Belt はオーナー指示で除外。
 */
export type SlotKey =
  | "ring"
  | "amulet"
  | "weapon"
  | "weapon2"
  | "helm"
  | "gloves"
  | "body"
  | "boots";

/** ティア表 1 行 (services/mods/tiers.ts が装備タグで絞って組む) */
export interface ModTierRow {
  tier: number;
  /** stats[0] の範囲 (互換: 単一値 mod の判定に使う) */
  min: number;
  max: number;
  /** 全 stat の範囲 ("Adds # to #" は 2 要素) */
  mins: number[];
  maxs: number[];
  /** trade2 の下限に使う値。単一値 = min、複数値 ("Adds # to #") = 平均値範囲の中央 (trade2 は (X+Y)/2 で照合する) */
  filterMin: number;
  /** 必要 ilvl (Mods.Level) */
  level: number;
  label: string;
}

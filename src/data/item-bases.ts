/**
 * PoB の Data/Bases/*.lua から抽出した item base 情報。
 *
 * 元データ: vendor/PathOfBuilding-PoE2/src/Data/Bases/<category>.lua
 * 抽出スクリプト: scripts/extract-item-bases.mjs
 */
import itemBasesRaw from "../i18n/item-bases.json";

export interface ItemBase {
  name: string;
  category: string; // "sword" | "axe" | "helmet" | "body" | ...
  type: string; // "One Hand Sword" | "Two Hand Axe" | ...
  tags: string[];
  implicit: string | null;
  weapon: Record<string, number> | null;
  armour: Record<string, number> | null;
  req: { level?: number; str?: number; dex?: number; int?: number };
}

export const ALL_BASES = itemBasesRaw as Record<string, ItemBase>;

/**
 * data/mods.ts の itemTag → PoB Data/Bases のカテゴリ名へのマッピング。
 * 大半は同名だが、武器の警棒系・本体系など複数カテゴリにまたがる場合は配列。
 */
const TAG_TO_CATEGORY: Record<string, string[]> = {
  // 防具
  helmet: ["helmet"],
  body_armour: ["body"],
  gloves: ["gloves"],
  boots: ["boots"],
  // オフハンド
  shield: ["shield"],
  focus: ["focus"],
  quiver: ["quiver"],
  // 宝飾品
  belt: ["belt"],
  amulet: ["amulet"],
  ring: ["ring"],
  talisman: ["talisman"],
  // 武器
  sword: ["sword"],
  dagger: ["dagger"],
  mace: ["mace"],
  axe: ["axe"],
  bow: ["bow"],
  crossbow: ["crossbow"],
  claw: ["claw"],
  flail: ["flail"],
  sceptre: ["sceptre"],
  spear: ["spear"],
  wand: ["wand"],
  staff: ["staff"],
  warstaff: ["staff"], // PoB では staff カテゴリ内に warstaff (Quarterstaff 系)
  fishing_rod: ["fishing"],
  trap: ["traptool"],
};

/** 指定 itemTag に対応するベース配列を返す（required level 昇順ソート） */
export function basesForItemTag(itemTag: string): ItemBase[] {
  const cats = TAG_TO_CATEGORY[itemTag] ?? [];
  if (cats.length === 0) return [];
  const out: ItemBase[] = [];
  for (const b of Object.values(ALL_BASES)) {
    if (cats.includes(b.category)) out.push(b);
  }
  return out.sort((a, b) => (a.req.level ?? 0) - (b.req.level ?? 0));
}

export function getBaseByName(name: string): ItemBase | undefined {
  return ALL_BASES[name];
}

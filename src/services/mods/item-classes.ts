/**
 * item-classes.ts — 部位の種別 (2026-10-13 オーナー「タグ精査絶対やらないと、新しい武器が出たらまた骨の設定しないといけないのは作りが違う」)。
 *
 * 元はクライアントの表 (scripts/build-item-classes-from-client.mjs → item-classes.json)。部位の名前を手で並べない:
 * 「武器」「マーシャル武器」「防具」「宝飾品」などは、カレンシーの説明文の言葉と同じまとまりで引く。
 * 新しい武器 (爪・短剣・フレイルなど) がデータに入れば、ここは書き足さずに「武器」になる
 */
import data from "./item-classes.json";

export type ItemKind = "weapon" | "armour" | "jewellery" | "quiver" | "jewel" | "flask" | "charm" | "gem";
interface ClassRow { kind: ItemKind; hands?: number; crafting: string[]; essence: string[]; soulCore: string[]; chanceable: boolean; fracture: boolean; corrupt: boolean; rarity: boolean }
const CLASSES = (data as unknown as { classes: Record<string, ClassRow> }).classes;
const ENGINE = (data as unknown as { engine: Record<string, string> }).engine;

/** エンジンの部位の一覧 (クライアントの部位に結び付いた物) と、まとまりに入る部位 */
export const ENGINE_CATEGORIES: readonly string[] = Object.keys(ENGINE);
export const categoriesIn = (g: ItemGroup): string[] => ENGINE_CATEGORIES.filter((c) => inGroup(c, g));

/** エンジンの部位 (Talismans・Body_Armours_str など) → クライアントの部位 Id (Talisman・Body Armour)。属性の後ろ付きも外して引く */
export function clientClassOf(category: string): string | null {
  // 後ろの付け足し (_str・_radius_int・_cannon など) を 1 段ずつ外して探す (Jewels_radius_int → Jewels)
  for (let c = category; c; c = c.includes("_") ? c.slice(0, c.lastIndexOf("_")) : "") if (ENGINE[c]) return ENGINE[c]!;
  return null;
}
const rowOf = (category: string): ClassRow | null => { const c = clientClassOf(category); return c ? CLASSES[c] ?? null : null; };

/** 種別 (置き場の道から: 武器・防具・宝飾品・矢筒・ジュエル・フラスコ・チャーム・ジェム)。知らない部位は null */
export const kindOf = (category: string): ItemKind | null => rowOf(category)?.kind ?? null;
/** 片手 / 両手 (武器だけ) */
export const handsOf = (category: string): number | null => rowOf(category)?.hands ?? null;

/** 説明文の言葉 → 部位のまとまり (クライアントの CraftingItemClassCategories と種別) */
export type ItemGroup =
  | "weapon" | "martial" | "caster" | "wandStaff" | "armour" | "jewellery" | "ringAmulet" | "quiver" | "jewel" | "flask" | "charm" | "gem"
  | "bodyArmour" | "shieldLike" | "shield" | "equipment";
export function inGroup(category: string, g: ItemGroup): boolean {
  const r = rowOf(category);
  if (!r) return false;
  const c = clientClassOf(category)!;
  switch (g) {
    case "weapon": return r.kind === "weapon";
    // 「マーシャル武器」(砥石・鍛冶のインフューザー・アーティフィサー)
    case "martial": return r.crafting.includes("MartialWeapon");
    // 「ワンド・スタッフ・セプター」(エッチャー・秘術のインフューザー。説明文が部位の名前で書いてある)
    case "caster": return c === "Wand" || c === "Staff" || c === "Sceptre";
    // 「ワンド、スタッフ」(アーティフィサー「Martial Weapon, wand, staff or Armour」。セプターは書いていない)
    case "wandStaff": return c === "Wand" || c === "Staff";
    case "armour": return r.kind === "armour";
    // 「アミュレット・指輪・ベルト」(鎖骨・カマサの生贄・勢力のお告げの Jewellery)
    case "jewellery": return r.kind === "jewellery";
    // 「指輪かアミュレット」(触媒・触媒のインフューザー)
    case "ringAmulet": return c === "Ring" || c === "Amulet";
    case "quiver": return r.kind === "quiver";
    case "jewel": return r.kind === "jewel";
    case "flask": return r.kind === "flask";
    case "charm": return r.kind === "charm";
    case "gem": return r.kind === "gem";
    case "bodyArmour": return c === "Body Armour";
    case "shieldLike": return r.crafting.includes("Shield");
    case "shield": return c === "Shield";
    // 装備 (武器・防具・宝飾品・矢筒)
    case "equipment": return r.kind === "weapon" || r.kind === "armour" || r.kind === "jewellery" || r.kind === "quiver";
  }
}

/** どれかのまとまりに入るか (説明文の「武器か矢筒」など) */
export const inAny = (category: string, gs: readonly ItemGroup[]): boolean => gs.some((g) => inGroup(category, g));

/** フラクチャー / コラプト / レアにできるか (クライアントの ItemClasses) */
export const canFracture = (category: string): boolean => rowOf(category)?.fracture ?? false;
export const canCorrupt = (category: string): boolean => rowOf(category)?.corrupt ?? false;
/** 可能性のオーブが使えるか (Chanceableitemclasses) */
export const chanceable = (category: string): boolean => rowOf(category)?.chanceable ?? false;
/** エッセンス・ルーン (ソウルコア) の部位の区分 (クライアントの EssenceTargetItemCategories / SoulCoreStatCategories の Id) */
export const essenceGroupsOf = (category: string): readonly string[] => rowOf(category)?.essence ?? [];
export const soulCoreGroupsOf = (category: string): readonly string[] => rowOf(category)?.soulCore ?? [];

/**
 * ルーン・ソウルコアの効き目の部位 (SoulCoreStatCategories の Id: "Martial Weapon"・"Wand or Staff"・"Body Armour" など)。
 * クライアントの表で部位が空の区分 ("All"・"Martial Weapon"・"Armour") はまとまりで引く
 */
export function soulCoreFits(cat: string, category: string): boolean {
  if (cat === "All") return inAny(category, ["weapon", "armour"]);
  if (cat === "Martial Weapon") return inGroup(category, "martial");
  if (cat === "Armour") return inGroup(category, "armour");
  if (cat === "Martial Or Caster Weapon") return inGroup(category, "martial") || soulCoreGroupsOf(category).includes(cat);
  if (cat === "Martial Weapon Wand or Staff") return inGroup(category, "martial") || soulCoreGroupsOf(category).includes(cat);
  return soulCoreGroupsOf(category).includes(cat);
}
/** 区分の広さ (狭い区分の効き目を先に使う)。部位の数 */
export function soulCoreSize(cat: string): number {
  if (cat === "All") return 1000;
  const n = Object.values(CLASSES).filter((r) => r.soulCore.includes(cat)).length;
  if (cat === "Martial Weapon" || cat === "Armour") return 100;
  if (cat === "Martial Or Caster Weapon" || cat === "Martial Weapon Wand or Staff") return 100 + n;
  return n || 1e9;
}

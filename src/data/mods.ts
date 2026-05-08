/**
 * POE2 Mod データの読み込みとユーティリティ
 *
 * バンドル `src/i18n/mods-bundle.json` は RePoE fork (poe2) の
 * mods.json (English / Japanese) から以下を統合してスリム化:
 *   - normal: domain in (item|misc|flask|jewel) かつ generation_type in (prefix|suffix)
 *   - essence: is_essence_only=true（PoE2 のエッセンス専用 mod シェル）
 *   - corrupt: generation_type=corrupted (Vaal Orb)
 *   - desecrated: domain=desecrated (Abyss/Ulaman/Kurgal/Amanamu)
 *
 * 抽出は `scripts/extract-mods-bundle.mjs` で再現可能。
 * License: コードは MIT (RePoE)、データは GGG 所有 (ToS 準拠)。
 */

import modsBundleRaw from "../i18n/mods-bundle.json";

export interface SpawnWeight {
  t: string;
  w: number;
}

export interface ModStat {
  id: string;
  min?: number;
  max?: number;
}

export interface Mod {
  key: string;
  name_en: string;
  name_ja: string;
  text_en: string;
  text_ja: string;
  type: "prefix" | "suffix";
  groups: string[];
  level: number;
  stats: ModStat[];
  spawn: SpawnWeight[];
  tags: string[];
  /** Essence currency 固有 mod */
  essence?: number;
  /** Vaal Orb コラプトでのみ付く mod */
  corrupt?: number;
  /** 冒涜 (Desecrated) ドメインの mod */
  desecrated?: number;
}

/** 特殊 mod 分類のラベル（自動判定用） */
export function modSpecialKind(
  m: Mod,
): "essence" | "corrupt" | "desecrated" | null {
  if (m.essence) return "essence";
  if (m.corrupt) return "corrupt";
  if (m.desecrated) return "desecrated";
  return null;
}

/** 指定アイテムタグでの spawn weight を返す（無ければ 0） */
export function modWeightFor(mod: Mod, itemTag: string): number {
  const sw = mod.spawn.find((s) => s.t === itemTag);
  return sw?.w ?? 0;
}

/** mod group：同 group 内に T1 / T2 / T3 ... と複数 tier */
export interface ModGroup {
  id: string;
  type: "prefix" | "suffix";
  /** 高 lv → 低 lv の降順。tiers[0] が T1（最高 tier） */
  tiers: Mod[];
}

/**
 * 指定アイテムタグ + ilvl で、各 group の利用可能な全 tier を含むグループ配列を返す。
 * tier 別選択 UI で使う。
 */
export function getModGroupsForItem(
  itemTag: string,
  maxLevel = 99,
): ModGroup[] {
  const filtered = allMods.filter(
    (m) => modCanSpawnOn(m, itemTag) && m.level <= maxLevel,
  );
  const byGroup = new Map<string, Mod[]>();
  for (const m of filtered) {
    const g = m.groups[0];
    if (!g) continue;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(m);
  }
  const groups: ModGroup[] = [];
  for (const [gid, mods] of byGroup.entries()) {
    mods.sort((a, b) => b.level - a.level);
    groups.push({
      id: gid,
      type: mods[0].type,
      tiers: mods,
    });
  }
  return groups.sort((a, b) => {
    if (a.type !== b.type) return a.type === "prefix" ? -1 : 1;
    return a.tiers[0].text_ja.localeCompare(b.tiers[0].text_ja, "ja");
  });
}

const raw = modsBundleRaw as Record<string, Omit<Mod, "key">>;
export const allMods: Mod[] = Object.entries(raw).map(([key, m]) => ({
  key,
  ...m,
}));

/** タグに該当するか（weight > 0） */
export function modCanSpawnOn(mod: Mod, itemTag: string): boolean {
  return mod.spawn.some((s) => s.t === itemTag && s.w > 0);
}

/**
 * 指定アイテムタグ + アイテム lvl 上限に対し、各グループで required_level ≤ maxLevel
 * の中で最高 tier の mod のみを返す。6 mod 選択 UI で「最大値の組合せ」用。
 *
 * @param itemTag spawn 対象タグ（"helmet"|"ring"|...）
 * @param maxLevel アイテム lvl（required_level がこれ以下の mod のみ表示）
 */
export function getMaxTierMods(itemTag: string, maxLevel = 99): Mod[] {
  const filtered = allMods.filter(
    (m) => modCanSpawnOn(m, itemTag) && m.level <= maxLevel,
  );
  const byGroup = new Map<string, Mod>();
  for (const m of filtered) {
    for (const g of m.groups) {
      const cur = byGroup.get(g);
      if (!cur || m.level > cur.level) byGroup.set(g, m);
    }
  }
  return Array.from(byGroup.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "prefix" ? -1 : 1;
    return a.text_ja.localeCompare(b.text_ja, "ja");
  });
}

/** よく使うアイテムタグ（日本語表示） — POE2 全装備カテゴリ */
export const ITEM_TAGS: { id: string; label: string }[] = [
  // 防具
  { id: "helmet", label: "兜" },
  { id: "body_armour", label: "鎧" },
  { id: "gloves", label: "手袋" },
  { id: "boots", label: "靴" },
  // オフハンド
  { id: "shield", label: "盾" },
  { id: "focus", label: "フォーカス" },
  { id: "quiver", label: "矢筒" },
  // 宝飾品
  { id: "belt", label: "ベルト" },
  { id: "amulet", label: "アミュレット" },
  { id: "ring", label: "指輪" },
  { id: "talisman", label: "タリスマン" },
  // 片手武器
  { id: "claw", label: "鉤爪" },
  { id: "dagger", label: "短剣" },
  { id: "wand", label: "ワンド" },
  { id: "sword", label: "片手剣" },
  { id: "axe", label: "片手斧" },
  { id: "mace", label: "片手メイス" },
  { id: "sceptre", label: "セプター" },
  { id: "spear", label: "スピア" },
  { id: "flail", label: "フレイル" },
  // 両手武器
  { id: "bow", label: "弓" },
  { id: "staff", label: "スタッフ" },
  { id: "warstaff", label: "クォータースタッフ" },
  { id: "crossbow", label: "クロスボウ" },
  { id: "fishing_rod", label: "釣り竿" },
  { id: "trap", label: "トラップ" },
];

/** mod の text 内の `[...|...]` リンク記法を表示用に綺麗にする */
export function cleanModText(text: string): string {
  return text.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2");
}

/**
 * POE2 Mod データの読み込みとユーティリティ
 *
 * バンドル `src/i18n/mods-bundle.json` は RePoE fork (poe2) の
 * mods.json から item domain + prefix/suffix + not essence-only に絞って
 * EN/JA を統合・スリム化したもの（約 0.7 MB / 1753 件）
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

/** よく使うアイテムタグ（日本語表示） */
export const ITEM_TAGS: { id: string; label: string }[] = [
  { id: "helmet", label: "ヘルメット" },
  { id: "body_armour", label: "ボディアーマー" },
  { id: "gloves", label: "グローブ" },
  { id: "boots", label: "ブーツ" },
  { id: "shield", label: "シールド" },
  { id: "focus", label: "フォーカス" },
  { id: "quiver", label: "クイバー" },
  { id: "belt", label: "ベルト" },
  { id: "amulet", label: "アミュレット" },
  { id: "ring", label: "リング" },
  { id: "talisman", label: "タリスマン" },
  { id: "wand", label: "ワンド" },
  { id: "sceptre", label: "セプター" },
  { id: "staff", label: "スタッフ" },
  { id: "sword", label: "ソード" },
  { id: "mace", label: "メイス" },
  { id: "axe", label: "アックス" },
  { id: "spear", label: "スピア" },
  { id: "flail", label: "フレイル" },
  { id: "bow", label: "ボウ" },
  { id: "crossbow", label: "クロスボウ" },
];

/** mod の text 内の `[...|...]` リンク記法を表示用に綺麗にする */
export function cleanModText(text: string): string {
  return text.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2");
}

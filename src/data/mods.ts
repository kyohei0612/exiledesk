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

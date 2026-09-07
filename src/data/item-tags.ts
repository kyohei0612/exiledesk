/**
 * POE2 装備カテゴリのタグ一覧 (日本語表示) と、bundle テキストの paste 互換整形。
 *
 * mods.ts (414 行) から切り出し (2026-09-07 R4)。純データ / 純関数のみで mods.ts に依存しない。
 */

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

/**
 * bundle 由来のタグマーカーを剥がして人間可読 / POE2 公式 paste 互換テキストに整形。
 *
 * bundle 形式は `[link|displayed]` の link/text 表記:
 *   text_ja: "[Physical|物理]ダメージを..." → 表示「物理ダメージを...」
 *   text_en: "[Resistances|Cold Resistance]" → 表示「Cold Resistance」
 *   単独: "[Lightning]" → 「Lightning」（POE2 hover タグ）
 *
 * 常に表示部分 ($2) を採用、`[X]` 単独マーカーも括弧除去。これで
 * 日英どちらの bundle テキストでも CoE 互換の純 POE2 paste 形式が得られる。
 */
export function cleanModText(text: string): string {
  return text
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^\]]+)\]/g, "$1");
}

/**
 * POE2 アイテム名の日本語ローカライゼーション
 *
 * **データソース**: RePoE fork (poe2) の公式 GGG クライアント由来 JA 翻訳
 *   - https://github.com/repoe-fork/poe2
 *   - data/Japanese/{base_items,uniques}.json から英→日のペアを抽出
 *   - items-ja.json として 3500+ 件をバンドル
 *
 * 未掲載アイテムは英名フォールバック（理論上ほぼ無いはず）
 */

import itemsJa from "./items-ja.json";

const map = itemsJa as Record<string, string>;

/**
 * アイテム名を日本語化。未登録は英名そのまま。
 */
export function jaCurrency(englishName: string): string {
  return map[englishName] ?? englishName;
}

/**
 * 日本語があるかどうか
 */
export function hasJa(englishName: string): boolean {
  return englishName in map;
}

export const DIVINE_ORB_EN = "Divine Orb";
export const DIVINE_ORB_JA = map["Divine Orb"] ?? "神のオーブ";

/** 翻訳済件数（デバッグ用） */
export const TRANSLATION_COUNT = Object.keys(map).length;

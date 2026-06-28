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
// 穴埋め専用フォールバック辞書 (poe2db JA 由来)。新リーグの新アイテム(ルーン/タリスマン等)で
// 公式 items-ja.json に未掲載のものを補完する。items-ja.json は凍結・優先(無回帰)。
import itemsJaPoe2db from "./items-ja-poe2db.json";

const map = itemsJa as Record<string, string>;
const poe2db = itemsJaPoe2db as Record<string, string>;

// poe2db の slug はアポストロフィを落とすため、辞書キーも除去形 (例: "Farrul's Catalyst"
// -> "Farruls Catalyst")。poe2db 段のみアポストロフィ除去キーも試す。items-ja(公式) は
// アポストロフィ付きキー(378件)を持つため exact name 優先のまま壊さない。
const stripApos = (s: string): string => s.replace(/['’]/g, "");

/**
 * アイテム名を日本語化。
 * 優先順位: items-ja(公式, exact) -> poe2db(穴埋め, exact) -> poe2db(アポストロフィ除去) -> 英名。
 */
export function jaCurrency(englishName: string): string {
  return (
    map[englishName] ??
    poe2db[englishName] ??
    poe2db[stripApos(englishName)] ??
    englishName
  );
}

/**
 * 日本語があるかどうか (公式 or poe2db フォールバック/アポストロフィ除去のいずれかにあれば true)
 */
export function hasJa(englishName: string): boolean {
  return (
    englishName in map ||
    englishName in poe2db ||
    stripApos(englishName) in poe2db
  );
}

export const DIVINE_ORB_EN = "Divine Orb";
export const DIVINE_ORB_JA = map["Divine Orb"] ?? "神のオーブ";

/** 翻訳済件数（デバッグ用） */
export const TRANSLATION_COUNT = Object.keys(map).length;

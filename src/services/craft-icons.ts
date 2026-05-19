/**
 * POE2 クラフト素材名 → 公式 CDN 画像 URL マップ。
 *
 * データソース: src/i18n/craft-icons.json (scripts/extract-craft-icons.mjs で生成、
 * POE2 公式 trade2 API 由来)。GGG 公式画像配信 URL を使用。
 *
 * AI 返答テキスト中の素材名（JA / EN）を `<img + 名前>` に置換するために使用。
 * 加えて英名 → JA 名への自動翻訳機能 (translateEnToJa) も提供。
 */

import iconsJson from "../i18n/craft-icons.json";
import itemsJa from "../i18n/items-ja.json";

const ICONS_MAP = iconsJson as Record<string, string>;
const ITEMS_JA_MAP = itemsJa as Record<string, string>;

// 長い名前から先に置換（部分一致による誤マッチ回避）
const SORTED_NAMES = Object.keys(ICONS_MAP).sort(
  (a, b) => b.length - a.length,
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * テキスト中のクラフト素材名を `<img + 名前>` に置換した HTML 文字列を返す。
 * 既に img タグの後に来てる名前は二重置換しない（簡易チェック）。
 *
 * 注意: 入力テキストは事前に HTML escape 済 (`<` / `>` / `&` 処理済) を想定。
 * 出力には新規 `<img>` タグが含まれるので、Vue では v-html で render。
 */
export function applyCraftIcons(text: string): string {
  let out = text;
  for (const name of SORTED_NAMES) {
    const url = ICONS_MAP[name];
    if (!url) continue;
    // 名前の直前 2 文字以内に `>` (img タグ閉じ) があれば既に img 付与済 → スキップ
    const re = new RegExp(`(?<!>\\s{0,3})${escapeRegExp(name)}`, "g");
    const img = `<img src="${escapeHtmlAttr(url)}" alt="" loading="lazy" class="inline-block w-4 h-4 align-text-bottom mr-0.5" />`;
    out = out.replace(re, `${img}${name}`);
  }
  return out;
}

// ============================
// 英名 → 日本語名 自動置換
// ============================
// items-ja.json は { "Pearl Ring": "真珠の指輪", "Orb of Augmentation": "増強のオーブ", ... }
// AI が英名で返答した場合に日本語表記に統一するため、長い英名から先に union 正規表現で一括置換。
// オーナー判断 2026-05-10: AI 返答の名前は日本語（カナ/漢字）で統一。

const SORTED_EN_NAMES = Object.keys(ITEMS_JA_MAP)
  .filter((en) => en !== ITEMS_JA_MAP[en]) // EN === JA のものは置換不要
  .filter((en) => en.length >= 3) // 短すぎる単語は誤マッチ回避（"to" "of" 等を除外）
  .sort((a, b) => b.length - a.length);

const EN_TO_JA_REGEX = new RegExp(
  SORTED_EN_NAMES.map(escapeRegExp).join("|"),
  "g",
);

/**
 * テキスト中の POE2 アイテム / 通貨 / エッセンス / 素材の **英名** を **日本語名** に置換。
 * 例: "Perfect Essence of Ice" → "氷晶のパーフェクトエッセンス"
 *     "Orb of Augmentation" → "増強のオーブ"
 *     "Pearl Ring of Whirling" → "真珠の指輪 (大渦の変化)"
 *
 * 一般英単語 (3 文字未満) や EN===JA のエントリは置換対象外。
 */
export function translateEnToJa(text: string): string {
  return text.replace(EN_TO_JA_REGEX, (match) => ITEMS_JA_MAP[match] ?? match);
}

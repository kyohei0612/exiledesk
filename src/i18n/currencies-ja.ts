/**
 * POE2 通貨アイテム名の日本語ローカライゼーション
 *
 * v0 段階のハードコード辞書（最頻出通貨の正規日本語名）。
 * **将来の置換先**: RePoE fork (poe2) の Japanese 翻訳 JSON
 *   - https://github.com/repoe-fork/poe2
 *   - https://repoe-fork.github.io/poe2/
 *   - GGG クライアント由来データなので翻訳が正確
 *
 * 未掲載アイテムは英名フォールバック。
 */

const currencyJaMap: Record<string, string> = {
  // === コア通貨（最頻出） ===
  "Divine Orb": "神のオーブ",
  "Exalted Orb": "高貴なるオーブ",
  "Chaos Orb": "混沌のオーブ",
  "Mirror of Kalandra": "カランドラの鏡",
  "Vaal Orb": "ヴァールのオーブ",

  // === 改造系オーブ ===
  "Orb of Alchemy": "錬金術のオーブ",
  "Orb of Augmentation": "強化のオーブ",
  "Orb of Transmutation": "改変のオーブ",
  "Orb of Annulment": "抹消のオーブ",
  "Orb of Chance": "幸運のオーブ",
  "Regal Orb": "王権のオーブ",
  "Blessed Orb": "祝福のオーブ",
  "Engineer's Orb": "設計者のオーブ",
  "Glassblower's Bauble": "ガラス職人の装飾",

  // === 宝石細工系（POE2 で重要） ===
  "Greater Jeweller's Orb": "上級宝石細工師のオーブ",
  "Lesser Jeweller's Orb": "下級宝石細工師のオーブ",
  "Perfect Jeweller's Orb": "完璧な宝石細工師のオーブ",
  "Jeweller's Orb": "宝石細工師のオーブ",
  "Gemcutter's Prism": "宝石細工師のプリズム",

  // === 職人系（POE2） ===
  "Artificer's Orb": "工芸職人のオーブ",
  "Artificer's Shard": "工芸職人のかけら",
  "Hinekora's Lock": "ヒネコラの錠",

  // === 防具・武器強化 ===
  "Armourer's Scrap": "鎧鍛冶のかけら",
  "Blacksmith's Whetstone": "鍛冶屋の砥石",
  "Chromatic Orb": "七色のオーブ",
  "Orb of Fusing": "融合のオーブ",
  "Orb of Binding": "結合のオーブ",

  // === スクロール ===
  "Scroll of Wisdom": "鑑定の巻物",
  "Portal Scroll": "帰還の巻物",

  // === エッセンス系（POE2 で重要） ===
  "Lesser Essence of Body": "下級肉体のエッセンス",
  "Lesser Essence of Mind": "下級精神のエッセンス",
  "Greater Essence of Body": "上級肉体のエッセンス",
  "Greater Essence of Mind": "上級精神のエッセンス",
  "Perfect Essence of Body": "完璧な肉体のエッセンス",
  "Perfect Essence of Mind": "完璧な精神のエッセンス",

  // === 未掲載は英名フォールバック ===
};

/**
 * 通貨名を日本語化。未登録は英名そのまま。
 */
export function jaCurrency(englishName: string): string {
  return currencyJaMap[englishName] ?? englishName;
}

/**
 * 日本語があるかどうか
 */
export function hasJa(englishName: string): boolean {
  return englishName in currencyJaMap;
}

export const DIVINE_ORB_EN = "Divine Orb";
export const DIVINE_ORB_JA = "神のオーブ";

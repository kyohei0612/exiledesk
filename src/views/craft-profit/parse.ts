/**
 * クラフト収支: 貼り付けた装備テキスト (ゲーム内 Ctrl+C、日本語 / 英語) の解析
 *
 *   1. parseJaClipboard で name / base / ilvl / mod 行を取り出す
 *   2. レアリティ行を別途拾う (parser は metadata として捨てるため)
 *   3. ベース名を英語に寄せ、装備種別 (ItemClasses.Id) を引く
 *   4. 各 mod 行を bundle で同定 (日本語行は translateModLine で英訳してから)
 */

import { parseJaClipboard } from "../../parser/item-text";
import { translateModLine } from "../../parser/translate-item";
import { identifyModText, type IdentifiedMod } from "../../data/mod-translations";
import { lookupGroups, modBundleIndex } from "../../services/mods/dictionaries";
import { baseClassOf } from "../../services/trade2/category";
import { jaCurrency } from "../../i18n/currencies-ja";
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import baseItemClasses from "../../i18n/base-item-classes.json";

export type ItemRarity = "normal" | "magic" | "rare" | "unique" | "unknown";

/** 装備に付いている 1 mod (同定済み) */
export interface ItemMod {
  /** 表示用 (貼り付け原文) */
  raw: string;
  /** 英語の実値入り行 (trade2 / 同定に使う) */
  textEn: string;
  textJa: string;
  affix: "prefix" | "suffix" | "unknown";
  groups: string[];
  /** GGG stat ID → 実値 (テンプレの # と同順で対応付け) */
  stats: Array<{ id: string; value: number }>;
  identified: true;
}

export interface UnidentifiedMod {
  raw: string;
  identified: false;
}

export interface ParsedItem {
  name: string | null;
  baseEn: string | null;
  baseJa: string | null;
  /** ItemClasses.Id (例 "Ring")。ベースが引けなければ null */
  itemClass: string | null;
  rarity: ItemRarity;
  itemLevel: number | null;
  mods: Array<ItemMod | UnidentifiedMod>;
  /** 暗黙 (参考表示のみ) */
  implicits: string[];
  corrupted: boolean;
}

// 日本語ベース名 → 英語 (クライアント原本を優先、poe2db 版で補完)
const JA_TO_EN: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const dict of [itemsJa as Record<string, string>, itemsJaClient as Record<string, string>]) {
    for (const [en, ja] of Object.entries(dict)) m.set(ja, en);
  }
  return m;
})();

function detectRarity(text: string): ItemRarity {
  const m = text.match(/^(?:Rarity|レアリティ)\s*[:：]\s*(.+)$/im);
  if (!m) return "unknown";
  const v = m[1].trim().toLowerCase();
  if (v === "normal" || v === "ノーマル") return "normal";
  if (v === "magic" || v === "マジック") return "magic";
  if (v === "rare" || v === "レア") return "rare";
  if (v === "unique" || v === "ユニーク") return "unique";
  return "unknown";
}

// 英語ベース名 (base-item-classes.json のキー) を長い順に。マジック名 "Vivid Sapphire Ring of the Cloud" から
// 部分一致でベースを切り出すのに使う (接辞名の区切りは言語で違うので、辞書との最長一致に頼る)
const EN_BASES_LONGEST: string[] = Object.keys(baseItemClasses as Record<string, unknown>).sort((a, b) => b.length - a.length);
const JA_BASES_LONGEST: string[] = [...JA_TO_EN.keys()].sort((a, b) => b.length - a.length);

/** 名前 (接辞付きでもよい) に含まれる最長のベース名を返す。英語 / 日本語どちらでも可 */
function findBaseInName(name: string): string | null {
  for (const en of EN_BASES_LONGEST) {
    if (name.includes(en)) return en;
  }
  for (const ja of JA_BASES_LONGEST) {
    if (name.includes(ja)) return JA_TO_EN.get(ja) ?? null;
  }
  return null;
}

/** 日本語テンプレの範囲 `(8-12)` / 裸数値を実値で埋める */
function fillJa(template: string, values: number[]): string {
  let i = 0;
  let s = template.replace(/\(-?\d+(?:\.\d+)?-(?:-?\d+(?:\.\d+)?)\)/g, () => String(values[i++] ?? "#"));
  s = s.replace(/(?<![\d.])-?\d+(?:\.\d+)?(?![\d.])/g, (m0) => (i < values.length ? String(values[i++]) : m0));
  return s;
}

function toItemMod(raw: string, en: string, id: IdentifiedMod): ItemMod {
  const stats = id.statIds.map((sid, i) => ({ id: sid, value: id.values[i] ?? id.values[id.values.length - 1] ?? 0 }));
  // prefix / suffix は bundle 多数決 + poe2db オーバーライド (dictionaries.ts) を正とする。
  // mod-translations の affixType は「最初に見つかった同文 entry」なので腐敗 mod 等に引きずられる。
  const voted = modBundleIndex.get(id.normalizedEn)?.affix;
  const affix: ItemMod["affix"] = voted === "P" ? "prefix" : voted === "S" ? "suffix" : id.affixType;
  return {
    raw,
    textEn: en,
    textJa: fillJa(id.jaTemplate, id.values),
    affix,
    groups: lookupGroups(id.normalizedEn),
    stats,
    identified: true,
  };
}

export function parseItemText(text: string): ParsedItem | null {
  // parseJaClipboard は日本語の「アイテムクラス:」「レアリティ:」行を名前と誤認するので先に落とす
  const cleaned = text
    .split(/\r?\n/)
    .filter((l) => !/^(アイテムクラス|レアリティ|Item Class|Rarity)\s*[:：]/.test(l.trim()))
    .join("\n");
  const parsed = parseJaClipboard(cleaned);
  if (!parsed) return null;
  const rarity = detectRarity(text);

  // ベース: 2 行目 (name の次)。マジック / ノーマルはベース行が無い (name = ベース or 接辞付き名) こともある
  let baseEn: string | null = null;
  const candidates = [parsed.base, parsed.name].filter((s): s is string => !!s);
  for (const c of candidates) {
    const en = JA_TO_EN.get(c) ?? (baseClassOf(c) ? c : null);
    if (en) {
      baseEn = en;
      break;
    }
  }
  if (!baseEn) {
    for (const c of candidates) {
      const found = findBaseInName(c);
      if (found && baseClassOf(found)) {
        baseEn = found;
        break;
      }
    }
  }
  const cls = baseEn ? (baseClassOf(baseEn)?.cls ?? null) : null;

  const mods: Array<ItemMod | UnidentifiedMod> = parsed.modLines.map((raw) => {
    const en = /[぀-ヿ一-鿿]/.test(raw) ? translateModLine(raw) : raw;
    const id = en ? identifyModText(en) : null;
    if (!en || !id) return { raw, identified: false };
    return toItemMod(raw, en, id);
  });

  return {
    name: parsed.name ?? null,
    baseEn,
    baseJa: baseEn ? jaCurrency(baseEn) : null,
    itemClass: cls,
    rarity,
    itemLevel: parsed.itemLevel ?? null,
    mods,
    implicits: parsed.implicitLines,
    corrupted: /^(Corrupted|腐敗)$/m.test(text),
  };
}

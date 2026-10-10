/**
 * ゲームのキーワードの説明 (2026-09-26)。src/i18n/keywords-ja.json (scripts/build-keywords-ja.mjs、クライアントの KeywordPopups)。
 * MOD 文の [Tag|表示] の Tag で引く。約 290KB なので使う時に読み込む。
 * 英語の画面では keywords-en.json (同じスクリプトの --en、ゲームの英語の原文)。
 */
import { shallowRef } from "vue";
import { lang, type Lang } from "../i18n/lang";

export interface Keyword {
  /** 見出し (日本語) */
  t: string;
  /** 説明 (日本語。[Tag|表示] の印を含む = さらに奥へ辿れる) */
  d: string;
}

type Dict = { d: Record<string, Keyword>; lower: Map<string, Keyword> };
const dict = { ja: shallowRef<Dict | null>(null), en: shallowRef<Dict | null>(null) };
const loading: Partial<Record<Lang, Promise<void>>> = {};

/** 今の言語の辞書を読み込む (英語の画面では keywords-en.json、2026-10-10 英語版) */
export function loadKeywords(l: Lang = lang.value): Promise<void> {
  loading[l] ??= (l === "en" ? import("../i18n/keywords-en.json") : import("../i18n/keywords-ja.json")).then((m) => {
    const d = (m.default ?? m) as unknown as Record<string, Keyword>;
    dict[l].value = { d, lower: new Map(Object.entries(d).map(([k, v]) => [k.toLowerCase(), v])) };
  });
  return loading[l]!;
}

/** Tag から引く (大文字小文字は問わない)。読み込み前・無い物は null (言語を切り替えたらその言語の辞書を読み込む) */
export function keywordOf(tag: string): Keyword | null {
  const l = lang.value;
  const d = dict[l].value;
  if (!d) { void loadKeywords(l); return null; }
  return d.d[tag] ?? d.lower.get(tag.toLowerCase()) ?? null;
}

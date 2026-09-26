/**
 * ゲームのキーワードの説明 (2026-09-26)。src/i18n/keywords-ja.json (scripts/build-keywords-ja.mjs、クライアントの KeywordPopups)。
 * MOD 文の [Tag|表示] の Tag で引く。約 290KB なので使う時に読み込む。
 */
import { shallowRef } from "vue";

export interface Keyword {
  /** 見出し (日本語) */
  t: string;
  /** 説明 (日本語。[Tag|表示] の印を含む = さらに奥へ辿れる) */
  d: string;
}

const dict = shallowRef<Record<string, Keyword> | null>(null);
let lower: Map<string, Keyword> | null = null;
let loading: Promise<void> | null = null;

export function loadKeywords(): Promise<void> {
  loading ??= import("../i18n/keywords-ja.json").then((m) => {
    dict.value = (m.default ?? m) as unknown as Record<string, Keyword>;
    lower = new Map(Object.entries(dict.value).map(([k, v]) => [k.toLowerCase(), v]));
  });
  return loading;
}

/** Tag から引く (大文字小文字は問わない)。読み込み前・無い物は null */
export function keywordOf(tag: string): Keyword | null {
  const d = dict.value;
  if (!d) return null;
  return d[tag] ?? lower?.get(tag.toLowerCase()) ?? null;
}

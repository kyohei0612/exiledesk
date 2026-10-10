/**
 * カレンシーランキングのホバーの中身 (2026-09-26)
 *
 * クライアント原本から作った src/i18n/currency-hover-ja.json (scripts/build-currency-hover-ja.mjs) を引く。
 * エッセンス / 合金は装備の種類ごとに付く MOD、リネージュサポートは説明文、フラグメントは付くモッド、
 * ヴェリシウムは作れる物、シャードは束ねると何になるか、ウェイストーンは開くマップのエリアレベル。
 * 無い物は今までの currency-effects-ja.json (views/currency/format.ts の effectFor) で出す。
 * 約 330KB あるので、使う時に読み込む。
 */
import { shallowRef } from "vue";
import { lang, type Lang } from "../../i18n/lang";

export interface CurrencyHover {
  /** 日本語名 */
  n: string;
  /** 説明の行 */
  e?: string[];
  /** スタック数 (「1 / 20」) */
  s?: string;
  /** 見出し付きの一覧 (「指輪に付く」→ MOD の行) */
  g?: Array<{ h: string; l: string[] }>;
}

const dict = { ja: shallowRef<Record<string, CurrencyHover> | null>(null), en: shallowRef<Record<string, CurrencyHover> | null>(null) };
const loading: Partial<Record<Lang, Promise<void>>> = {};

/** 今の言語の辞書を読み込む (英語の画面では currency-hover-en.json、2026-10-10 英語版) */
export function loadCurrencyHover(l: Lang = lang.value): Promise<void> {
  loading[l] ??= (l === "en" ? import("../../i18n/currency-hover-en.json") : import("../../i18n/currency-hover-ja.json")).then((m) => {
    dict[l].value = (m.default ?? m) as unknown as Record<string, CurrencyHover>;
  });
  return loading[l]!;
}

/** 英語名から引く (views/currency/format.ts の normName と同じ潰し方)。読み込み前・無い物は null */
export function currencyHoverOf(textEn: string): CurrencyHover | null {
  const l = lang.value;
  if (!dict[l].value) { void loadCurrencyHover(l); return null; }
  return dict[l].value?.[textEn.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;
}

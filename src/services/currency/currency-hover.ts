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

const dict = shallowRef<Record<string, CurrencyHover> | null>(null);
let loading: Promise<void> | null = null;

export function loadCurrencyHover(): Promise<void> {
  loading ??= import("../../i18n/currency-hover-ja.json").then((m) => {
    dict.value = (m.default ?? m) as unknown as Record<string, CurrencyHover>;
  });
  return loading;
}

/** 英語名から引く (views/currency/format.ts の normName と同じ潰し方)。読み込み前・無い物は null */
export function currencyHoverOf(textEn: string): CurrencyHover | null {
  return dict.value?.[textEn.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;
}

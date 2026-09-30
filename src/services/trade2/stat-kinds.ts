/**
 * stat-kinds.ts — 取引所に、その MOD の番号の種類 (普通 / フラクチャー / 冒涜) があるか (2026-09-30)
 *
 * オーナー「他にも同じように検索出ないとかありそう」: 「どれか 1 つ」の枠 (count) に取引所に無い種類の番号を送ると
 * 「使用不能なスタッツ」になる。表は scripts/build-trade2-stat-text.mjs が data-cache/trade2-stats.json (取引所の /data/stats の写し) から作る。
 * 表に無い番号 (表が古い等) は普通だけ有ると見なす
 */
import kinds from "../../i18n/trade2-stat-kinds.json";

export type StatKind = "explicit" | "fractured" | "desecrated";
const LETTER: Record<StatKind, string> = { explicit: "e", fractured: "f", desecrated: "d" };

/** 番号 (種類の前置き無し、「stat_123」) にその種類があるか */
export function hasStatKind(bare: string, kind: StatKind): boolean {
  const k = (kinds as Record<string, string>)[bare];
  if (k == null) return kind === "explicit";
  return k.includes(LETTER[kind]);
}

/** 並びのうち取引所にある種類だけ (1 つも無ければ普通だけ) */
export function existingKinds<T extends StatKind>(bare: string, want: readonly T[]): T[] {
  const got = want.filter((k) => hasStatKind(bare, k));
  return got.length ? got : (want.filter((k) => k === "explicit") as T[]);
}

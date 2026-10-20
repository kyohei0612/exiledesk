/**
 * ベース / ジェム / ユニークの英名 → 日本語名 (2026-10-20 手 2 で services/trade2/localize.ts から移した。エンジンと取引所の両方が読む)
 */
import gemsRaw from "./gems-client.json";
import itemsJaClient from "./items-ja-client.json";
import itemsJa from "./items-ja.json";
import uniqueNamesJa from "./unique-names-ja.json";

const GEM_JA: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const g of gemsRaw as { en: string; ja: string }[]) m.set(g.en, g.ja);
  return m;
})();
const ITEMS_JA = itemsJaClient as Record<string, string>;
const ITEMS_JA2 = itemsJa as Record<string, string>;
const UNIQUE_JA = uniqueNamesJa as Record<string, string>;

/** ベース / ジェム名の英名 → 日本語名。辞書に無ければそのまま */
export function jaTypeName(en: string): string {
  return GEM_JA.get(en) ?? ITEMS_JA[en] ?? ITEMS_JA2[en] ?? en;
}
/** ユニーク名の英名 → 日本語名 */
export function jaUniqueName(en: string): string {
  return UNIQUE_JA[en] ?? en;
}

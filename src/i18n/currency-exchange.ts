/**
 * ゲーム内カレンシー取引所の分類 (クライアント CurrencyExchange 由来、2026-09-09)
 *
 * カレンシーランキングのカテゴリを「ゲームと同じ 14 分類」にするための辞書。
 * poe2scout のアイテム名 (英名) → 取引所カテゴリ を引き、グループ ID `x:<Category Id>` を返す。
 * 取引所に無いもの (装備 / ユニーク等) は poe2scout のカテゴリのまま後ろに並べる。
 */
import currencyExchange from "./currency-exchange.json";

interface ExchangeJson {
  categories: Array<{ id: string; nameEn: string; nameJa: string }>;
  subcategories: Record<string, { nameEn: string; nameJa: string }>;
  items: Record<string, { category: string; sub: string | null; enabled: boolean }>;
}

const EX = currencyExchange as ExchangeJson;
const PREFIX = "x:";
const CATEGORY_INDEX = new Map(EX.categories.map((c, i) => [c.id, i]));
const CATEGORY_JA = new Map(EX.categories.map((c) => [c.id, c.nameJa]));

/** 取引所カテゴリのグループ ID (`x:Currency` など)。取引所に無い名前なら null */
export function exchangeGroupIdOf(nameEn: string): string | null {
  const e = EX.items[nameEn];
  return e ? PREFIX + e.category : null;
}

/** サブカテゴリ (例 "Greater Runes") の日本語名。無ければ null */
export function exchangeSubJaOf(nameEn: string): string | null {
  const e = EX.items[nameEn];
  return e?.sub ? (EX.subcategories[e.sub]?.nameJa ?? e.sub) : null;
}

export function isExchangeGroup(groupId: string): boolean {
  return groupId.startsWith(PREFIX);
}

/** ゲーム UI と同じ並び順 (取引所に無いグループは -1) */
export function exchangeGroupOrder(groupId: string): number {
  if (!isExchangeGroup(groupId)) return -1;
  return CATEGORY_INDEX.get(groupId.slice(PREFIX.length)) ?? -1;
}

/** グループ ID → 日本語名 (取引所カテゴリのみ。無ければ null) */
export function jaExchangeGroup(groupId: string): string | null {
  if (!isExchangeGroup(groupId)) return null;
  return CATEGORY_JA.get(groupId.slice(PREFIX.length)) ?? null;
}

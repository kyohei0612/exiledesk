/**
 * GGG の ItemClasses.Id (例 "Body Armour") → trade2 API の type_filters.category.option
 *
 * クラフト収支 (2026-09-07): 貼り付けた装備のベース名 → 装備種別 → trade2 カテゴリ を引くために追加。
 * ベース名 → 種別は `src/i18n/base-item-classes.json` (scripts/build-essences-from-client.mjs 生成)。
 * trade2 の option 値は公式トレードサイトの「アイテムカテゴリ」ドロップダウンの内部値。
 */

import baseItemClasses from "../../i18n/base-item-classes.json";

export interface BaseClassInfo {
  cls: string;
  lvl: number;
}

const BASE_CLASSES = baseItemClasses as Record<string, BaseClassInfo>;

/** 英語ベース名 → 装備種別 (無ければ null) */
export function baseClassOf(baseEn: string): BaseClassInfo | null {
  return BASE_CLASSES[baseEn] ?? null;
}

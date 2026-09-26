/**
 * poe2scout の /Items と /Leagues の応答の型
 *
 * poe2scout.ts から切り出し (2026-09-26)。
 */

// =================== 型定義 ===================

/**
 * poe2scout の /Items 1 件。CurrentPrice が poe2scout 公式の確定価格(高貴=Exalted建て)。
 * 通貨交換アイテムは ApiId を持ち、装備/ユニーク(armour/weapon等)は ApiId=null で区別できる。
 */
export interface CurrencyItem {
  ItemId: number;
  CategoryApiId: string;
  Text: string;
  Name: string | null;
  Type: string | null;
  ApiId: string | null;
  CurrentPrice: number | null;
  IconUrl: string;
}

export interface League {
  Value: string;
  IsCurrent: boolean;
  DivinePrice: number;
  ChaosDivinePrice: number;
  BaseCurrencyApiId: string;
  BaseCurrencyText: string;
  BaseCurrencyIconUrl: string;
  ExaltedCurrencyText: string;
  ExaltedCurrencyIconUrl: string;
  DivineCurrencyText: string;
  DivineCurrencyIconUrl: string;
  ChaosCurrencyText: string;
  ChaosCurrencyIconUrl: string;
}

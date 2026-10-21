/**
 * tree-hands.ts — ツリーで選べる打つ手 (2026-10-22 表面だけ。オーナー「参照する MOD は金の指輪の MOD 群だけ」→ 手も金の指輪で使う物だけ)。
 * 名前はゲームの表記 (price-keys.json の ja / en、訳さない)。手の効果はエンジン (計算を繋ぐ時に applyCurrency で打つ)、ここは並べるだけ
 */
import keys from "../../htc/price-keys.json";
import { tr } from "../../../i18n/lang";
import type { Hand, HandKind } from "./tree-model";

interface Name { ja: string; en: string }
const K = keys as unknown as { currency: Record<string, Name>; omens: Record<string, Name> };

/** 値段のキー (カレンシー・お告げ) → 画面の言語の名前 */
export const nameOfKey = (key: string): string => {
  const n = K.currency[key] ?? K.omens[key];
  return n ? tr(n.ja, n.en) : key;
};

/** 打つ手の並び (種類ごと)。kind で必ず付く結果の箱が決まる (tree-model の OUTS_OF) */
export const TREE_CURRENCIES: ReadonlyArray<{ key: string; kind: HandKind }> = [
  { key: "chaos", kind: "swap" }, { key: "chaos_greater", kind: "swap" }, { key: "chaos_perfect", kind: "swap" },
  { key: "exalt", kind: "add" }, { key: "exalt_greater", kind: "add" }, { key: "exalt_perfect", kind: "add" },
  { key: "annul", kind: "remove" },
];
export const kindOfCurrency = (key: string): HandKind => TREE_CURRENCIES.find((c) => c.key === key)?.kind ?? "add";

/** 手ごとに重ねられるお告げ (側は左右のどちらか 1 つ) */
export const SIDE_OMENS: Record<HandKind, readonly [string, string] | null> = {
  add: ["OmenofSinistralExaltation", "OmenofDextralExaltation"],
  remove: ["OmenofSinistralAnnulment", "OmenofDextralAnnulment"],
  swap: null,
};
export const CATALYSING = "OmenofCatalysingExaltation";
export const WHITTLING = "OmenofWhittling";
/** 触媒の高貴の前に品質を上げるカタリスト (金の指輪で使う物) */
export const TREE_CATALYSTS = ["catalyst_speed", "catalyst_cold", "catalyst_fire", "catalyst_lightning", "catalyst_caster"] as const;

/** 矢印に出す 1 行 (カレンシー + お告げ + カタリストの品質) */
export function handLabel(h: Hand): string {
  const parts = [nameOfKey(h.currency), ...h.omens.map(nameOfKey)];
  if (h.catalyst && h.omens.includes(CATALYSING)) parts.push(`${nameOfKey(h.catalyst)} ${h.quality}%`);
  return parts.join(" + ");
}

/**
 * tree-hands.ts — ツリーの打つ手の名前と種類 (2026-10-22)。手はクラフト台の棚から選ぶ (TreeHandShelf.vue、オーナー「下の＋も同じ感じにしてええよ」)。
 * 名前はゲームの表記 (price-keys.json・エッセンスの表の ja / en、訳さない)。手の効果はエンジン (applyCurrency)、ここは名前と種類だけ
 */
import keys from "../../htc/price-keys.json";
import { ESSENCE_KEYS, kindOf } from "../../craft-stage/engine";
import { tr } from "../../../i18n/lang";
import type { Hand, HandKind } from "./tree-model";

interface Name { ja: string; en: string }
const K = keys as unknown as { currency: Record<string, Name>; omens: Record<string, Name>; bones: Record<string, Name> };
/** 骨の手 (desecrate…) → 装飾品の骨の名前 (指輪の手だけ。部位で骨が変わる、game-names.ts の jaOfPriceKey と同じ対応) */
const BONE_OF: Record<string, string> = { desecrate: "collarbone", desecrate_ancient: "collarbone_ancient", desecrate_gnawed: "collarbone_gnawed", desecrate_altered: "collarbone_altered" };

/** 値段のキー (カレンシー・お告げ・骨・エッセンス) → 画面の言語の名前 */
export const nameOfKey = (key: string): string => {
  const n = K.currency[key] ?? K.omens[key] ?? K.bones[BONE_OF[key] ?? key] ?? (ESSENCE_KEYS as Record<string, Name>)[key];
  return n ? tr(n.ja, n.en) : key;
};

/** 手の種類 (必ず付く結果の箱が決まる、tree-model の OUTS_OF): カオス = 入れ替え、消去 = 消す、それ以外 = 足す */
export function kindOfCurrency(key: string): HandKind {
  const k = kindOf(key);
  return k === "chaos" ? "swap" : k === "annul" ? "remove" : "add";
}
/** カオススパムにできる手 (今はカオスだけ出す。同じ形で高貴・消去にも広げられる) */
export const canSpam = (key: string): boolean => kindOf(key) === "chaos";

export const CATALYSING = "OmenofCatalysingExaltation";
/** 触媒の高貴の前に品質を上げるカタリスト (金の指輪で使う物) */
export const TREE_CATALYSTS = ["catalyst_speed", "catalyst_cold", "catalyst_fire", "catalyst_lightning", "catalyst_chaos", "catalyst_caster", "catalyst_attack", "catalyst_life", "catalyst_mana", "catalyst_defences", "catalyst_physical", "catalyst_attribute"] as const;

/** 矢印に出す 1 行 (カレンシー + お告げ + カタリストの品質、繰り返しは「当たるまで」) */
export function handLabel(h: Hand): string {
  const parts = [nameOfKey(h.currency), ...h.omens.map(nameOfKey)];
  if (h.catalyst && h.omens.includes(CATALYSING)) parts.push(`${nameOfKey(h.catalyst)} ${h.quality}%`);
  const s = parts.join(" + ");
  if (!h.repeat) return s;
  return h.repeat.max ? tr(`${s} (当たるまで、${h.repeat.max} 回まで)`, `${s} (until a hit, max ${h.repeat.max})`) : tr(`${s} (当たるまで)`, `${s} (until a hit)`);
}

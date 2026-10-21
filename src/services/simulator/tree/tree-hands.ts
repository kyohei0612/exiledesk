/**
 * tree-hands.ts — ツリーの打つ手の名前と種類 (2026-10-22)。手はクラフト台の棚から選ぶ (TreeHandShelf.vue、オーナー「下の＋も同じ感じにしてええよ」)。
 * 名前は画面の側 (views/simulator/tree/tree-names.ts、クラフト台の棚と同じ nameOfKey)。手の効果はエンジン (applyCurrency)、ここは種類と並びだけ
 */
import { CATALYSTS, kindOf } from "../../craft-stage/engine";
import type { HandKind } from "./tree-model";

/** カタリスト (値段のキー catalyst_<タグ>) = 品質だけ上げる手 */
export const isCatalyst = (key: string): boolean => key.startsWith("catalyst_");
/** 手の種類 (必ず付く結果の箱が決まる、tree-model の OUTS_OF): カオス = 入れ替え、消去 = 消す、カタリスト = 品質だけ、それ以外 = 足す */
export function kindOfCurrency(key: string): HandKind {
  if (isCatalyst(key)) return "quality";
  const k = kindOf(key);
  return k === "chaos" ? "swap" : k === "annul" ? "remove" : "add";
}
/** カオススパムにできる手 (今はカオスだけ出す。同じ形で高貴・消去にも広げられる) */
export const canSpam = (key: string): boolean => kindOf(key) === "chaos";

export const CATALYSING = "OmenofCatalysingExaltation";
/** 触媒の高貴の前に品質を上げるカタリスト = エンジンの CATALYSTS の並び (値段のキー catalyst_<タグ>。前は自前の 12 個、10-23 にエンジンを軸に) */
export const TREE_CATALYSTS: readonly string[] = CATALYSTS.map((c) => `catalyst_${c.tag}`);

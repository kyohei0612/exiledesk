/**
 * tree-hands.ts — ツリーの打つ手の名前と種類 (2026-10-22)。手はクラフト台の棚から選ぶ (TreeHandShelf.vue、オーナー「下の＋も同じ感じにしてええよ」)。
 * 名前は画面の側 (views/simulator/tree/tree-names.ts、クラフト台の棚と同じ nameOfKey)。手の効果はエンジン (applyCurrency)、ここは種類と並びだけ
 */
import { CATALYSTS, kindOf } from "../../craft-stage/engine";
import type { HandKind } from "./tree-model";

/** カタリスト = 品質だけ上げる手 (エンジンの kindOf。catalyst_<タグ>・jcatalyst_<タグ>) */
export const isCatalyst = (key: string): boolean => kindOf(key) === "catalyst";
/** カタリストの種類 (タグ)。エンジンの spec/run-spec と同じ取り方 (入口に出たら置き換える、notes/2026-10-22-sim-own-logic.md の B5) */
export const catalystTagOf = (key: string): string => key.slice(key.indexOf("_") + 1);
/** 手の種類 (必ず付く結果の箱が決まる、tree-model の OUTS_OF): カオス = 入れ替え、消去 = 消す、カタリスト = 品質だけ、それ以外 = 足す */
export function kindOfCurrency(key: string): HandKind {
  if (isCatalyst(key)) return "quality";
  const k = kindOf(key);
  if (k.startsWith("essence")) return "essence";
  return k === "chaos" ? "swap" : k === "annul" ? "remove" : k === "fracture" ? "fracture" : "add";
}
/** カオススパムにできる手 (今はカオスだけ出す。同じ形で高貴・消去にも広げられる) */
export const canSpam = (key: string): boolean => kindOf(key) === "chaos";

export const CATALYSING = "OmenofCatalysingExaltation";
/**
 * アビスの反響のお告げ (発現の候補を 1 回引き直せる。エンジンの desecrate-specs、GLOSSARY)。ツリーでは冒涜 (骨) の手に付け、続けて打つ発現で使う
 * (10-22 オーナー「お告げは必ず反響を使わんとやばいよ」。棚の既定で付ける)
 */
export const ECHO = "OmenofAbyssalEchoes";
/** 骨 (冒涜) の手か */
export const isBone = (key: string): boolean => kindOf(key) === "desecrate";
/** エンジンに渡すお告げ (反響は骨には掛からないので抜く。発現は tree-sample の reveal が使う) */
export const engineOmens = (h: { omens: readonly string[] }): string[] => h.omens.filter((o) => o !== ECHO);
/** 触媒の高貴の前に品質を上げるカタリスト = エンジンの CATALYSTS の並び (値段のキー catalyst_<タグ>。前は自前の 12 個、10-23 にエンジンを軸に) */
export const TREE_CATALYSTS: readonly string[] = CATALYSTS.map((c) => `catalyst_${c.tag}`);

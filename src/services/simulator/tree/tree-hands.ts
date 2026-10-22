/**
 * tree-hands.ts — ツリーの打つ手の名前と種類 (2026-10-22)。手はクラフト台の棚から選ぶ (TreeHandShelf.vue、オーナー「下の＋も同じ感じにしてええよ」)。
 * 名前は画面の側 (views/simulator/tree/tree-names.ts、クラフト台の棚と同じ nameOfKey)。手の効果はエンジン (applyCurrency)、ここは種類と並びだけ
 */
import { CATALYSTS, kindOf } from "../../craft-stage/engine";
import { ABYSSAL_ECHO_OMEN, CATALYSING_OMEN, isCatalystKey } from "../../craft-stage/engine-sim";

/** カタリスト = 品質だけ上げる手 (エンジンの入口の isCatalystKey。catalyst_<タグ>・jcatalyst_<タグ>) */
export const isCatalyst = isCatalystKey;
/** カオススパムにできる手 (今はカオスだけ出す。同じ形で高貴・消去にも広げられる) */
export const canSpam = (key: string): boolean => kindOf(key) === "chaos";

/** 触媒の高貴のお告げ (エンジンの入口の CATALYSING_OMEN) */
export const CATALYSING = CATALYSING_OMEN;
/**
 * アビスの反響のお告げ (発現の候補を 1 回引き直せる。エンジンの desecrate-specs、GLOSSARY)。ツリーでは冒涜 (骨) の手に付け、続けて打つ発現で使う
 * (10-22 オーナー「お告げは必ず反響を使わんとやばいよ」。棚の既定で付ける)
 */
export const ECHO = ABYSSAL_ECHO_OMEN;
/** 骨 (冒涜) の手か */
export const isBone = (key: string): boolean => kindOf(key) === "desecrate";
/** エンジンに渡すお告げ (反響は骨には掛からないので抜く。発現は tree-sample の reveal が使う) */
export const engineOmens = (h: { omens: readonly string[] }): string[] => h.omens.filter((o) => o !== ECHO);
/** 触媒の高貴の前に品質を上げるカタリスト = エンジンの CATALYSTS の並び (値段のキー catalyst_<タグ>。前は自前の 12 個、10-23 にエンジンを軸に) */
export const TREE_CATALYSTS: readonly string[] = CATALYSTS.map((c) => `catalyst_${c.tag}`);

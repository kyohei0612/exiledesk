/**
 * tree-hands.ts — ツリーの打つ手の名前と種類 (2026-10-22)。手はクラフト台の棚から選ぶ (TreeHandShelf.vue、オーナー「下の＋も同じ感じにしてええよ」)。
 * 名前は画面の側 (views/simulator/tree/tree-names.ts、クラフト台の棚と同じ nameOfKey)。手の効果はエンジン (applyCurrency)、ここは種類と並びだけ
 */
import { actionClassOfKey, CATALYSTS, kindOf, OMEN_FOR, OMEN_KEY, parseKey, parseRuneKey } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";

/** カタリスト = 品質だけ上げる手 (エンジンの kindOf。catalyst_<タグ>・jcatalyst_<タグ>) */
export const isCatalyst = (key: string): boolean => kindOf(key) === "catalyst";
/** カオススパムにできる手 (今はカオスだけ出す。同じ形で高貴・消去にも広げられる) */
export const canSpam = (key: string): boolean => kindOf(key) === "chaos";
/** ルーンをはめる手 (確定の手 = 結果は打った後の 1 箱、S-31e) */
export const isRuneHand = (key: string): boolean => !!parseRuneKey(key); // 鍵の読みはエンジンの parseRuneKey
/** 耐性のフラックス = 元素を変えるだけの乱数の無い手 (S-31h、スイッチ treeFlux。説明文の部品 convertElements で見る。ルーンは上の isRuneHand) */
export const isFluxHand = (key: string): boolean => !isRuneHand(key) && actionClassOfKey(key).parts.includes("convertElements");
/** 手の窓に ☑ を出さず、当たりの箱を選ばない確定の手 (ルーン S-31e・フラックス S-31h。フラックスはスイッチ treeFlux の間だけ) */
export const isFixedHand = (key: string): boolean => isRuneHand(key) || (isFluxHand(key) && flag("treeFlux"));

/** 触媒の高貴のお告げ (名前はエンジンの OMEN_KEY、E-27) */
export const CATALYSING = OMEN_KEY.catalysing;
/**
 * アビスの反響のお告げ (発現の候補を 1 回引き直せる。エンジンの desecrate-specs、GLOSSARY)。ツリーでは冒涜 (骨) の手に付け、続けて打つ発現で使う
 * (10-22 オーナー「お告げは必ず反響を使わんとやばいよ」。棚の既定で付ける)
 */
export const ECHO = OMEN_KEY.echoes;
/** 骨 (冒涜) の手か */
export const isBone = (key: string): boolean => kindOf(key) === "desecrate";
/**
 * 手に付けたお告げを、その手に掛かる物 (now) と続けて打つ発現に掛かる物 (reveal = エンジンの OMEN_FOR.reveal、アビスの反響) に分ける (分ける式はこの 1 本。
 * 前は tree-hand-core の handOmens と engineOmens の 2 つ)。骨 (冒涜) の手に付けた反響は骨には掛からず (渡すとエンジンが弾く)、その後の発現で使う。発現の手そのものなら now
 */
export function splitOmens(key: string | null, omens: readonly string[]): { now: string[]; reveal: string[] } {
  if (key && kindOf(key) === "reveal") return { now: [...omens], reveal: [] };
  const rv = OMEN_FOR.reveal ?? [];
  return { now: omens.filter((o) => !rv.includes(o)), reveal: omens.filter((o) => rv.includes(o)) };
}
/** エンジンに渡すお告げ (発現のお告げは抜く。木の発現の手は tree-hand-core の applyHand が反響を使う) */
export const engineOmens = (h: { omens: readonly string[] }): string[] => splitOmens(null, h.omens).now;
/** 値を振り直す手 (神。エンジンの動作の部品 reroll で見る、鍵の名前では見ない) */
export const rerollsValues = (key: string): boolean => actionClassOfKey(key).parts.includes("reroll");
/** 触媒の高貴の前に品質を上げるカタリスト = エンジンの CATALYSTS の並び (値段のキー catalyst_<タグ>。前は自前の 12 個、10-23 にエンジンを軸に) */
export const TREE_CATALYSTS: readonly string[] = CATALYSTS.map((c) => `catalyst_${c.tag}`);
/**
 * 手の働き (箱の分け方を決める種類) = エンジンの動作の部品 (actionClassOfKey、E-1) から引く。鍵の文字では決めない (G-1 S-5、11-07):
 *   essence = 付く MOD が決まっている (addEssence、カレンシーの枝) / quality = カタリスト (catalyst、品質だけ) / fracture = 固定 (fracture) /
 *   remove = 消すだけ (消す) / swap = レアリティを変えずに消して乱数で付ける (remove + add = カオス) / add = それ以外 (付ける・錬金・発現・感情・性質・値)
 */
export type CurrencyEffect = "quality" | "essence" | "swap" | "remove" | "fracture" | "add";
export function effectOf(key: string): CurrencyEffect {
  const { cls, parts } = actionClassOfKey(key);
  if (parts.includes("addEssence") || parseKey(key).type === "essence") return "essence";
  if (parts.includes("catalyst")) return "quality";
  if (parts.includes("fracture")) return "fracture";
  if (cls === "remove") return "remove";
  return cls === "replace" && parts.includes("add") && !parts.includes("setRarity") ? "swap" : "add";
}
/** ☑ で当たりの MOD を選ぶ手 = 乱数で付ける・入れ替える手 (前は tree-outcome の PICK_EFFECTS と tree-hand-plan の FREE_EFFECTS の 2 つ) */
export const PICK_EFFECTS: readonly CurrencyEffect[] = ["add", "swap"];
export const picksAim = (key: string): boolean => PICK_EFFECTS.includes(effectOf(key));
/** 付きうる狙いを数える手の種類 (HandKind。前は tree-side-aims と TreeModPick の 2 つ) */
export const REACH_KINDS: readonly string[] = ["add", "swap", "spam", "essence", "fracture"];

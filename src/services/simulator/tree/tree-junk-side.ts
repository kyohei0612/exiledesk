/**
 * tree-junk-side.ts — 外れの結果を側で分ける鍵 (S-65、10-28 オーナー「狙いあり１なら3枝に増えることになるはず…ランダムなら全パターンだよね」、スイッチ junkSide)。
 * 打つ前がレアの手の 外れ・打った後・外れが消えた の箱は、打つ前と後で側ごとの MOD の数がどう変わったか (プレ +1 / サフィ +1 / プレ −1・サフィ +1 …) ごとに別の箱 (TreeBox.junkKey)。ノーマル・マジックに打つ手は 1 箱。
 * 鍵は `s:<プレの増減>|<サフィの増減>`。印の無い木の乱数のフラクチャーの鍵 (tree-frac-pick の junkKeyOf、`prefix|normal`) とは別の形
 */
import type { StageItem } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";

/** 打つ前 → 後の側の鍵 (スイッチ junkSide が閉じていれば undefined = 今までどおり 1 箱) */
export function sideKeyOf(before: StageItem, after: StageItem): string | undefined {
  if (!flag("junkSide")) return undefined;
  // 打つ前がノーマル・マジックの手 (変成・増強・王者・錬金術など) は外れ・打った後を側でも数でも分けず 1 箱 (結果がレアになる手も)。分けるのはレアに打つ手から
  // (10-28 夜オーナー「レア状態に打つまでは完全に統合まとめにしようか…マジック・ノーマルに使うカレンシーは結果全部統合で次にパスだね」)
  if (before.rarity === "normal" || before.rarity === "magic") return undefined;
  return `s:${after.prefixes.length - before.prefixes.length}|${after.suffixes.length - before.suffixes.length}`;
}
/** 側の鍵か (フラクチャーの鍵と見分ける) */
export const isSideKey = (k: string | undefined): k is string => !!k && k.startsWith("s:");

/** 箱の題の付け足し (同じ種類の箱が側で 2 つ以上の時だけ)。例「プレフィックス」「プレフィックス → サフィックス」「同じ側」 */
export function sideKeyLabel(key: string): [string, string] {
  const [p = 0, s = 0] = key.slice(2).split("|").map(Number);
  const ja = (x: "p" | "s"): string => (x === "p" ? "プレフィックス" : "サフィックス"), en = (x: "p" | "s"): string => (x === "p" ? "prefix" : "suffix");
  const from = [...(p < 0 ? ["p" as const] : []), ...(s < 0 ? ["s" as const] : [])], to = [...(p > 0 ? ["p" as const] : []), ...(s > 0 ? ["s" as const] : [])];
  if (from.length && to.length) return [`${from.map(ja).join("・")} → ${to.map(ja).join("・")}`, `${from.map(en).join(", ")} → ${to.map(en).join(", ")}`];
  const one = to.length ? to : from;
  if (one.length) return [one.map(ja).join("・"), one.map(en).join(", ")];
  return ["同じ側", "same side"];
}

/**
 * tree-hand-result.ts — 次に打つ手の窓の「結果の箱」の文 (手の種類ごと)。TreeHandShelf.vue から分けた (2026-10-27、500 行の決まり。中身は前のまま)
 */
import type { HandKind } from "../../../services/simulator/tree/tree-model";

export const RESULT: Record<HandKind, [string, string]> = {
  add: ["当たり + 外れ", "Hit + Miss"], remove: ["外れが消えた + 狙いが消えた", "Miss removed + Target lost"], swap: ["当たり + 狙いが消えた + 外れ", "Hit + Target lost + Miss"], spam: ["当たりだけ (狙いの側に空きがあれば先に高貴を 1 回、その後は当たるまでカオス)", "Hits only (an Exalted Orb first if the target's side has room, then Chaos until a hit)"], free: ["打った後 (何が付いても次へ。当たり / 外れに分けない)", "After (anything counts, no hit / miss split)"],
  quality: ["無し (品質を最大まで上げて、下の＋で次の手)", "None (raise quality to max, then add the next craft with + below)"],
  essence: ["付いた + 狙いが消えた (付く MOD は必ず付く)", "Added + Target lost (the essence mod always lands)"],
  fracture: ["印の狙いが ✦ になった (必ず印の狙いを固定)", "The marked target fractured (always fixes it)"],
  strip: ["外れが消えた (消去 1 回ごとに箱を並べ、木の箱と同じ形になった所でその段へ戻る)", "Miss removed (one box per annul, back to the step whose box has the same shape)"],
};
/** カタリストの手で「何 % まで」を決めた時 (S-31b、スイッチ catHand) */
export const RESULT_CAT: [string, string] = ["打った後 1 つ (品質を指定の % まで上げた箱)", "One result box (quality raised to the set %)"];
/** 狙いを持って着く人がいない箱では「狙いが消えた」を作らない時の文 (tree-model の setHand、tree-lost.ts) */
export const RESULT_NO_LOST: Partial<Record<HandKind, [string, string]>> = { remove: ["外れが消えた", "Miss removed"], swap: ["当たり + 外れ", "Hit + Miss"], essence: ["付いた (付く MOD は必ず付く)", "Added (the essence mod always lands)"] };

/**
 * tree-clear-hand.ts — 画面で箱の手を消す 1 本 (PC の × と手の窓の「手を消す」・スマホ・猿の口)。
 * 手を消した後、親の手の結果の「手で増えた枠」もそろえ直す: 削減の手前の枠 (S-65c ⑦、低い・同じ・高い) と
 * エッセンスと同じ MOD の箱 (S-33e ①)。11-11 オーナー「削減消したら削減で増やした枠も消えないとダメじゃね」:
 * 前は手を替えた時だけそろえ、消した時は枠が残った (未設定の札が残り続けた)
 */
import { craftStage } from "../../../state/craft-stage";
import { clearHand, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { syncSameMod } from "./tree-hand-plan";
import { syncWhittlePre } from "./tree-whittle-pre";

/** 箱 id の手 (と結果の箱・その下) を消し、親の手の結果の枠をそろえ直す */
export function clearHandAt(d: TreeDoc, id: string): void {
  const p = d.boxes[id]?.parent ?? null;
  clearHand(d, id);
  const data = craftStage.data.value;
  if (!data || !p) return;
  syncSameMod(data, d, p);
  syncWhittlePre(data, d, p, id);
}

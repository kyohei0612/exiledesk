/**
 * tree-clear-hand.ts — 画面で箱の手を消す 1 本 (PC の × と手の窓の「手を消す」・スマホ・猿の口)。
 * 手を消した後、親の手の結果の「手で増えた枠」もそろえ直す: 削減の手前の枠 (S-65c ⑦、低い・同じ・高い) と
 * エッセンスと同じ MOD の箱 (S-33e ①)。11-11 オーナー「削減消したら削減で増やした枠も消えないとダメじゃね」:
 * 前は手を替えた時だけそろえ、消した時は枠が残った (未設定の札が残り続けた)
 */
import { craftStage } from "../../../state/craft-stage";
import { clearHand, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { syncSameMod } from "./tree-same-mod-sync";
import { syncWhittlePre } from "./tree-whittle-pre";
import { syncLowTier } from "./tree-low-tier-sync";
import { flag } from "../../../web/release-flags";

/** 箱 id の手 (と結果の箱・その下) を消し、親の手の結果の枠をそろえ直す */
export function clearHandAt(d: TreeDoc, id: string): void {
  const p = d.boxes[id]?.parent ?? null;
  // 自動の消去の続きの途中の箱の手を人が消したら、その箱は空きのまま残す (自動の消去を足し直さない。上の自動と横の結果の箱の自動はそのまま。
  // S-28g ⑤ カ、スイッチ treeNoAnnulAuto。11-12 オーナー「今自動ルートの途中の結果を修正したい時、消去が全部消えちゃうから途中から手動で消して枝決めれるようにして自動処理しても」)
  const wasAuto = flag("treeNoAnnulAuto") && !!d.boxes[id]?.autoAnnul;
  clearHand(d, id);
  if (wasAuto) d.boxes[id]!.noAnnul = true;
  if (flag("junkSameHand") && d.boxes[id]) d.boxes[id]!.sameOff = true; // 手を消した箱はまた置いてもこの箱だけ (兄弟枠、S-190d)
  const data = craftStage.data.value;
  if (!data || !p) return;
  syncSameMod(data, d, p);
  syncWhittlePre(data, d, p, id);
  syncLowTier(data, d, p); // 「<狙い> 低ティア MOD」の箱も (S-33g ③、レビュワー 1 の 27)
}

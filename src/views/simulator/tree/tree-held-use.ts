/**
 * tree-held-use.ts — ヒネコラで持つ削減を枠ごとに 打つ / 打たない (S-39 ②b、スイッチ whittleBands。11-11 オーナー「削減カオスで色々選んで打つって決めた際に…
 * 打つOR打たないで決めてその決め事に応じた枠をだせばいいんじゃね」)。
 * 予見の箱が削減の手前の枠 (低い・同じ・高い) に分かれた時、枠の箱ごとに持つ削減の手を置き直す: 打つ = 手のまま、打たない = 手に noUse (結果は全部ハズレ、tree-foresee の foldMisses)
 */
import { craftStage } from "../../../state/craft-stage";
import { bandsOn } from "../../../services/simulator/tree/tree-band";
import { holdsAt } from "../../../services/simulator/tree/tree-foresee";
import { boxAims, clearHand, type Aim, type Hand, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { isWhittleHand, lvPart, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { frameHandOf, frameSiblings } from "../../../services/simulator/tree/tree-whittle-scene";
import { applyPick, kindOf, onlyOf } from "./tree-hand-plan";

/** 枠ごとの 打つ / 打たない の欄に出す枠 (予見の箱が枠に分かれ、枠の組のどれかが削減を持つ時)。use = null は手の無い枠 */
export function heldUseRows(d: TreeDoc, id: string): Array<{ id: string; lv: LvClass; use: boolean | null }> {
  if (!bandsOn() || !holdsAt(d, id) || !lvPart(d.boxes[id]?.junkKey) || !isWhittleHand(frameHandOf(d, id))) return [];
  return frameSiblings(d, id).map((b) => ({ id: b.id, lv: lvPart(b.junkKey)!, use: b.hand ? !b.hand.noUse : null })).filter((r) => !!r.lv);
}

/** 枠の箱 id に、組の削減の手を 打つ (use) / 打たない で置き直す */
export function setHeldUse(d: TreeDoc, id: string, use: boolean): void {
  const data = craftStage.data.value, b = d.boxes[id], src = frameHandOf(d, id);
  if (!data || !b || !src) return;
  const h: Hand = JSON.parse(JSON.stringify(isWhittleHand(b.hand) ? b.hand : src)) as Hand;
  if (use) delete h.noUse; else h.noUse = true;
  // 当たりの札は組の削減の手の当たりの箱と同じ (打たない枠は全部ハズレにまとまるので形だけ)
  const holder = frameSiblings(d, id).find((x) => isWhittleHand(x.hand));
  const aims: Aim[] = (holder?.outs ?? []).flatMap((o) => (d.boxes[o]?.out === "hit" ? boxAims(d.boxes[o]!).map((a) => ({ ...a })) : []));
  if (b.hand) clearHand(d, id);
  applyPick(d, id, h, kindOf(h), aims, null, onlyOf(data, d, id, h, null, aims));
}

/** 枠の既定 (11-11 オーナー「同じなら未選択 高いなら打たないをデフォで」「(低いは) うつでおｋ」): 低い = 打つ、高い = 打たない、同じ = 未選択 (決めるまで未設定) */
const DEFAULT_USE: Partial<Record<LvClass, boolean>> = { lo: true, hi: false };
/** 削減を持った時: 手の無いほかの枠に既定を入れる */
export function fillHeldDefaults(d: TreeDoc, id: string): void {
  for (const r of heldUseRows(d, id)) { const u = DEFAULT_USE[r.lv]; if (r.use === null && u !== undefined) setHeldUse(d, r.id, u); }
}

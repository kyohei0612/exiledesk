/**
 * use-row-settle.ts — 箱の置き場を、開いた時・手を足した時・消した時・箱の高さが変わった時にいつも掛け直す (位置は木から 1 つの計算 = tree-place の placeTree、S-140・S-149)。
 * 1 つ戻すの履歴には入れない (並びの微調整だけ)。x は見ない = 手で引っ張った位置は次の並べ直しまでの一時の物。
 * 木は shallowRef なので、動かしたら triggerRef で画面へ知らせる (前は座標だけ変わって画面は前の位置のままだった)。
 * 前の継ぎはぎ (settleRows・centerMerged・整列し直し・slideAll、スイッチ layoutOne の外) は R5 で消した (10-31)
 */
import { triggerRef, watch, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { EST_H } from "../../../services/simulator/tree/tree-row-tops";
import { placeTree } from "../../../services/simulator/tree/tree-place";
import type { KeptOrder } from "../../../services/simulator/tree/tree-place-order";
import { stripFoldKey } from "../../../services/simulator/tree/tree-strip-fold";

/** 箱の高さ (画面が測った値、まだなら見込み) */
export const boxHeightOf = (measure: (id: string) => number | undefined) => (id: string): number => measure(id) || EST_H;

/**
 * 木そのものの番号 (開き直しで木が入れ替わったら変わる)。同じレシピを開いたままのページで開き直すと (共有 URL をもう一度開く等)、箱の id・高さ・行き先が
 * 前の木と全部同じで下の鍵が変わらず、並べ直す前の座標のまま描かれて 3 段目の箱が手の札に重なった (11-11 ブラック 79 の絵、前からの不具合)
 */
const docNo = new WeakMap<TreeDoc, number>();
let docSeq = 0;
const noOf = (d: TreeDoc): number => { let n = docNo.get(d); if (n === undefined) { n = ++docSeq; docNo.set(d, n); } return n; };

/**
 * 組んでいる間の兄弟の順の控え (S-142g): 手を置く・戻す・打ち直すで、もう並んでいる兄弟の横の順を入れ替えない
 * (11-12 オーナー「今ついてる親の枠から子を設定した時に順番ごちゃつくのいやかも」)。木を開いた時 (レシピを開く・タブを替える・読み込み中) だけ空にして並べ直す
 */
export const placeKept: KeptOrder = new Map();

export function useRowSettle(doc: Ref<TreeDoc>, measure: (id: string) => number | undefined, chipW?: (id: string) => number | undefined, open?: { opened: Ref<number>; loading: Ref<boolean> }): void {
  const heightOf = boxHeightOf(measure);
  let seenOpen = open?.opened.value;
  watch(() => `${noOf(doc.value)}#` + Object.values(doc.value.boxes).map((b) => `${b.id}:${Math.round(measure(b.id) ?? 0)}:${b.outs.join("+")}:${b.back ?? ""}:${b.merged ? 1 : 0}:${b.hand ? 1 : 0}`).join(",") + `|${stripFoldKey(doc.value)}`, () => {
    if (!open || open.loading.value || open.opened.value !== seenOpen) { seenOpen = open?.opened.value; placeKept.clear(); }
    if (placeTree(doc.value, heightOf, chipW, placeKept)) triggerRef(doc);
  }, { flush: "post", immediate: true });
}

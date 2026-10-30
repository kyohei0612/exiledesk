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
import { stripFoldKey } from "../../../services/simulator/tree/tree-strip-fold";

/** 箱の高さ (画面が測った値、まだなら見込み) */
export const boxHeightOf = (measure: (id: string) => number | undefined) => (id: string): number => measure(id) || EST_H;

export function useRowSettle(doc: Ref<TreeDoc>, measure: (id: string) => number | undefined, chipW?: (id: string) => number | undefined): void {
  const heightOf = boxHeightOf(measure);
  watch(() => Object.values(doc.value.boxes).map((b) => `${b.id}:${Math.round(measure(b.id) ?? 0)}:${b.outs.join("+")}:${b.back ?? ""}:${b.merged ? 1 : 0}:${b.hand ? 1 : 0}`).join(",") + `|${stripFoldKey(doc.value)}`, () => { if (placeTree(doc.value, heightOf, chipW)) triggerRef(doc); }, { flush: "post", immediate: true });
}

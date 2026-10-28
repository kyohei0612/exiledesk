/**
 * use-row-settle.ts — 整列で見込みの高さで置いた行を、画面が箱の本当の高さを測った後に直す (スイッチ lineShort、services/simulator/tree/tree-row-tops)。
 * 1 つ戻すの履歴には入れない (並びの微調整だけ)。整列のまま動かしていない箱だけ動く
 */
import { watch, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { EST_H, settleRows } from "../../../services/simulator/tree/tree-row-tops";
import { flag } from "../../../web/release-flags";

/** 箱の高さ (画面が測った値、まだなら見込み) */
export const boxHeightOf = (measure: (id: string) => number | undefined) => (id: string): number => measure(id) || EST_H;

export function useRowSettle(doc: Ref<TreeDoc>, measure: (id: string) => number | undefined): void {
  if (!flag("lineShort")) return;
  const heightOf = boxHeightOf(measure);
  // 測った高さの並びが変わったら (箱が描かれた・カードの行が増えた) 行を直す
  watch(() => Object.keys(doc.value.boxes).map((id) => `${id}:${Math.round(measure(id) ?? 0)}`).join(","), () => { settleRows(doc.value, heightOf); }, { flush: "post" });
}

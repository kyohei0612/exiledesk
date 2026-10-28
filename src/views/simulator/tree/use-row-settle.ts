/**
 * use-row-settle.ts — 箱の縦の置き場を、縦の線が全部同じ長さになるようにいつも掛け直す (スイッチ lineShort、services/simulator/tree/tree-row-tops の settleRows)。
 * 1 つ戻すの履歴には入れない (並びの微調整だけ)。x は触らない。木は shallowRef なので、動かしたら triggerRef で画面へ知らせる (前は座標だけ変わって画面は前の位置のままだった)
 */
import { triggerRef, watch, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { EST_H, settleRows } from "../../../services/simulator/tree/tree-row-tops";
import { flag } from "../../../web/release-flags";

/** 箱の高さ (画面が測った値、まだなら見込み) */
export const boxHeightOf = (measure: (id: string) => number | undefined) => (id: string): number => measure(id) || EST_H;

export function useRowSettle(doc: Ref<TreeDoc>, measure: (id: string) => number | undefined): void {
  if (!flag("lineShort")) return;
  const heightOf = boxHeightOf(measure);
  // 開いた時・手を足した時・箱の高さが変わった時 (箱が描かれた・カードの行が増えた) に、いつも縦の置き場を掛け直す (整列の前から、S-68)
  watch(() => Object.values(doc.value.boxes).map((b) => `${b.id}:${Math.round(measure(b.id) ?? 0)}:${b.outs.join("+")}:${b.back ?? ""}:${b.id === "start" ? b.y : Math.round(b.y)}`).join(","), () => { if (settleRows(doc.value, heightOf)) triggerRef(doc); }, { flush: "post", immediate: true });
}

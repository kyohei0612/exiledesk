/**
 * use-tree-open.ts — 木を少しずつ描いて開く (S-196)。組み直しは tree-rebuild の rebuildInSteps
 * 途中の木は画面に出すだけで、保存も 1 つ戻すの履歴も通さない。読み終わりに 1 回だけ置く。別の木を開いたら今の読み込みは捨てる
 */
import { ref, type ShallowRef } from "vue";
import type { PatchData } from "../../../services/craft-stage/engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { rebuildInSteps } from "./tree-rebuild";

/** 開いている間 (木は触れない) */
export const treeLoading = ref(false);
let openNo = 0, openFrom: TreeDoc | null = null;

export async function openStepped(data: PatchData, tree: TreeDoc, doc: ShallowRef<TreeDoc>, start: () => void, put: (t: TreeDoc) => void): Promise<void> {
  const no = ++openNo;
  openFrom ??= doc.value;
  treeLoading.value = true; start();
  let done: TreeDoc | null = null;
  try { done = await rebuildInSteps(data, tree, (d) => { doc.value = JSON.parse(JSON.stringify(d)) as TreeDoc; }, () => no === openNo); }
  finally {
    if (no === openNo) {
      doc.value = openFrom!; openFrom = null; treeLoading.value = false;
      if (done) put(done);
    }
  }
}

/**
 * use-tree-open.ts — 木を開く (S-196)。組み直しは tree-rebuild の rebuildInSteps
 * 組み直しは途中で描かず、組み終わった木を 1 回だけ置く (PC・スマホ共通、11-10 オーナー「1回組んじゃえばおｋ」。前は 150ms ごとに途中の木を描き、
 * スマホで描き直しだけで約 1.7 秒使っていた)。組んでいる間は「レシピ読み込み中…」で全ての操作を止める (TreeLoadingCover.vue)。
 * 途中は保存も 1 つ戻すの履歴も通さない。別の木を開いたら今の読み込みは捨てる
 */
import { ref, type ShallowRef } from "vue";
import type { PatchData } from "../../../services/craft-stage/engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { rebuildInSteps } from "./tree-rebuild";
import { fromBuilt } from "../../../services/simulator/tree/tree-built";

/** 開いている間 (木は触れない。読み込み中の覆いを出す) */
export const treeLoading = ref(false);
let openNo = 0, openFrom: TreeDoc | null = null;

/** 1 コマ返す (読み込み中の覆いを先に描く)。隠れたタブでも止まらない */
const frame = (): Promise<void> => new Promise((ok) => { const t = setTimeout(ok, 100); requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); ok(); }, 0)); });

export async function openStepped(data: PatchData, tree: TreeDoc, doc: ShallowRef<TreeDoc>, start: () => void, put: (t: TreeDoc) => void): Promise<void> {
  const no = ++openNo;
  openFrom ??= doc.value;
  treeLoading.value = true; start();
  let done: TreeDoc | null = null;
  try {
    await frame();
    // 同じ組み方の版・同じ打ち方の組み上がった木の写しがあれば組み直さない (S-104b、開く速さの案 E)。無ければ・違えば今どおり組み直す
    if (no === openNo) done = fromBuilt(tree) ?? (await rebuildInSteps(data, tree, () => {}, () => no === openNo));
  } finally {
    if (no === openNo) {
      doc.value = openFrom!; openFrom = null; treeLoading.value = false;
      if (done) put(done);
    }
  }
}

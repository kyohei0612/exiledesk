/**
 * use-tree-open.ts — 木を開く (S-196)。組み直しは tree-rebuild の rebuildInSteps
 * 組み直しは途中で描かず、組み終わった木を 1 回だけ置く (PC・スマホ共通、11-10 オーナー「1回組んじゃえばおｋ」。前は 150ms ごとに途中の木を描き、
 * スマホで描き直しだけで約 1.7 秒使っていた)。組んでいる間は「レシピ読み込み中…」で全ての操作を止める (TreeLoadingCover.vue)。
 * 途中は保存も 1 つ戻すの履歴も通さない。別の木を開いたら今の読み込みは捨てる
 */
import type { ShallowRef } from "vue";
import type { PatchData } from "../../../services/craft-stage/engine";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { rebuildInSteps } from "./tree-rebuild";
import { fromBuilt, fromDailyPast, markDailyPast } from "../../../services/simulator/tree/tree-built";
import { checkOldSame } from "./tree-old-same";
import { flag } from "../../../web/release-flags";

/** 開いている間の印は tree-loading (頁の外枠からも読む軽い物、S-196f2) */
import { treeLoading } from "./tree-loading";
export { treeLoading };
let openNo = 0, openFrom: TreeDoc | null = null;

/** 1 コマ返す (読み込み中の覆いを先に描く)。隠れたタブでも止まらない */
const frame = (): Promise<void> => new Promise((ok) => { const t = setTimeout(ok, 100); requestAnimationFrame(() => setTimeout(() => { clearTimeout(t); ok(); }, 0)); });

/** fresh = 写しを使わず打ち方から今の決まりで組み直す (古いレシピの組み直し S-104e)。組めた木を返す (別の木を開いて捨てた時は null) */
export async function openStepped(data: PatchData, tree0: TreeDoc, doc: ShallowRef<TreeDoc>, start: () => void, put: (t: TreeDoc) => void, fresh = false): Promise<TreeDoc | null> {
  const tree = fresh ? (({ built: _b, oldBuilt: _o, builtZ: _z, dailyPast: _p, ...r }) => r as TreeDoc)(tree0) : tree0;
  const no = ++openNo;
  openFrom ??= doc.value;
  treeLoading.value = true; start();
  let done: TreeDoc | null = null;
  try {
    await frame();
    // 同じ組み方の版・同じ打ち方の組み上がった木の写しがあれば組み直さない (S-104b、開く速さの案 E)。無ければ・違えば今どおり組み直す
    // デイリーの順位から開く木 (提出の数 dailyPast がある木) は提出した時の写し builtZ で、版を比べず組み直さない (D-50h・S-104d)
    const past = no === openNo ? await fromDailyPast(tree) : null;
    if (no === openNo) done = past ?? fromBuilt(tree) ?? (await rebuildInSteps(data, tree, () => {}, () => no === openNo));
    if (done) markDailyPast(tree, done, !past);
  } finally {
    if (no === openNo) {
      doc.value = openFrom!; openFrom = null; treeLoading.value = false;
      if (done) put(done);
      // (スイッチ recipeFrozen、S-104g ⑥) 古い写しのまま開いた木は、裏で 1 回組み直して差が無ければ古いレシピの印を出さない
      if (done?.oldBuilt && !fresh && flag("recipeFrozen")) void checkOldSame(data, tree, doc);
    }
  }
  return no === openNo ? done : null;
}

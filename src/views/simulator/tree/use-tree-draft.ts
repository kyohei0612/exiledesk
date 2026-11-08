/**
 * use-tree-draft.ts — 要望に添える作りかけの木を、木が変わるたびに少し間を置いて受け口 (web/feedback-tree.ts の noteTreeDraft) へ書く
 * (11-08 オーナー「1おけ」: 保存せずに閉じた後や別のページから送っても辿れるように)。名前は入れない (Y-62)。上書きだけで消さない
 * (白紙の木は書かない = 離れる時の白紙化で前の木が残り、保存せずにエミュへ移ってから送っても木が付く)。ツリーのページにいる間だけ見る
 */
import { onBeforeUnmount, watch, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { noteTreeDraft } from "../../../web/feedback-tree";
import { treeCodeOf } from "../recipe-share";

/** 書くまでの間 (手を置くたびに詰め直さない) */
const WAIT_MS = 1500;

export function useTreeDraft(doc: Ref<TreeDoc>): void {
  let timer: ReturnType<typeof setTimeout> | null = null, seq = 0;
  const write = (): void => {
    timer = null;
    const d = doc.value, n = ++seq;
    // 白紙の木は書かない (消すと、離れる時の白紙化で前の木が残らない。古い木は受け口が 24 時間で添えなくなる)
    if (!d.memoAims?.length && Object.keys(d.boxes).length <= 1) return;
    void treeCodeOf({ name: "", tree: d }).then((code) => { if (n === seq) noteTreeDraft(code); }, () => { /* 詰められなくても要望は送れる */ });
  };
  watch(doc, () => { if (timer) clearTimeout(timer); timer = setTimeout(write, WAIT_MS); }, { deep: true, immediate: true });
  // 離れる時は待たずに最後の形を書く (ページの onBeforeUnmount の白紙化より先に呼ばれる = 登録の順。間を置く前に離れても手が残る、S-02)
  onBeforeUnmount(() => { if (timer) { clearTimeout(timer); write(); } });
}

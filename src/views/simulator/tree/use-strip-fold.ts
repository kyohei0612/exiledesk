/**
 * use-strip-fold.ts — 消去の続きを畳む画面の口 (S-28g ③、services/simulator/tree/tree-strip-fold.ts)。
 * 開いた / 畳んだは覚えない: 木を開いた時・タブを替えた時に畳んだ形へ戻す。足りない所・止まりへ寄る時は、その箱が畳んだ中にあれば先に開く
 */
import { computed, nextTick, watch, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { foldOf, resetStripFolds, stripChains, stripFolds, stripHidden, stripOpen, toggleStripFold } from "../../../services/simulator/tree/tree-strip-fold";

export function useStripFold(doc: Ref<TreeDoc>, opened: Ref<number>, active: Ref<number>, issueBoxes: () => readonly string[], stuckAt: () => Readonly<Record<string, number>> | null) {
  watch([opened, active], resetStripFolds, { immediate: true });
  const folds = computed(() => stripFolds(doc.value));
  const hidden = computed(() => stripHidden(doc.value, folds.value));
  /** 開いた続き (head の箱の左に「≈ 畳む」) */
  const opens = computed(() => [...stripChains(doc.value).values()].filter((f) => stripOpen.value.has(f.head)));
  /** 札に出す数: 消去の段 n・札の下に並ぶ止まった所 m (まとめて描かない箱は数えない)・中の箱の足りない所 (S-89b) と止まりの人 (S-72) */
  const countsOf = (head: string): { n: number; m: number; issues: number; stops: number } => {
    const f = folds.value.get(head), mids = new Set(f?.mids ?? []), st = stuckAt() ?? {}, d = doc.value;
    const m = (f?.stops ?? []).filter((id) => d.boxes[id] && !mergedAway(d, d.boxes[id]!)).length;
    return { n: f?.steps ?? 0, m, issues: issueBoxes().filter((id) => mids.has(id)).length, stops: [...mids].reduce((s, id) => s + (st[id] ?? 0), 0) };
  };
  /** 寄る前に、その箱を隠している続きを開く (並べ直しの後まで待つ) */
  async function openFor(id: string): Promise<void> {
    const f = foldOf(doc.value, id);
    if (!f) return;
    toggleStripFold(f.head);
    await nextTick(); await nextTick();
  }
  return { folds, hidden, opens, countsOf, openFor, toggle: toggleStripFold };
}

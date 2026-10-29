/**
 * use-strip-fold.ts — 全部消えてよい消去の直線を畳む画面の口 (S-28b、スイッチ stripFold、services/simulator/tree/tree-strip-fold.ts)。
 * 開いた / 畳んだは覚えない: 木を開いた時・タブを替えた時に畳んだ形へ戻す。足りない所・止まりへ寄る時は、その箱が畳んだ間にあれば先に開く
 */
import { computed, nextTick, watch, type Ref } from "vue";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { foldOf, resetStripFolds, stripChains, stripFolds, stripHidden, stripOpen, toggleStripFold } from "../../../services/simulator/tree/tree-strip-fold";

export function useStripFold(doc: Ref<TreeDoc>, opened: Ref<number>, active: Ref<number>, issueBoxes: () => readonly string[], stuckAt: () => Readonly<Record<string, number>> | null) {
  watch([opened, active], resetStripFolds, { immediate: true });
  const folds = computed(() => stripFolds(doc.value));
  const hidden = computed(() => stripHidden(doc.value, folds.value));
  /** 開いた直線 (間の最初の箱の左に「≈ 畳む」) */
  const opens = computed(() => [...stripChains(doc.value).values()].filter((f) => stripOpen.value.has(f.head)));
  /** 札に出す数: 間の箱の足りない所 (S-89b) と止まりの人 (S-72) */
  const countsOf = (head: string): { n: number; issues: number; stops: number } => {
    const f = folds.value.get(head), mids = new Set(f?.mids ?? []), st = stuckAt() ?? {};
    return { n: mids.size, issues: issueBoxes().filter((id) => mids.has(id)).length, stops: [...mids].reduce((s, id) => s + (st[id] ?? 0), 0) };
  };
  /** 寄る前に、その箱を隠している直線を開く (並べ直しの後まで待つ) */
  async function openFor(id: string): Promise<void> {
    const f = foldOf(doc.value, id);
    if (!f) return;
    toggleStripFold(f.head);
    await nextTick(); await nextTick();
  }
  return { folds, hidden, opens, countsOf, openFor, toggle: toggleStripFold };
}

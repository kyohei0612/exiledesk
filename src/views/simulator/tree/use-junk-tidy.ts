/**
 * use-junk-tidy.ts — ハズレ整理のボタンと案内 (S-192・S-198、スイッチ junkTidy)。整理はつなぎの 1 周 (tree-hand-plan の tidyJunk)、状態は tree-junk-tidy
 */
import { computed, ref, type Ref } from "vue";
import { guideOn, isGrayBox, tidyOn, tidyStep, unsetBoxes } from "../../../services/simulator/tree/tree-junk-tidy";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tidyJunk } from "./tree-hand-plan";

export function useJunkTidy(doc: Ref<TreeDoc>, edit: (f: (d: TreeDoc) => void) => void, go: (id: string) => void) {
  const on = computed(() => tidyOn());
  const step = computed(() => (on.value ? tidyStep(doc.value) : "check"));
  const unset = computed(() => (on.value ? unsetBoxes(doc.value) : []));
  /** 「組むに戻る」を押している間は案内を止める。木は何も変えない (一方通行にしない、S-198) */
  const paused = ref(false);
  const guide = computed(() => guideOn(doc.value) && !paused.value);
  const busy = ref(false), nth = ref(0);
  /** スタートだけの木は整理する物が無い (押せなくする、S-192) */
  const empty = computed(() => Object.keys(doc.value.boxes).length <= 1);
  /** 次に押す箱 (未設定の箱) か */
  const targets = computed(() => new Set(guide.value && step.value === "unset" ? unset.value : []));
  function press(): void {
    paused.value = false;
    if (step.value === "unset") { const l = unset.value; if (l.length) go(l[nth.value++ % l.length]!); return; }
    busy.value = true;
    // 「整理中」を先に描く
    setTimeout(() => { edit(tidyJunk); busy.value = false; nth.value = 0; const l = unset.value; if (l.length) go(l[0]!); }, 30);
  }
  return { step, unset, guide, busy, empty, press, back: () => { paused.value = true; }, grayOf: (b: TreeBox) => isGrayBox(b), dimOf: (b: TreeBox) => guide.value && !targets.value.has(b.id), targetOf: (b: TreeBox) => targets.value.has(b.id) };
}

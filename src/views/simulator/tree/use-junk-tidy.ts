/**
 * use-junk-tidy.ts — ハズレ整理のボタンと案内 (S-192・S-198)。整理はつなぎの 1 周 (tree-hand-plan の tidyJunk)、状態は tree-junk-tidy
 * 整理はハズレ整理と最終チェックの時だけ。光る箱 = 帯の数 = 未設定の箱、未設定 0 の後は最終チェックで止まる人を送り出す箱
 */
import { computed, ref, watch, type Ref } from "vue";
import { guideOn, isGrayBox, tidyOn, tidyStep, unsetBoxes } from "../../../services/simulator/tree/tree-junk-tidy";
import { NOTICE_KINDS, type CheckIssue } from "../../../services/simulator/tree/tree-check";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tidyJunk } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";
import { idealPath } from "../../../services/simulator/tree/tree-ideal-first";

export function useJunkTidy(doc: Ref<TreeDoc>, edit: (f: (d: TreeDoc) => void) => void, go: (id: string) => void, issues: Ref<CheckIssue[] | null>, passed: Ref<boolean>) {
  const on = computed(() => tidyOn());
  const raw = computed(() => (on.value ? tidyStep(doc.value) : "check"));
  const unset = computed(() => (on.value ? unsetBoxes(doc.value) : []));
  /** 「組むに戻る」を押している間は案内を止める。木は何も変えない (一方通行にしない、S-198) */
  const paused = ref(false);
  // 整理は木を変えるたびに自動なので、案内を止めた後も「ハズレ整理」のボタンは出さず「未設定 n つ」のまま (S-192、スイッチ noTidyBtn)。案内へは完成の押し直し・最終チェックで戻る
  const step = computed(() => (paused.value && raw.value === "unset" && !flag("noTidyBtn") ? "tidy" : raw.value));
  const guide = computed(() => guideOn(doc.value) && !paused.value && !passed.value);
  const busy = ref(false);
  /** スタートだけの木は整理する物が無い (押せなくする、S-192) */
  const empty = computed(() => Object.keys(doc.value.boxes).length <= 1);
  /** 最終チェックで止まる人を送り出す箱 (S-72 の原因の箱) */
  const stuck = computed(() => [...new Set((issues.value ?? []).filter((x) => !NOTICE_KINDS.includes(x.kind) && doc.value.boxes[x.boxId]).map((x) => x.boxId))]);
  /** 光る箱 */
  const targets = computed(() => new Set(!guide.value ? [] : raw.value === "unset" ? unset.value : raw.value === "check" ? stuck.value : []));
  /** 完成を押すまで灰色の箱 (組んでいる道の横の枝、S-142i、スイッチ treeIdealFirst)。未設定に数えず「次へ」でも寄らない */
  const ideal = computed(() => idealPath(doc.value));
  const idealGrayOf = (b: TreeBox): boolean => !!ideal.value?.gray.has(b.id);
  /** 帯の数も光る箱と同じ物差し (S-89b) */
  const shownIssues = computed(() => (guide.value ? (issues.value ?? []).filter((x) => targets.value.has(x.boxId)) : ideal.value ? issues.value?.filter((x) => !ideal.value!.gray.has(x.boxId)) ?? null : issues.value));
  /** 完成を押し直したら案内へ戻る */
  // noTidyBtn: 完成の箱の数で見る (前は押した印 doneNow の数で、完成を外して押し直しても印が残って数が増えず戻らなかった。戻る道は名残の「ハズレ整理」だけだった)
  watch(() => Object.values(doc.value.boxes).filter((b) => (flag("noTidyBtn") ? b.done === "main" : b.doneNow)).length, (n, was) => { if (n > was) paused.value = false; });
  /** 最終チェックが未設定で止めた時の続き。未設定が全部決まったら押し直さずに走らせる (S-190c)。「組むに戻る」・合格で捨てる */
  let resume: (() => void) | null = null;
  watch(step, (st) => { if (st === "check" && resume && !busy.value) { const f = resume; resume = null; f(); } });
  watch(guide, (g) => { if (!g) resume = null; });
  /** 整理を走らせる。未設定が残れば最初の箱へ寄って true (最終チェックはそこで止め、then があれば決まった時に続ける) */
  async function sort(then?: () => void): Promise<boolean> {
    paused.value = false; busy.value = true; resume = null;
    await new Promise((r) => setTimeout(r, 30)); // 「整理中」を先に描く
    edit(tidyJunk); busy.value = false;
    const l = unset.value;
    if (l.length) { go(l[0]!); resume = then ?? null; }
    return l.length > 0;
  }
  const settledOf = (b: TreeBox): boolean => guide.value && !!b.back && !!b.autoBack && !targets.value.has(b.id);
  const dimOf = (b: TreeBox): boolean => (guide.value && !targets.value.has(b.id) && !settledOf(b)) || idealGrayOf(b);
  return { idealGrayOf, on, step, unset, guide, busy, empty, sort, shownIssues, press: (): void => { if (step.value === "tidy") void sort(); }, back: () => { paused.value = true; }, grayOf: (b: TreeBox) => isGrayBox(b), dimOf, settledOf, targetOf: (b: TreeBox) => targets.value.has(b.id), finalLit: computed(() => guide.value && raw.value === "check" && !targets.value.size) };
}

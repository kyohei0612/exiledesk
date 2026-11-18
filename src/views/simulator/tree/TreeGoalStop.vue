<!--
  TreeGoalStop.vue — 結果のまとめの止まりの欄の「予期せぬ狙い MOD」(S-33g ②)。止まった人を「どの手の箱 → 原因」で並べる。
  オーナー 11-16「詳細ボタンだして〇段目の箱にこの手の札を刺して狙い無しの手で狙いMODが付きツリーが止まった」「詳細ボタンで止まりとして数える方で」
  「よーは箱が止まった時→原因→予期せぬかマジバグか　でいこうかなってるならいいけど」(ブラック 122 経由)。
  原因は 3 つ: 狙い無しの手で狙いが先に付いた (goalStop)・エッセンス / 合金と同じ系統が先に付いた (essStop、S-33e ⑧)・☑ した狙いが低いティアで付いた (lowStop、S-33g)。
  数えは tree-run (止まりの人数にも入っている)。行を押すとその手の箱へ寄る。もう 1 つの「木の不具合」は TreeRunReport が並べる
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { stepOf } from "../../../services/simulator/tree/tree-goal-stop";
import { useTree } from "./use-tree";
import { handLabel } from "./tree-names";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { GOAL_RETRY_MAX } from "../../../services/simulator/tree/tree-run-retry";

const props = defineProps<{ goalStop?: Record<string, number>; essStop?: Record<string, number>; lowStop?: Record<string, number> }>();
const emit = defineEmits<{ go: [id: string] }>();
const t = useTree();
const open = ref(false);
type Kind = "goal" | "ess" | "low";
const rows = computed(() => ([["goal", props.goalStop], ["ess", props.essStop], ["low", props.lowStop]] as const)
  .flatMap(([kind, m]) => Object.entries(m ?? {}).map(([id, n]) => ({ id, n, kind: kind as Kind })))
  .filter((r) => t.doc.value.boxes[r.id]?.hand).sort((a, z) => z.n - a.n));
const total = computed(() => rows.value.reduce((a, r) => a + r.n, 0));
/** 予期せぬ狙い MOD で止まった人は最初からやり直す (S-33g ②、スイッチ goalRetry): 数えは止まった回数 (やり直した分も残す) */
const RETRY = flag("goalRetry");
const hand = (id: string): string => { const h = t.doc.value.boxes[id]?.hand; return h ? handLabel(h) : ""; };
/** 1 行 = どの手の箱 → 原因 */
function line(id: string, n: number, kind: Kind): string {
  const at = tr(`${stepOf(t.doc.value, id)} 段目「${hand(id)}」`, `Step ${stepOf(t.doc.value, id)} "${hand(id)}"`), cnt = tr(`${n} ${RETRY ? "回" : "人"}`, `${n} run${n === 1 ? "" : "s"}`);
  if (kind === "ess") return tr(`${at} → 後のエッセンス / 合金と同じ系統の MOD が先に付き、打てずに止まった (${cnt})`, `${at} → added a mod of the same group as a later essence / alloy, which then couldn't be used (${cnt})`);
  if (kind === "low") return tr(`${at} → ☑ した狙いの MOD が低いティアで付き、以後この狙いが付かないので止まった (${cnt})`, `${at} → the checked target mod was added at a low tier and can no longer hit (${cnt})`);
  // スイッチ oddStop (S-21b): 偶然付いた狙いで後の手の結果に合う箱が無く止まった人もこの行 (☑ の手を通らない人もいるので文を広げる)
  if (flag("oddStop")) return tr(`${at} → 狙い無しの手で狙いの MOD が偶然付き、後の手で止まった (${cnt})`, `${at} → an untargeted craft added the target mod by chance, and a later craft stopped (${cnt})`);
  return tr(`${at} → 狙い無しの手で狙いの MOD が先に付き、☑ した手で当たりにならず止まった (${cnt})`, `${at} → an untargeted craft added the target mod early, so the checked craft didn't count it as a hit (${cnt})`);
}
</script>

<template>
  <div v-if="total" data-tree-goal-stop class="mt-1 border-t border-rose-400/25 pt-1">
    <div class="flex items-center gap-2 text-[12px] text-rose-100">
      <span class="min-w-0 flex-1 break-words"><span class="text-amber-200">{{ tr("予期せぬ狙い MOD", "Unexpected target mod") }}</span> {{ RETRY ? tr(`${total} 回 (その回は最初から作り直す、${GOAL_RETRY_MAX} 回まで)`, `${total} time${total === 1 ? "" : "s"} (that run restarts from the start, up to ${GOAL_RETRY_MAX} times)`) : tr(`${total} 人`, `${total} stopped`) }}</span>
      <button type="button" data-tree-goal-stop-more class="g-btn sm shrink-0" :aria-expanded="open" @click="open = !open">{{ open ? tr("閉じる", "Close") : tr("詳細", "Details") }}</button>
    </div>
    <template v-if="open">
      <button v-for="{ id, n, kind } in rows" :key="`${kind}${id}`" type="button" data-tree-goal-stop-row :data-kind="kind" class="block w-full break-words py-0.5 text-left text-[11px] leading-snug text-rose-200/90 underline-offset-2 hover:underline" @click="emit('go', id)">{{ line(id, n, kind) }}</button>
    </template>
  </div>
</template>

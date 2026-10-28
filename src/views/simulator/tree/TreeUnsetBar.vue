<!--
  TreeUnsetBar.vue — 木の枠の下の真ん中の帯「! 未設定 n つ ▸ 次へ」(案 B、S-89b、スイッチ unsetMark。10-28 深夜オーナー「未設定は穴と同意義で赤枠でいいと思うわ。Bで」)。
  数は箱の右上の「!」の数 = 決める事が残っている箱 (足りない所に何か出ている箱。10-28 深夜オーナー「この未定ってマーク共通にして全体」)。
  押すと上から順に 1 つずつその箱へ寄る (最後の次は最初へ)。色は足りない所と同じ赤 (未設定と穴を別の色にしない)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../../i18n/lang";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";

const props = defineProps<{ issues: readonly CheckIssue[] | null; doc: TreeDoc }>();
const emit = defineEmits<{ go: [id: string] }>();
/** 未設定の箱 (上の段から、同じ段は左から) */
const ids = computed(() => {
  const d = props.doc;
  const set = [...new Set((props.issues ?? []).filter((x) => d.boxes[x.boxId]).map((x) => x.boxId))];
  return set.sort((a, z) => d.boxes[a]!.y - d.boxes[z]!.y || d.boxes[a]!.x - d.boxes[z]!.x);
});
const at = ref(-1);
function next(): void {
  if (!ids.value.length) return;
  at.value = (at.value + 1) % ids.value.length;
  emit("go", ids.value[at.value]!);
}
</script>

<template>
  <button v-if="ids.length" type="button" data-tree-unset-bar class="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border-2 border-rose-500 bg-[#1a0f10]/95 py-1 pl-1.5 pr-3 text-[13px] font-bold text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.45)] hover:bg-[#2a1416]"
    :title="tr('手も戻りも完成も決めていない箱 (＋ が出ている箱)。押すと順にその箱へ寄る', 'Boxes with no next step, return or finish yet (the ones showing ＋). Click to jump to each in turn')" @click="next">
    <span class="flex size-5 items-center justify-center rounded-full bg-rose-600 text-[12px] text-white">!</span>
    <span>{{ tr(`未設定 ${ids.length} つ`, `${ids.length} unset`) }}</span>
    <span class="text-rose-300">{{ tr("▸ 次へ", "▸ Next") }}</span>
  </button>
</template>

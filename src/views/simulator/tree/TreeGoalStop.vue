<!--
  TreeGoalStop.vue — 結果のまとめの止まりの欄の「予期せぬ狙い MOD で止まった ○人」と詳細 (S-33g ②、スイッチ goalMetTag)。
  オーナー 11-16「詳細ボタンだして〇段目の箱にこの手の札を刺して狙い無しの手で狙いMODが付きツリーが止まった」「詳細ボタンで止まりとして数える方で」。
  数えは tree-run の goalStop (止まりの人数にも入っている)。行を押すと狙い無しの手の箱へ寄る。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { stepOf } from "../../../services/simulator/tree/tree-goal-stop";
import { useTree } from "./use-tree";
import { handLabel } from "./tree-names";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ goalStop?: Record<string, number> }>();
const emit = defineEmits<{ go: [id: string] }>();
const t = useTree();
const open = ref(false);
const rows = computed(() => Object.entries(props.goalStop ?? {}).filter(([id]) => t.doc.value.boxes[id]?.hand).sort((a, z) => z[1] - a[1]));
const total = computed(() => rows.value.reduce((a, [, n]) => a + n, 0));
const hand = (id: string): string => { const h = t.doc.value.boxes[id]?.hand; return h ? handLabel(h) : ""; };
</script>

<template>
  <div v-if="total" data-tree-goal-stop class="mt-1 border-t border-rose-400/25 pt-1">
    <div class="flex items-center gap-2 text-[12px] text-rose-100">
      <span class="min-w-0 flex-1 break-words">{{ tr(`予期せぬ狙い MOD で止まった ${total} 人`, `${total} stopped by an unexpected target mod`) }}</span>
      <button type="button" data-tree-goal-stop-more class="g-btn sm shrink-0" :aria-expanded="open" @click="open = !open">{{ open ? tr("閉じる", "Close") : tr("詳細", "Details") }}</button>
    </div>
    <template v-if="open">
      <button v-for="[id, n] in rows" :key="id" type="button" data-tree-goal-stop-row class="block w-full break-words py-0.5 text-left text-[11px] leading-snug text-rose-200/90 underline-offset-2 hover:underline" @click="emit('go', id)">{{ tr(`${stepOf(t.doc.value, id)} 段目の箱に「${hand(id)}」を置いて、狙い無しの手で狙いの MOD が付き、木が止まった (${n} 人)`, `Placing "${hand(id)}" on the step ${stepOf(t.doc.value, id)} box added a target mod with a no-target craft, and the tree stopped (${n} run${n === 1 ? "" : "s"})`) }}</button>
    </template>
  </div>
</template>

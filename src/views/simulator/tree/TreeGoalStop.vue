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

const props = defineProps<{ goalStop?: Record<string, number>; essStop?: Record<string, number> }>();
const emit = defineEmits<{ go: [id: string] }>();
const t = useTree();
const open = ref(false);
// ess = エッセンス / 合金と同じ系統が前の手で付いて打てずに止まった人 (S-33e ⑧、スイッチ essSameStop。オーナー 11-16「予期せぬ枠でだしたら？」)
const rows = computed(() => [...Object.entries(props.goalStop ?? {}).map(([id, n]) => ({ id, n, ess: false })), ...Object.entries(props.essStop ?? {}).map(([id, n]) => ({ id, n, ess: true }))].filter((r) => t.doc.value.boxes[r.id]?.hand).sort((a, z) => z.n - a.n));
const total = computed(() => rows.value.reduce((a, r) => a + r.n, 0));
const hand = (id: string): string => { const h = t.doc.value.boxes[id]?.hand; return h ? handLabel(h) : ""; };
</script>

<template>
  <div v-if="total" data-tree-goal-stop class="mt-1 border-t border-rose-400/25 pt-1">
    <div class="flex items-center gap-2 text-[12px] text-rose-100">
      <span class="min-w-0 flex-1 break-words">{{ tr(`予期せぬ狙い MOD で止まった ${total} 人`, `${total} stopped by an unexpected target mod`) }}</span>
      <button type="button" data-tree-goal-stop-more class="g-btn sm shrink-0" :aria-expanded="open" @click="open = !open">{{ open ? tr("閉じる", "Close") : tr("詳細", "Details") }}</button>
    </div>
    <template v-if="open">
      <button v-for="{ id, n, ess } in rows" :key="`${ess ? 'e' : 'g'}${id}`" type="button" data-tree-goal-stop-row class="block w-full break-words py-0.5 text-left text-[11px] leading-snug text-rose-200/90 underline-offset-2 hover:underline" @click="emit('go', id)">{{ ess ? tr(`${stepOf(t.doc.value, id)} 段目の「${hand(id)}」で、後のエッセンス / 合金と同じ系統の MOD が先に付いてしまった人です。エッセンス / 合金を打てず、止まりました (${n} 人)`, `"${hand(id)}" at step ${stepOf(t.doc.value, id)} added a mod of the same group as a later essence / alloy, so the essence / alloy couldn't be used and the run stopped (${n} run${n === 1 ? "" : "s"})`) : tr(`${stepOf(t.doc.value, id)} 段目の「${hand(id)}」で、狙いの MOD が先に付いてしまった人です。☑ した手で当たりにならず、止まりました (${n} 人)`, `"${hand(id)}" at step ${stepOf(t.doc.value, id)} added the target mod too early, so the checked craft didn't count it as a hit and the run stopped (${n} run${n === 1 ? "" : "s"})`) }}</button>
    </template>
  </div>
</template>

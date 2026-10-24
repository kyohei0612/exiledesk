<!--
  TreeFlowSteps.vue — シミュの流れ全体の 4 段の帯「1 ベース → 2 完成の MOD → 3 ツリー → 4 結果」(10-24 オーナー「今どこにいるかが分かるように」)。
  完成形の設定の窓 (TreeGoalPage) とツリーのページ (SimTreePage) の上で同じ物を出す。まだ届いていない段は押せない札 (共通の g-tab の :disabled = 灰色、178daf1b)。
  届いている段: 1 はいつも、2 はベースを選んだら、3 は完成形を決めたら (初手のページを「決めた」で閉じた後)、4 は 100 人回し終えたら (use-tree の runReady)。
  押した時の動きは置き場が決める (go で段を返す)
-->
<script setup lang="ts">
import { computed } from "vue";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";

/** current = 今いる段。noBase = まだベースを選んでいない (2 から先は押せない) */
const props = defineProps<{ current: 1 | 2 | 3 | 4; noBase: boolean }>();
const emit = defineEmits<{ go: [step: 1 | 2 | 3 | 4] }>();
const t = useTree();
const STEPS = [
  { n: 1, ja: "ベース", en: "Base" },
  { n: 2, ja: "完成の MOD", en: "Target mods" },
  { n: 3, ja: "ツリー", en: "Tree" },
  { n: 4, ja: "結果", en: "Results" },
] as const;
/** その段まで届いているか (初手のページで出している間は、決めるまでツリーへは進めない) */
const reached = computed(() => ({ 1: true, 2: !props.noBase, 3: !props.noBase && !t.goalInline.value, 4: !props.noBase && t.runReady.value }));
const why = (n: 1 | 2 | 3 | 4): string | undefined =>
  reached.value[n] ? undefined : n === 2 ? tr("先にベースを選ぶ", "Choose a base first") : n === 3 ? tr("完成の MOD を決めてから", "Set the target mods first") : tr("100 人回した後に開く", "Opens after running 100 times");
</script>

<template>
  <nav data-tree-flow class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 max-md:gap-x-1">
    <template v-for="st in STEPS" :key="st.n">
      <span v-if="st.n > 1" class="opacity-40" aria-hidden="true">→</span>
      <button type="button" :data-tree-flow-step="st.n" class="g-tab !min-h-[30px] !px-3 !text-[13px] max-md:!px-1.5 max-md:!text-[12px]" :class="current === st.n ? 'on' : ''" :disabled="!reached[st.n]" :title="why(st.n)" :aria-current="current === st.n ? 'step' : undefined" @click="emit('go', st.n)">
        {{ st.n }} {{ tr(st.ja, st.en) }}
        <span v-if="st.n === 1 && !noBase" class="ml-1 text-[11px] opacity-70 max-md:hidden">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</span>
        <span v-if="st.n === 2" class="ml-1 rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums">{{ t.goals.value.length }}</span>
      </button>
    </template>
  </nav>
</template>

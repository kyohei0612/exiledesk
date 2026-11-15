<!--
  TreeDailyPast.vue — デイリーの順位から開いた木の上の 1 行 (S-104d・D-50h): 提出した時の数 (順位と同じ)。写しが無く打ち方から組み直した木は注記も。
  打ち方が開いた時と変わったら出さない (今の決まりの木)。中身は tree-built の dailyPastOf
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { dailyPastOf } from "../../../services/simulator/tree/tree-built";
import { useTree } from "./use-tree";

const past = computed(() => dailyPastOf(useTree().doc.value));
</script>

<template>
  <p v-if="past" data-tree-daily-past class="m-0 border-l-2 border-[var(--exile-color-border-brass)] pl-2 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">
    <span class="text-[var(--exile-color-text-title)]">{{ tr(`提出した時の数: 完成 1 個あたり ${past.cost} 神・完成率 ${past.rate}% (順位と同じ)`, `At submission: ${past.cost} div per finished item, ${past.rate}% finished (same as the ranking)`) }}</span>
    <span v-if="past.rebuilt" class="ml-2">{{ tr("この木は打ち方から組み直しています。提出した時と箱の形・数が違う事があります (順位の数は提出した時の物)。", "This tree was rebuilt from its steps. Its boxes and numbers may differ from when it was submitted (the ranking shows the numbers at submission).") }}</span>
  </p>
</template>

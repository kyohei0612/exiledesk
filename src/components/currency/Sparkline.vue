<!--
  Sparkline.vue — 7 日トレンドの折れ線 + 変化率 (下落=赤 / 上昇=緑)
  CurrencyRanking.vue から切り出し (2026-09-07)。基準レート行とテーブル行で共用。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ItemTrend } from "../../api/poe2scout";
import { fmtPct, sparkPoints } from "../../views/currency/format";

const props = withDefaults(defineProps<{ trend: ItemTrend; width?: number; height?: number }>(), {
  width: 72,
  height: 20,
});
const down = computed(() => props.trend.changePct < 0);
</script>

<template>
  <div class="flex items-center justify-end gap-1" :title="`過去7日間 ${fmtPct(trend.changePct)}`">
    <svg :width="width" :height="height" viewBox="0 0 72 20" preserveAspectRatio="none" class="shrink-0 overflow-visible">
      <polyline
        :points="sparkPoints(trend.spark)"
        fill="none"
        :stroke="down ? 'var(--exile-color-signal-error)' : 'var(--exile-color-signal-success)'"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
    <span
      class="text-xs tabular-nums w-12 text-right"
      :class="down ? 'text-[var(--exile-color-signal-error)]' : 'text-[var(--exile-color-signal-success)]'"
      >{{ fmtPct(trend.changePct) }}</span
    >
  </div>
</template>

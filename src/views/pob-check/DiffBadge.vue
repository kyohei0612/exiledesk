<!--
  DiffBadge.vue — 比べる元との差 (+12.3% 緑 / −4.0% 赤 / 変化なしは出さない)
-->
<script setup lang="ts">
import { computed } from "vue";
import { diffPct } from "./fmt";

const props = defineProps<{ now: number; before?: number | null; size?: "sm" | "lg" }>();
const pct = computed(() => diffPct(props.now, props.before));
const shown = computed(() => pct.value != null && Math.abs(pct.value) >= 0.05);
</script>

<template>
  <span
    v-if="shown"
    class="inline-flex items-center rounded-full px-2 font-semibold tabular-nums"
    :class="[
      pct! > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300',
      size === 'lg' ? 'py-0.5 text-sm' : 'py-px text-[11px]',
    ]"
  >{{ pct! > 0 ? "+" : "−" }}{{ Math.abs(pct!).toFixed(1) }}%</span>
  <span v-else-if="before == null && pct == null && size === 'lg'" class="text-[11px] text-[var(--exile-color-text-tertiary)]">新しく出た</span>
</template>

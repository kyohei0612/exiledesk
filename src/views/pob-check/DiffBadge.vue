<!--
  DiffBadge.vue — 比べる元との差 (+12.3% 緑 / −4.0% 赤 / 変化なしは出さない)
  元が 0 で今は値がある (クリ率 0 → 10% など) は割合にできないので「0 → 値」を緑で出す
-->
<script setup lang="ts">
import { computed } from "vue";
import { diffPct, fmtNum } from "./fmt";

const props = defineProps<{ now: number; before?: number | null; size?: "sm" | "lg" }>();
const pct = computed(() => diffPct(props.now, props.before));
const shown = computed(() => pct.value != null && Math.abs(pct.value) >= 0.05);
/** 元が 0 で今は 0 でない (割合が出せないので「0 → 値」) */
const fromZero = computed(() => props.before === 0 && Number.isFinite(props.now) && props.now !== 0);
const sizeCls = computed(() => (props.size === "lg" ? "py-0.5 text-sm" : "py-px text-[11px]"));
</script>

<template>
  <span
    v-if="shown"
    class="inline-flex items-center rounded-full px-2 font-semibold tabular-nums"
    :class="[pct! > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300', sizeCls]"
  >{{ pct! > 0 ? "+" : "−" }}{{ Math.abs(pct!).toFixed(1) }}%</span>
  <span
    v-else-if="fromZero"
    class="inline-flex items-center rounded-full px-2 font-semibold tabular-nums"
    :class="[now > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300', sizeCls]"
  >0 → {{ fmtNum(now) }}</span>
  <span v-else-if="before == null && pct == null && size === 'lg'" class="text-[11px] text-[var(--exile-color-text-tertiary)]">新しく出た</span>
</template>

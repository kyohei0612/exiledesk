<!--
  RateHeader.vue — 基準レート帯: 神→高貴 / 神→カオス / カオス→高貴 を各行に分け、過去 7 日グラフ + %
  CurrencyRanking.vue から切り出し (2026-09-07)。3 行は同型なので rows 配列で描画。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ItemTrend } from "../../api/poe2scout";
import { fmt } from "../../views/currency/format";
import Sparkline from "./Sparkline.vue";

const props = defineProps<{
  divinePrice: number;
  chaosDivinePrice: number;
  divineIcon: string;
  chaosIcon: string;
  exaltedIcon: string;
  divineVsExalted: ItemTrend | null;
  divineVsChaos: ItemTrend | null;
  chaosVsExalted: ItemTrend | null;
}>();

interface RateRow {
  key: string;
  fromIcon: string;
  fromLabel: string;
  value: number;
  toIcon: string;
  toLabel: string;
  trend: ItemTrend | null;
  /** 3 行目 (カオス→高貴) は補助扱いで淡色 */
  muted: boolean;
}
const rows = computed<RateRow[]>(() => [
  {
    key: "d-e",
    fromIcon: props.divineIcon,
    fromLabel: "神",
    value: props.divinePrice,
    toIcon: props.exaltedIcon,
    toLabel: "高貴",
    trend: props.divineVsExalted,
    muted: false,
  },
  {
    key: "d-c",
    fromIcon: props.divineIcon,
    fromLabel: "神",
    value: props.chaosDivinePrice,
    toIcon: props.chaosIcon,
    toLabel: "カオス",
    trend: props.divineVsChaos,
    muted: false,
  },
  // このリーグはカオス > 高貴。数値 3.1 はこの向きで出る
  {
    key: "c-e",
    fromIcon: props.chaosIcon,
    fromLabel: "カオス",
    value: props.divinePrice / props.chaosDivinePrice,
    toIcon: props.exaltedIcon,
    toLabel: "高貴",
    trend: props.chaosVsExalted,
    muted: true,
  },
]);
</script>

<template>
  <div class="mb-4 px-4 py-2.5 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)]">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)] font-display">基準レート</span>
      <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">過去7日</span>
    </div>
    <div v-if="divinePrice > 1" class="flex flex-col gap-1.5">
      <div
        v-for="r in rows"
        :key="r.key"
        class="flex items-center gap-1 text-sm tabular-nums"
        :class="r.muted ? 'text-[var(--exile-color-text-secondary)]' : ''"
      >
        <span class="text-[var(--exile-color-text-secondary)]">1</span>
        <img v-if="r.fromIcon" :src="r.fromIcon" :alt="r.fromLabel" :class="r.muted ? 'w-4 h-4' : 'w-5 h-5'" class="object-contain" loading="lazy" />
        <span class="text-[10px] text-[var(--exile-color-text-secondary)]">{{ r.fromLabel }}</span>
        <span class="text-[var(--exile-color-text-secondary)]">=</span>
        <span :class="r.muted ? 'text-[var(--exile-color-text-primary)]' : 'text-[var(--exile-color-accent-focus)] font-semibold'">{{ fmt(r.value) }}</span>
        <img v-if="r.toIcon" :src="r.toIcon" :alt="r.toLabel" class="w-4 h-4 object-contain" loading="lazy" />
        <span class="text-[10px] text-[var(--exile-color-text-secondary)]">{{ r.toLabel }}</span>
        <Sparkline v-if="r.trend && r.trend.spark.length >= 2" :trend="r.trend" :width="60" :height="16" class="ml-2" />
      </div>
    </div>
    <span v-else class="text-sm text-[var(--exile-color-text-tertiary)] italic">神価格は未確定（1 神 = 1 高貴 仮置き）</span>
  </div>
</template>

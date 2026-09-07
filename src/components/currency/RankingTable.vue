<!--
  RankingTable.vue — 1 アイテム = 1 行、神 / 高貴 / カオスの 3 換算 + 過去 7 日 (オーナー指示 2026-06-03)
  CurrencyRanking.vue から切り出し (2026-09-07)。行ホバーは親へ emit (効果カード表示用)。
-->
<script setup lang="ts">
import type { ItemTrend, RankedItem } from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import { effectFor, fmt } from "../../views/currency/format";
import Sparkline from "./Sparkline.vue";

defineProps<{
  rows: RankedItem[];
  divineIcon: string;
  chaosIcon: string;
  exaltedIcon: string;
  loading7d: boolean;
  rowTrend: (p: RankedItem) => ItemTrend | undefined;
}>();
const emit = defineEmits<{ hover: [p: RankedItem, ev: MouseEvent]; move: [ev: MouseEvent]; leave: [] }>();
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden">
    <table class="w-full text-base">
      <thead class="bg-[var(--exile-color-bg-surface)] text-xs uppercase tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th class="text-left px-3 py-3 whitespace-nowrap">#</th>
          <th class="text-left px-3 py-3 whitespace-nowrap">アイテム</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">神 換算</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">高貴 換算</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">カオス 換算</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">
            過去7日間<span v-if="loading7d" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)] normal-case">読込中…</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(p, i) in rows"
          :key="p.apiId"
          class="border-t border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)] transition"
          @mouseenter="(ev) => emit('hover', p, ev)"
          @mousemove="(ev) => emit('move', ev)"
          @mouseleave="emit('leave')"
        >
          <td class="px-3 py-3 text-[var(--exile-color-text-secondary)] tabular-nums whitespace-nowrap">{{ i + 1 }}</td>
          <td class="px-3 py-3 whitespace-nowrap">
            <div class="flex items-center gap-2 whitespace-nowrap" :class="effectFor(p) ? 'cursor-help' : ''">
              <img v-if="p.icon" :src="p.icon" :alt="p.text" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
              <span
                class="text-[var(--exile-color-text-primary)]"
                :class="effectFor(p) ? 'underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4' : ''"
                >{{ jaCurrency(p.text) }}</span
              >
            </div>
          </td>
          <td class="px-2 py-3 text-right">
            <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
              <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(p.divinePrice) }}</span>
              <img v-if="divineIcon" :src="divineIcon" alt="神" class="w-5 h-5 object-contain" loading="lazy" />
            </div>
          </td>
          <td class="px-2 py-3 text-right">
            <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
              <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(p.exaltedPrice) }}</span>
              <img v-if="exaltedIcon" :src="exaltedIcon" alt="高貴" class="w-5 h-5 object-contain" loading="lazy" />
            </div>
          </td>
          <td class="px-2 py-3 text-right">
            <div class="flex items-center justify-end gap-1 text-sm tabular-nums">
              <span class="text-[var(--exile-color-accent-focus)]">{{ fmt(p.chaosPrice) }}</span>
              <img v-if="chaosIcon" :src="chaosIcon" alt="カオス" class="w-5 h-5 object-contain" loading="lazy" />
            </div>
          </td>
          <td class="px-2 py-3">
            <Sparkline v-if="rowTrend(p) && rowTrend(p)!.spark.length >= 2" :trend="rowTrend(p)!" class="gap-2" />
            <div v-else class="text-right text-xs text-[var(--exile-color-text-tertiary)] pr-1">—</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

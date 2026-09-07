<!--
  BaseListCard.vue — ベース別使用率カード (アミュレット / 指輪 のみ)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。人数ベース、人数降順。
-->
<script setup lang="ts">
import BaseCard from "../decor/BaseCard.vue";
import type { BaseEntry } from "../../services/craft-v2/types";

defineProps<{
  bases: BaseEntry[];
  total: number;
  lowCount: number;
  slotLabel: string;
  pct: (count: number) => string;
  orderClass: string;
}>();
const showLowCount = defineModel<boolean>("showLowCount", { required: true });
</script>

<template>
  <BaseCard :class="orderClass">
    <div class="p-4 pl-5">
      <div class="flex items-baseline justify-between mb-2">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2">
          <span
            class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold leading-none bg-[#6AA0B8]/25 text-[#9CC9DA] ring-1 ring-[#6AA0B8]/50"
            aria-hidden="true"
            >B</span
          >
          <span>ベース</span>
          <span class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]">{{ slotLabel }} / 人数降順</span>
        </h2>
        <span class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]">n={{ total }}</span>
      </div>
      <ul class="space-y-1">
        <li
          v-for="(b, i) in bases"
          :key="'base-' + i + '-' + b.nameEn"
          class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-[var(--exile-color-bg-elevated)]"
        >
          <span
            class="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none bg-[#6AA0B8]/25 text-[#9CC9DA] ring-1 ring-[#6AA0B8]/50"
            aria-label="ベース"
            >B</span
          >
          <span class="truncate text-[13px]" :title="b.name">{{ b.name }}</span>
          <span class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)] group-hover:text-[var(--exile-color-accent-focus)]">
            {{ b.count }}人
            <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">({{ pct(b.count) }})</span>
          </span>
        </li>
        <li v-if="total === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">該当ベースなし</li>
        <li v-if="lowCount > 0" class="pt-1">
          <button
            type="button"
            @click.stop="showLowCount = !showLowCount"
            class="text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
          >
            {{ showLowCount ? `▲ 5 人以下を隠す` : `▼ もっと見る (5 人以下 ${lowCount} 件)` }}
          </button>
        </li>
      </ul>
    </div>
  </BaseCard>
</template>

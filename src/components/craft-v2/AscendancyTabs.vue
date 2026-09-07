<!--
  AscendancyTabs.vue — アセンダンシータブ (横並び、使用率併記、取得中は小プログレスバー)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
-->
<script setup lang="ts">
import type { AggregatedAscendancy } from "../../services/craft-v2/types";
import { craftV2Store } from "../../state/craft-v2-store";
import { TARGET_ASCENDANCY_COUNT } from "../../views/craft-v2/helpers";

defineProps<{ sortedAscendancies: AggregatedAscendancy[] }>();
const activeAscendancyId = defineModel<string>("activeAscendancyId", { required: true });
const store = craftV2Store;
</script>

<template>
  <nav
    v-if="store.ascendancies.length > 0"
    class="shrink-0 flex flex-wrap gap-1.5 mb-4 pt-2 pb-3 border-b border-[var(--exile-color-border-subtle)] overflow-x-auto"
    role="tablist"
    aria-label="アセンダンシー切替"
  >
    <button
      v-for="asc in sortedAscendancies"
      :key="asc.id"
      type="button"
      role="tab"
      :aria-selected="asc.id === activeAscendancyId"
      @click="activeAscendancyId = asc.id"
      :class="[
        'group relative flex flex-col items-stretch gap-1 px-3 py-2 border rounded transition-colors font-display tracking-[0.05em] text-[13px] shrink-0',
        asc.id === activeAscendancyId
          ? 'border-[var(--exile-color-accent-focus)] bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]'
          : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-primary)] hover:border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)]',
      ]"
      :title="
        !store.backgroundRefresh && asc.fetchProgress && asc.fetchProgress.done < asc.fetchProgress.total
          ? `${asc.fetchProgress.done} / ${asc.fetchProgress.total} キャラ取得中`
          : asc.name
      "
    >
      <span class="flex items-center gap-2">
        <span class="text-lg leading-none" aria-hidden="true">{{ asc.icon }}</span>
        <span class="leading-none">{{ asc.name }}</span>
        <span
          class="leading-none text-[11px] tabular-nums"
          :class="asc.id === activeAscendancyId ? 'text-[var(--exile-color-accent-focus-hover)]' : 'text-[var(--exile-color-text-secondary)]'"
          >{{ asc.usagePercent.toFixed(1) }}%</span
        >
      </span>
      <!-- タブ毎の小プログレスバー (N/M キャラ取得中のみ) -->
      <span
        v-if="!store.backgroundRefresh && asc.fetchProgress && asc.fetchProgress.done < asc.fetchProgress.total"
        class="flex items-center gap-1.5 text-[10px] tabular-nums text-[var(--exile-color-text-secondary)]"
      >
        <span class="flex-1 h-1 rounded-full overflow-hidden bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)]" aria-hidden="true">
          <span
            class="block h-full bg-[var(--exile-color-accent-focus)] transition-[width] duration-300 ease-out"
            :style="{ width: asc.fetchProgress.total > 0 ? (asc.fetchProgress.done / asc.fetchProgress.total) * 100 + '%' : '0%' }"
          ></span>
        </span>
        <span>{{ asc.fetchProgress.done }}/{{ asc.fetchProgress.total }}</span>
      </span>
    </button>
    <!-- 未到着分の取得中インジケータ -->
    <span
      v-if="store.loading && !store.backgroundRefresh && store.ascendancies.length < TARGET_ASCENDANCY_COUNT"
      class="inline-flex items-center gap-1.5 px-3 py-2 text-[11px] text-[var(--exile-color-text-secondary)] italic"
    >
      <span class="inline-block w-2 h-2 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse" aria-hidden="true"></span>
      残り取得中…
    </span>
  </nav>
</template>

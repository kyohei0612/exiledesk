<!--
  AscendancyTabs.vue — アセンダンシータブ (横並び、使用率併記、取得中は小プログレスバー)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
  2026-09-29: 見た目をビルドのカード (BuildTabs) にそろえた。錬金術記号の飾りはやめ、取得中の進みはタブの下の細い線に。
-->
<script setup lang="ts">
import type { AggregatedAscendancy } from "../../services/craft-v2/types";
import { craftV2Store } from "../../state/craft-v2-store";
import { TARGET_ASCENDANCY_COUNT } from "../../views/craft-v2/helpers";

defineProps<{ sortedAscendancies: AggregatedAscendancy[] }>();
const activeAscendancyId = defineModel<string>("activeAscendancyId", { required: true });
const store = craftV2Store;
/** このアセンダンシーを手前で取っている途中か */
function loadingOf(asc: AggregatedAscendancy): boolean {
  const fp = asc.fetchProgress;
  return store.loading && !store.backgroundRefresh && !!fp && fp.total > 0 && fp.done < fp.total;
}
</script>

<template>
  <nav
    v-if="store.ascendancies.length > 0"
    class="mb-3 flex flex-wrap gap-1.5 border-b border-white/10 pb-3"
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
        'relative overflow-hidden rounded-lg px-3 py-1.5 text-left text-[13px] font-bold transition',
        asc.id === activeAscendancyId ? 'bg-white/15 text-white ring-2 ring-white/60' : 'bg-white/[0.03] text-white/60 ring-1 ring-white/10 hover:text-white hover:ring-white/25',
      ]"
      :title="loadingOf(asc) ? `${asc.fetchProgress!.done} / ${asc.fetchProgress!.total} 人 取得中` : asc.name"
    >
      {{ asc.name }}
      <span class="ml-1 text-[11px] font-normal tabular-nums" :class="asc.id === activeAscendancyId ? 'text-white/70' : 'text-white/40'"
        >{{ asc.usagePercent.toFixed(1) }}%</span
      >
      <!-- 取得中はタブの下に細い線で進み -->
      <span v-if="loadingOf(asc)" class="absolute inset-x-0 bottom-0 h-0.5 bg-white/10" aria-hidden="true">
        <span
          class="block h-full bg-[var(--exile-color-accent-focus)] transition-[width] duration-300 ease-out"
          :style="{ width: (asc.fetchProgress!.done / asc.fetchProgress!.total) * 100 + '%' }"
        ></span>
      </span>
    </button>
    <!-- まだ来ていないアセンダンシー -->
    <span
      v-if="store.loading && !store.backgroundRefresh && store.ascendancies.length < TARGET_ASCENDANCY_COUNT"
      class="self-center px-2 text-[11px] text-white/40"
    >
      あと {{ TARGET_ASCENDANCY_COUNT - store.ascendancies.length }} つ取得中…
    </span>
  </nav>
</template>

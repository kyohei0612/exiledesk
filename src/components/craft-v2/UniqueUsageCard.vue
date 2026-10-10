<!--
  UniqueUsageCard.vue — ユニーク使用率カード (スロット別、人数降順、ホバーで MOD オーバーレイ、クリックで trade2)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
-->
<script setup lang="ts">
import Disclosure from "../ui/Disclosure.vue";
import BaseCard from "../decor/BaseCard.vue";
import type { UniqueUsage } from "../../services/craft-v2/types";
import { uniqueArt } from "../../services/assets/unique-art";

defineProps<{
  /** 表示するユニーク (低カウント折りたたみ適用後) */
  uniques: UniqueUsage[];
  total: number;
  lowCount: number;
  /** 折りたたむ人数 (この人数以下) */
  lowLimit: number;
  slotLabel: string;
  /** レアに表示すべき MOD が無いスロット = ユニーク優位 (バッジ + 最上段) */
  isMostlyUniqueSlot: boolean;
  topUniqueCount: number;
  topUniqueName: string;
  orderClass: string;
}>();
const showLowCount = defineModel<boolean>("showLowCount", { required: true });
const emit = defineEmits<{
  hover: [u: UniqueUsage, ev: MouseEvent];
  move: [ev: MouseEvent];
  leave: [];
  select: [u: UniqueUsage];
}>();
</script>

<template>
  <BaseCard :class="orderClass">
    <div class="p-4 pl-5">
      <div class="flex items-baseline justify-between mb-2">
        <h2 class="text-sm font-bold text-amber-100 flex items-center gap-2">
          <span
            class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold leading-none bg-[#D6B98A]/25 text-[#E8D2A4] ring-1 ring-[#D6B98A]/50"
            aria-hidden="true"
            >U</span
          >
          <span>ユニーク使用率</span>
          <span class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]">{{ slotLabel }} / 人数降順</span>
          <span
            v-if="isMostlyUniqueSlot"
            class="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-[var(--exile-color-accent-focus)]/15 text-[var(--exile-color-accent-focus)] ring-1 ring-[var(--exile-color-accent-focus)]/40"
            :title="topUniqueName ? `最多採用: ${topUniqueName}` : ''"
            >採用率優位 · 最高 {{ topUniqueCount }} 人</span
          >
        </h2>
        <span class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]">n={{ total }}</span>
      </div>
      <ul class="space-y-1">
        <li
          v-for="(u, i) in uniques"
          :key="'uniq-' + i + '-' + u.nameEn"
          class="group grid grid-cols-[auto_1fr_auto] items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-[var(--exile-color-bg-elevated)] cursor-pointer"
          @mouseenter="(ev) => emit('hover', u, ev)"
          @mousemove="(ev) => emit('move', ev)"
          @mouseleave="emit('leave')"
          @click="emit('select', u)"
        >
          <!-- 2026-09-29: ゲーム内の絵 (画像パック)。無ければ poe.ninja のアイコン -->
          <img v-if="uniqueArt(u.nameEn) || u.icon" :src="uniqueArt(u.nameEn) || u.icon" :alt="u.nameEn" class="w-10 h-10 object-contain shrink-0 rounded bg-black/30" loading="lazy" referrerpolicy="no-referrer" />
          <span
            v-else
            class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold leading-none bg-[#D6B98A]/25 text-[#E8D2A4] ring-1 ring-[#D6B98A]/50"
            aria-hidden="true"
            >U</span
          >
          <span class="truncate text-[13px] text-rarity-unique">{{ u.name }}</span>
          <span class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)] group-hover:text-[var(--exile-color-accent-focus)]">
            {{ u.count }}人
            <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">({{ Math.round(u.percentage * 100) }}%)</span>
          </span>
        </li>
        <li v-if="total === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">{{ slotLabel }}にユニーク装備なし</li>
        <li v-if="lowCount > 0" class="pt-1">
          <Disclosure v-model:open="showLowCount" :rest="lowCount" class="text-[11px]" @click.stop>{{ lowLimit }} 人以下 ·</Disclosure>
        </li>
      </ul>
    </div>
  </BaseCard>
</template>

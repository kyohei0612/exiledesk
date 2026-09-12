<!--
  SkillUsageCard.vue — 主流スキル (2026-09-12)
  poe.ninja のキャラ JSON `skills[]` (スキルグループ = メインジェム + サポート) を人数で集計した物を、
  アクティブスキル / スピリット (persistent) に分けて表示する。判定は gems-client.json (GGG クライアント由来)。
  「主力」= そのキャラで poe.ninja の DPS が最大だったグループのスキル。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCard from "../decor/BaseCard.vue";
import type { SkillUsage } from "../../services/craft-v2/types";
import { LOW_COUNT_THRESHOLD } from "../../views/craft-v2/helpers";

const props = defineProps<{
  skills: SkillUsage[];
  sampleSize: number;
}>();
const showLow = ref(false);
const expanded = ref<Record<string, boolean>>({});

const active = computed(() => props.skills.filter((s) => !s.spirit));
const spirit = computed(() => props.skills.filter((s) => s.spirit));
const visible = (list: SkillUsage[]): SkillUsage[] => (showLow.value ? list : list.filter((s) => s.count >= LOW_COUNT_THRESHOLD));
const lowCount = computed(() => props.skills.filter((s) => s.count < LOW_COUNT_THRESHOLD).length);
const pct = (n: number): string => (props.sampleSize > 0 ? `${Math.round((n / props.sampleSize) * 100)}%` : "");
</script>

<template>
  <div class="flex flex-col gap-4">
    <BaseCard v-for="sec in [{ key: 'active', label: 'アクティブスキル', list: visible(active), icon: '✦' }, { key: 'spirit', label: 'スピリット (永続)', list: visible(spirit), icon: '◈' }]" :key="sec.key">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2">
            <span aria-hidden="true">{{ sec.icon }}</span>
            <span>{{ sec.label }}</span>
            <span class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]">人数降順 · 主力 = DPS 最大のグループ</span>
          </h2>
          <span class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]">n={{ sec.list.length }}</span>
        </div>
        <ul class="space-y-1">
          <li v-for="s in sec.list" :key="s.nameEn" class="py-1 px-1 -mx-1 rounded hover:bg-[var(--exile-color-bg-elevated)]">
            <div class="grid grid-cols-[1fr_auto_auto] items-baseline gap-3">
              <button type="button" class="text-left truncate text-[13px]" :title="s.nameEn" @click="expanded[s.nameEn] = !expanded[s.nameEn]">
                <span>{{ s.name }}</span>
                <span v-if="s.meta" class="ml-1 text-[10px] px-1 rounded bg-[#9B7BCC]/25 text-[#C7A7E5]">メタ</span>
                <span class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ expanded[s.nameEn] ? "▲" : "▼ サポート" }}</span>
              </button>
              <span class="shrink-0 tabular-nums text-[11px] text-[var(--exile-color-text-secondary)]">
                主力 {{ s.mainCount }}人
              </span>
              <span class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)]">
                {{ s.count }}人 <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">({{ pct(s.count) }})</span>
              </span>
            </div>
            <div v-if="expanded[s.nameEn]" class="ml-4 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)]">
              <span v-if="s.supports.length === 0" class="text-[var(--exile-color-text-tertiary)]">サポートなし</span>
              <span v-for="sp in s.supports.slice(0, 10)" :key="sp.nameEn" :title="sp.nameEn" class="tabular-nums">
                {{ sp.name }}<span class="text-[var(--exile-color-text-tertiary)]">×{{ sp.count }}</span>
              </span>
            </div>
          </li>
          <li v-if="sec.list.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">
            {{ skills.length === 0 ? "スキルのデータがまだありません (更新で取り直すと入ります)" : "該当なし" }}
          </li>
        </ul>
      </div>
    </BaseCard>
    <div v-if="lowCount > 0" class="px-1">
      <button type="button" class="text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums" @click="showLow = !showLow">
        {{ showLow ? "▲ 5 人以下を隠す" : `▼ もっと見る (5 人以下 ${lowCount} 件)` }}
      </button>
    </div>
  </div>
</template>

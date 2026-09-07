<!--
  ModListCard.vue — プレフィックス / サフィックスの MOD 一覧カード (共通)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。元は P / S で 100 行ずつ同型のブロックだった。
-->
<script setup lang="ts">
import { computed } from "vue";
import BaseCard from "../decor/BaseCard.vue";
import type { AffixKind, ModEntry } from "../../services/craft-v2/types";

const props = defineProps<{
  affix: AffixKind;
  /** 表示する MOD (低カウント折りたたみ適用後) */
  mods: ModEntry[];
  /** 折りたたみ前の総数 (n= 表示) */
  total: number;
  /** 折りたたまれている低カウント MOD 数 (もっと見るボタン) */
  lowCount: number;
  selectedCount: number;
  isSelected: (mod: ModEntry) => boolean;
  isDisabled: (mod: ModEntry) => boolean;
  tierIdx: (mod: ModEntry) => number;
  pct: (count: number) => string;
  /** flex order 用 (ユニーク優位スロットで並び替え) */
  orderClass: string;
}>();
const showLowCount = defineModel<boolean>("showLowCount", { required: true });
const emit = defineEmits<{ toggle: [mod: ModEntry]; setTier: [mod: ModEntry, idx: number] }>();

const isPrefix = computed(() => props.affix === "P");
const label = computed(() => (isPrefix.value ? "プレフィックス" : "サフィックス"));
const ariaLabel = computed(() => (isPrefix.value ? "接頭辞" : "接尾辞"));
const badge = computed(() =>
  isPrefix.value ? "bg-[#9B7BCC]/25 text-[#C7A7E5] ring-1 ring-[#9B7BCC]/50" : "bg-[#B8956A]/25 text-[#D6B98A] ring-1 ring-[#B8956A]/50",
);
</script>

<template>
  <BaseCard :class="orderClass">
    <div class="p-4 pl-5">
      <div class="flex items-baseline justify-between mb-2">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-center gap-2">
          <span :class="['inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold leading-none', badge]" aria-hidden="true">{{ affix }}</span>
          <span>{{ label }}</span>
          <span class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]">人数降順</span>
        </h2>
        <span class="text-[11px] tabular-nums text-[var(--exile-color-text-secondary)]">n={{ total }}</span>
      </div>
      <ul class="space-y-1">
        <li
          v-for="(mod, i) in mods"
          :key="affix + '-' + i + '-' + mod.rawTemplate"
          class="group cursor-pointer grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-3 py-1 px-1 -mx-1 rounded transition-colors hover:bg-[var(--exile-color-bg-elevated)]"
          :class="isSelected(mod) ? 'bg-[var(--exile-color-bg-elevated)] ring-1 ring-[var(--exile-color-accent-focus)]/40' : ''"
          @click="emit('toggle', mod)"
          :title="`クリックで選択 / 解除 (現在 ${selectedCount} 件選択中)`"
        >
          <input
            type="checkbox"
            :checked="isSelected(mod)"
            :disabled="isDisabled(mod)"
            @click.stop="emit('toggle', mod)"
            class="w-3.5 h-3.5 accent-[var(--exile-color-accent-focus)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="MOD を選択"
          />
          <span :class="['shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none', badge]" :aria-label="ariaLabel">{{ affix }}</span>
          <span class="truncate text-[13px]" :title="mod.text">
            {{ mod.text }}
            <span v-if="mod.inferredTier" class="ml-1 text-[10px] text-[var(--exile-color-accent-focus)] tabular-nums" title="平均値から推定ティア (T1 が最高)"
              >T{{ mod.inferredTier }}</span
            >
          </span>
          <span class="shrink-0 tabular-nums text-[12px] text-[var(--exile-color-text-secondary)] group-hover:text-[var(--exile-color-accent-focus)]">
            {{ mod.count }}人
            <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">({{ pct(mod.count) }})</span>
          </span>
          <!-- ティアドロップダウン (選択中のみ) -->
          <select
            v-if="isSelected(mod) && mod.tiers && mod.tiers.length > 0"
            :value="tierIdx(mod)"
            @click.stop
            @change="(ev) => emit('setTier', mod, Number((ev.target as HTMLSelectElement).value))"
            class="shrink-0 text-[11px] tabular-nums bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] rounded px-1 py-0.5 text-[var(--exile-color-text-primary)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
            title="このMODのティア下限値を trade2 検索に適用 (T1=最強)"
          >
            <option :value="-1">デフォ (制限なし)</option>
            <option v-for="(t, ti) in mod.tiers" :key="ti" :value="ti">{{ t.label }}</option>
          </select>
          <span v-else-if="isSelected(mod)" class="shrink-0 text-[10px] text-[var(--exile-color-text-tertiary)] italic" title="bundle に該当なし / ティア情報無し"
            >ティア無</span
          >
          <span v-else class="shrink-0"></span>
        </li>
        <li v-if="total === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">該当 MOD なし</li>
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

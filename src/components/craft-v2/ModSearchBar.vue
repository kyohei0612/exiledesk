<!--
  ModSearchBar.vue — MOD 選択数 / すべて解除 / 一括ティア / trade2 検索ボタン (固定エリア)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
-->
<script setup lang="ts">
defineProps<{ selectedCount: number; searching: boolean }>();
/** 一括ティア dropdown の値 (0 = 制限なし) */
const bulkTierValue = defineModel<number>("bulkTierValue", { required: true });
const emit = defineEmits<{ clear: []; applyBulkTier: []; search: [] }>();
</script>

<template>
  <div
    class="shrink-0 mb-3 flex items-center gap-3 px-3 py-2 rounded border border-[var(--exile-color-accent-focus)]/50 bg-[var(--exile-color-bg-elevated)] shadow-md"
  >
    <span v-if="selectedCount > 0" class="text-[13px] tabular-nums text-[var(--exile-color-accent-focus)]">{{ selectedCount }} 件選択中</span>
    <span v-else class="text-[13px] text-[var(--exile-color-text-secondary)]">MOD をチェックして trade2 で検索 →</span>
    <button
      v-if="selectedCount > 0"
      type="button"
      @click="emit('clear')"
      class="text-[12px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)] underline"
    >
      すべて解除
    </button>
    <div class="flex-1"></div>
    <div v-if="selectedCount > 0" class="flex items-center gap-1.5" title="選択中の全 MOD のティアを一括設定">
      <label class="text-[11px] text-[var(--exile-color-text-secondary)]">一括ティア</label>
      <select
        v-model.number="bulkTierValue"
        @change="emit('applyBulkTier')"
        class="px-2 py-1 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-[12px] tabular-nums focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
      >
        <option :value="0">制限なし</option>
        <option v-for="t in 10" :key="t" :value="t">T{{ t }}</option>
      </select>
    </div>
    <button
      type="button"
      @click="emit('search')"
      :disabled="selectedCount === 0 || searching"
      :class="[
        'px-4 py-1.5 rounded font-medium text-[12px] transition',
        selectedCount > 0 && !searching
          ? 'bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)]'
          : 'bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed border border-[var(--exile-color-border-subtle)]',
      ]"
    >
      {{ searching ? "検索中…" : "🔍 選択 MOD で trade2 検索" }}
    </button>
  </div>
</template>

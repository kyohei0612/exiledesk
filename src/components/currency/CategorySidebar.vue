<!--
  CategorySidebar.vue — 左サイドバー: 検索ボックス + カテゴリ縦リスト (POE2 trade2 風)
  CurrencyRanking.vue から切り出し (2026-09-07)。
-->
<script setup lang="ts">
import { jaCategory } from "../../i18n/categories-ja";
import type { CategoryDisplay } from "../../views/currency/useCurrencyRanking";

defineProps<{ categories: CategoryDisplay[]; totalCount: number }>();
const categoryFilter = defineModel<string>("categoryFilter", { required: true });
const searchQuery = defineModel<string>("searchQuery", { required: true });

const btnBase = "w-full text-left px-3 py-2 flex items-center gap-2 text-sm border-l-2 transition";
const btnActive = "bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]";
const btnIdle = "border-transparent hover:bg-[var(--exile-color-bg-elevated)]";
</script>

<template>
  <aside
    class="w-44 shrink-0 border-r border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] overflow-y-auto flex flex-col"
  >
    <div class="px-3 py-3 border-b border-[var(--exile-color-border-subtle)]">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="🔍 商品で検索…"
          class="w-full px-3 py-2 pr-8 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] text-sm focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)] text-sm"
          title="クリア"
        >
          ✕
        </button>
      </div>
    </div>
    <div class="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)]">カテゴリ</div>
    <nav class="flex-1">
      <button @click="categoryFilter = 'all'" :class="[btnBase, categoryFilter === 'all' ? btnActive : btnIdle]">
        <span class="w-6 h-6 inline-flex items-center justify-center text-base">★</span>
        <span>すべて</span>
        <span class="ml-auto text-[10px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ totalCount }}</span>
      </button>
      <button
        v-for="cat in categories"
        :key="cat.id"
        @click="categoryFilter = cat.id"
        :class="[btnBase, categoryFilter === cat.id ? btnActive : btnIdle]"
      >
        <img v-if="cat.icon" :src="cat.icon" :alt="cat.id" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
        <span v-else class="w-6 h-6 inline-flex items-center justify-center text-base">·</span>
        <span class="truncate">{{ jaCategory(cat.id) }}</span>
        <span class="ml-auto text-[10px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ cat.count }}</span>
      </button>
    </nav>
  </aside>
</template>

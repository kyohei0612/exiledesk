<!--
  CategorySidebar.vue — 左サイドバー: 検索ボックス + カテゴリ縦リスト (POE2 trade2 風)
  CurrencyRanking.vue から切り出し (2026-09-07)。
  2026-10-09 オーナー「カテゴリも左つぶれてる、真ん中に持ってきたらアイコンで合わせて列」: 左のメインのサイドバーの縁の飾り (g-sidebar::after) が
  10px 被ってアイコンの左が隠れ、幅も足りず名前が切れていた → 幅を広げ、検索・見出し・カテゴリを同じ幅のまとまりにして真ん中に (アイコンは縦に揃う)
-->
<script setup lang="ts">
import { jaCategory } from "../../i18n/categories-ja";
import type { CategoryDisplay } from "../../views/currency/useCurrencyRanking";

defineProps<{ categories: CategoryDisplay[]; totalCount: number }>();
const categoryFilter = defineModel<string>("categoryFilter", { required: true });
const searchQuery = defineModel<string>("searchQuery", { required: true });

const btnBase = "g-side-row w-full text-left py-2 flex items-center gap-2 g-antique text-[14px] transition";
/** 選んでいる行 (取引所の左の絞り込みの行の絵、src/styles/game-ui.css の .g-side-on。2026-10-09 オーナーが案 2 を選んだ) */
const btnActive = "g-side-on";
const btnIdle = "text-[var(--exile-color-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--exile-color-text-primary)]";
</script>

<template>
  <aside
    class="g-sidebar relative z-[1] w-60 shrink-0 overflow-y-auto overflow-x-hidden flex flex-col items-center"
  >
    <div class="w-52 py-3">
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
    <div class="g-brush w-52 px-3.5 py-2 text-[13px] tracking-[0.2em] text-[var(--exile-color-text-tertiary)]">カテゴリ</div>
    <nav class="w-52 flex-1 pb-3">
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
        <span v-if="cat.glyph" class="w-6 h-6 inline-flex items-center justify-center text-base text-[#e25c6a]">{{ cat.glyph }}</span>
        <img v-else-if="cat.icon" :src="cat.icon" :alt="cat.id" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
        <span v-else class="w-6 h-6 inline-flex items-center justify-center text-base">·</span>
        <span class="truncate">{{ jaCategory(cat.id) }}</span>
        <span class="ml-auto text-[10px] text-[var(--exile-color-text-secondary)] tabular-nums">{{ cat.count }}</span>
      </button>
    </nav>
  </aside>
</template>

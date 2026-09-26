<!--
  UniqueTrend.vue — ユニーク装備価格推移 (poe2scout) 2026-09-26

  オーナー指示:「価格推移を知りたいから、カレンシーランキングの下らへんに『ユニーク装備価格推移』ってタブで
  同じように作って欲しい。グラフかなんかで分かりやすくトレースして欲しい。UI もシンプルで見やすい感じで。
  並び替えもできるように、値段順やら高騰率やら」。
    views/unique-trend/useUniqueTrend.ts    取得・絞り込み・並び替え
    views/unique-trend/useUniqueDetail.ts   開いた 1 件の長い履歴と取引所の即時購入の最安
    components/unique-trend/UniqueTable      本体テーブル (行を押すと詳細)
    components/unique-trend/UniqueDetail     詳細 (グラフ + 最安・最高 + 取引所ボタン)
    components/unique-trend/LineChart        素の SVG の折れ線
  カテゴリ欄はカレンシーランキングの CategorySidebar をそのまま使う。
-->
<script setup lang="ts">
import { onActivated, onMounted, ref } from "vue";
import RefreshButton from "../components/RefreshButton.vue";
import CategorySidebar from "../components/currency/CategorySidebar.vue";
import UniqueTable from "../components/unique-trend/UniqueTable.vue";
import { marketStore } from "../state/market-store";
import { SORT_OPTIONS, useUniqueTrend } from "./unique-trend/useUniqueTrend";

const u = useUniqueTrend();
const openId = ref<number | null>(null);
function toggle(id: number) {
  openId.value = openId.value === id ? null : id;
}

onMounted(() => void u.load());
// keep-alive なので開き直した時はここ。相場ストアが 30 分より古ければ取り直す
onActivated(() => void u.load());

const seg = "px-3 py-1.5 text-sm transition";
const segOn = "bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]";
const segOff = "text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]";
</script>

<template>
  <div class="h-full flex overflow-hidden">
    <CategorySidebar
      v-model:category-filter="u.categoryFilter.value"
      v-model:search-query="u.searchQuery.value"
      :categories="u.categories.value"
      :total-count="u.rows.value.length"
    />

    <div class="flex-1 overflow-auto p-4">
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div class="min-w-0">
          <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">ユニーク装備価格推移</h1>
          <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">poe2scout の相場と 7 日の動き。行を押すとグラフと取引所の即時購入の最安が見られます。</p>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
            相場: poe2scout · {{ marketStore.fetchedLabel.value }}
            <span v-if="u.league.value"> / {{ u.league.value }}</span>
            <span v-if="u.rows.value.length"> / {{ u.rows.value.length }} 件</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div class="inline-flex rounded border border-[var(--exile-color-border-subtle)] overflow-hidden bg-[var(--exile-color-bg-surface)]">
            <button
              v-for="o in SORT_OPTIONS"
              :key="o.key"
              :class="[seg, u.sortKey.value === o.key ? segOn : segOff]"
              @click="u.sortKey.value = o.key"
            >
              {{ o.label }}
            </button>
          </div>
          <RefreshButton
            :label="marketStore.loading.value ? '更新中…' : '更新'"
            :disabled="marketStore.loading.value"
            title="poe2scout から相場と推移を取り直します"
            @click="u.refresh"
          />
        </div>
      </div>

      <div
        v-if="marketStore.error.value"
        class="p-4 mb-4 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-error)_10%,transparent)] border-l-2 border-[var(--exile-color-signal-error)] text-[var(--exile-color-signal-error)] text-sm"
      >
        <p class="font-semibold mb-1">取得失敗</p>
        <p class="font-mono text-xs">{{ marketStore.error.value }}</p>
      </div>

      <div v-if="marketStore.loading.value && !u.rows.value.length" class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm">データ取得中…</div>

      <div
        v-else-if="!u.rows.value.length"
        class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)]"
      >
        ユニークの相場がまだありません (新リーグ直後は poe2scout に入るまで空のことがあります)
      </div>

      <div
        v-else-if="!u.sorted.value.length"
        class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)]"
      >
        <p class="mb-2">該当するアイテムがありません</p>
        <button v-if="u.searchQuery.value" @click="u.searchQuery.value = ''" class="text-xs underline hover:text-[var(--exile-color-accent-focus)]">検索クリア</button>
        <button v-if="u.categoryFilter.value !== 'all'" @click="u.categoryFilter.value = 'all'" class="ml-2 text-xs underline hover:text-[var(--exile-color-accent-focus)]">
          「すべて」に戻す
        </button>
      </div>

      <UniqueTable
        v-else
        v-model:sort-key="u.sortKey.value"
        :rows="u.shown.value"
        :trends="u.trends"
        :loading-trends="u.loadingTrends.value"
        :open-id="openId"
        @toggle="toggle"
      />
      <!-- 推移を取るのは値段の高い順に 50 件ずつ (全件を 1 件ずつ取りに行かないため) -->
      <div v-if="u.sorted.value.length > u.shown.value.length" class="mt-2 flex items-center justify-center gap-3 text-xs">
        <span class="text-[var(--exile-color-text-secondary)]">値段の高い {{ u.shown.value.length }} 件を表示中 (全 {{ u.sorted.value.length }} 件)</span>
        <button type="button" class="rounded-lg border border-[var(--exile-color-border-subtle)] px-3 py-1 hover:border-[var(--exile-color-accent-focus)]" @click="u.more()">もっと見る (+50)</button>
      </div>

      <p class="mt-4 text-[10px] text-[var(--exile-color-text-secondary)] text-right">
        Powered by
        <a href="https://poe2scout.com" target="_blank" class="hover:text-[var(--exile-color-accent-focus)] underline">poe2scout</a>
        / 値段は 1 神以上は神、それ未満はカオス / 高貴で表示 / 変化率は直近 7 日の最初と最後の比
      </p>
    </div>
  </div>
</template>

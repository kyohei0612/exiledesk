<!--
  UniqueTrend.vue — ユニーク装備価格推移 (poe.ninja。2026-09-26 poe2scout から乗せ換え)

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
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { marketStore } from "../state/market-store";
import { FAV_CATEGORY, SORT_OPTIONS, useUniqueTrend } from "./unique-trend/useUniqueTrend";

const u = useUniqueTrend();
const openId = ref<number | null>(null);
function toggle(id: number) {
  openId.value = openId.value === id ? null : id;
}

onMounted(() => void u.load());
// keep-alive なので開き直した時はここ。相場ストアが 30 分より古ければ取り直す
onActivated(() => void u.load());

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

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
          <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">poe.ninja の相場と 7 日の動き。行を押すとグラフ、♡ でお気に入り。</p>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
            相場: poe.ninja<span v-if="u.fetchedAt.value"> · {{ fmtTime(u.fetchedAt.value) }} 取得</span>
            <span v-if="u.league.value"> / {{ u.league.value }}</span>
            <span v-if="u.rows.value.length"> / {{ u.rows.value.length }} 件</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <CurrencyPicker />
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
            :label="u.loading.value ? '更新中…' : '更新'"
            :disabled="u.loading.value"
            title="poe.ninja から取り直します (8 種類、20 秒ほど)"
            @click="u.refresh"
          />
        </div>
      </div>

      <p v-if="u.loadingLabel.value" class="mb-3 text-xs text-[var(--exile-color-text-secondary)]">{{ u.loadingLabel.value }}…</p>
      <div
        v-if="u.error.value"
        class="p-4 mb-4 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-error)_10%,transparent)] border-l-2 border-[var(--exile-color-signal-error)] text-[var(--exile-color-signal-error)] text-sm"
      >
        <p class="font-semibold mb-1">取得失敗</p>
        <p class="font-mono text-xs">{{ u.error.value }}</p>
      </div>

      <div v-if="(u.loading.value || marketStore.loading.value) && !u.rows.value.length" class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm">データ取得中…</div>

      <div
        v-else-if="!u.rows.value.length"
        class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)]"
      >
        ユニークの相場がまだありません (新リーグ直後は poe.ninja に入るまで空のことがあります)
      </div>

      <div
        v-else-if="!u.sorted.value.length"
        class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)]"
      >
        <p v-if="u.categoryFilter.value === FAV_CATEGORY && !u.searchQuery.value" class="mb-2">お気に入りはまだありません。行の ♡ を押すとここに集まります</p>
        <p v-else class="mb-2">該当するアイテムがありません</p>
        <button v-if="u.searchQuery.value" @click="u.searchQuery.value = ''" class="text-xs underline hover:text-[var(--exile-color-accent-focus)]">検索クリア</button>
        <button v-if="u.categoryFilter.value !== 'all'" @click="u.categoryFilter.value = 'all'" class="ml-2 text-xs underline hover:text-[var(--exile-color-accent-focus)]">
          「すべて」に戻す
        </button>
      </div>

      <UniqueTable
        v-else
        v-model:sort-key="u.sortKey.value"
        :rows="u.shown.value"
        :trends="u.trends.value"
        :open-id="openId"
        @toggle="toggle"
      />
      <!-- 一度に出すのは 100 件ずつ (数百行を一度に描かない) -->
      <div v-if="u.sorted.value.length > u.shown.value.length" class="mt-2 flex items-center justify-center gap-3 text-xs">
        <span class="text-[var(--exile-color-text-secondary)]">{{ u.shown.value.length }} 件を表示中 (全 {{ u.sorted.value.length }} 件)</span>
        <button type="button" class="rounded-lg border border-[var(--exile-color-border-subtle)] px-3 py-1 hover:border-[var(--exile-color-accent-focus)]" @click="u.more()">もっと見る (+100)</button>
      </div>

      <p class="mt-4 text-[10px] text-[var(--exile-color-text-secondary)] text-right">
        Powered by
        <a href="https://poe.ninja/poe2/economy" target="_blank" class="hover:text-[var(--exile-color-accent-focus)] underline">poe.ninja</a>
        / 値段は選んだ表示通貨 (1 未満なら 神 → カオス → 高貴) / 変化率は直近 7 日の最初と最後の比 / 高騰率・下落率は 1 神未満と出品 3 件未満を後ろに
      </p>
    </div>
  </div>
</template>

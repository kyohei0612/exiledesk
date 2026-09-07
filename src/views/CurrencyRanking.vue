<!--
  CurrencyRanking.vue — カレンシーランキング (poe2scout)
  ---------------------------------------------------------------------------
  2026-09-07 リファクタ: 735 行あった画面を分割した。この画面は配線とレイアウトだけ持つ。
    views/currency/useCurrencyRanking.ts   取得・状態・絞り込み
    views/currency/format.ts               数値 / 時刻 / スパークライン / カテゴリ順 / 効果辞書
    components/currency/CategorySidebar    左サイドバー (検索 + カテゴリ)
    components/currency/RateHeader         基準レート帯 (3 行)
    components/currency/RankingTable       本体テーブル
    components/currency/EffectHoverCard    poe2db 風ホバーカード
    components/currency/Sparkline          7 日折れ線 + %
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { RankedItem } from "../api/poe2scout";
import CategorySidebar from "../components/currency/CategorySidebar.vue";
import RateHeader from "../components/currency/RateHeader.vue";
import RankingTable from "../components/currency/RankingTable.vue";
import EffectHoverCard from "../components/currency/EffectHoverCard.vue";
import { effectFor, formatEpoch, formatTime } from "./currency/format";
import { useCurrencyRanking } from "./currency/useCurrencyRanking";

const r = useCurrencyRanking();

// ホバーカード (効果説明があるアイテムだけ出す)
const hoverItem = ref<RankedItem | null>(null);
const tip = ref({ x: 0, y: 0 });
const hoverEffect = computed(() => (hoverItem.value ? effectFor(hoverItem.value) : null));
function showTip(p: RankedItem, ev: MouseEvent) {
  if (effectFor(p)) {
    hoverItem.value = p;
    tip.value = { x: ev.clientX, y: ev.clientY };
  }
}
function moveTip(ev: MouseEvent) {
  if (hoverItem.value) tip.value = { x: ev.clientX, y: ev.clientY };
}
function hideTip() {
  hoverItem.value = null;
}

onMounted(() => {
  // 起動時も refresh() がリーグ一覧 + 価格 + 履歴を全てフレッシュ取得する
  void r.refresh();
});
</script>

<template>
  <div class="h-full flex overflow-hidden">
    <CategorySidebar
      v-model:category-filter="r.categoryFilter.value"
      v-model:search-query="r.searchQuery.value"
      :categories="r.categoryDisplayList.value"
      :total-count="r.ranking.value.length"
    />

    <div class="flex-1 overflow-auto p-4">
      <div class="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 class="text-[24px] font-semibold font-display mb-1">💰 カレンシーランキング</h2>
          <div class="h-px bg-gradient-to-r from-transparent via-[var(--exile-color-border-brass)] to-transparent" />
          <p class="text-xs text-[var(--exile-color-text-secondary)]">
            相場時刻: <span class="text-[var(--exile-color-text-primary)]">{{ formatEpoch(r.snapshotEpoch.value) }}</span>
            <span class="text-[var(--exile-color-text-tertiary)]">（poe2scout更新）</span>
            ／ 取得 <span>{{ formatTime(r.lastUpdated.value) }}</span>
            <span v-if="r.ranking.value.length"> ／ {{ r.ranking.value.length }} 件</span>
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <select
            v-model="r.league.value"
            @change="r.onLeagueChange"
            class="px-3 py-2 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-sm"
          >
            <option v-for="l in r.leagues.value" :key="l.Value" :value="l.Value">{{ l.Value }}{{ l.IsCurrent ? " ★" : "" }}</option>
            <option v-if="!r.leagues.value.length" :value="r.league.value">{{ r.league.value }}</option>
          </select>
          <button
            @click="r.refresh"
            :disabled="r.loading.value"
            class="px-4 py-2 rounded bg-[var(--exile-color-accent-focus)] text-black font-medium text-sm hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 transition"
          >
            {{ r.loading.value ? "更新中…" : "🔄 更新" }}
          </button>
        </div>
      </div>

      <!-- リーグ自動判定の警告: 前リーグのまま表示する事故を可視化 -->
      <div
        v-if="r.leagueWarning.value"
        class="p-3 mb-4 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-warning,#c9a227)_12%,transparent)] border-l-2 border-[var(--exile-color-signal-warning,#c9a227)] text-sm"
      >
        ⚠️ {{ r.leagueWarning.value }}
      </div>

      <RateHeader
        v-if="r.ranking.value.length"
        :divine-price="r.divinePrice.value"
        :chaos-divine-price="r.chaosDivinePrice.value"
        :divine-icon="r.divineIcon.value"
        :chaos-icon="r.chaosIcon.value"
        :exalted-icon="r.exaltedIcon.value"
        :divine-vs-exalted="r.divineVsExalted.value"
        :divine-vs-chaos="r.divineVsChaos.value"
        :chaos-vs-exalted="r.chaosVsExalted.value"
      />

      <div
        v-if="r.error.value"
        class="p-4 mb-4 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-error)_10%,transparent)] border-l-2 border-[var(--exile-color-signal-error)] text-[var(--exile-color-signal-error)] text-sm"
      >
        <p class="font-semibold mb-1">取得失敗</p>
        <p class="font-mono text-xs">{{ r.error.value }}</p>
      </div>

      <div v-if="r.loading.value && !r.ranking.value.length" class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm">データ取得中…</div>

      <!-- フィルタ後 0 件案内 (元データはあるが categoryFilter / searchQuery で消えた時) -->
      <div
        v-else-if="r.ranking.value.length && r.filteredRanking.value.length === 0"
        class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)]"
      >
        <p class="mb-2">該当するアイテムがありません</p>
        <p class="text-xs text-[var(--exile-color-text-tertiary)]">
          カテゴリ / 検索条件を変更してください
          <button v-if="r.searchQuery.value" @click="r.searchQuery.value = ''" class="ml-2 underline hover:text-[var(--exile-color-accent-focus)]">検索クリア</button>
          <button v-if="r.categoryFilter.value !== 'all'" @click="r.categoryFilter.value = 'all'" class="ml-2 underline hover:text-[var(--exile-color-accent-focus)]">
            「すべて」に戻す
          </button>
        </p>
      </div>

      <RankingTable
        v-else-if="r.ranking.value.length"
        :rows="r.filteredRanking.value"
        :divine-icon="r.divineIcon.value"
        :chaos-icon="r.chaosIcon.value"
        :exalted-icon="r.exaltedIcon.value"
        :loading7d="r.loading7d.value"
        :row-trend="r.rowTrend"
        @hover="showTip"
        @move="moveTip"
        @leave="hideTip"
      />

      <p class="mt-4 text-[10px] text-[var(--exile-color-text-secondary)] text-right">
        Powered by
        <a href="https://poe2scout.com" target="_blank" class="hover:text-[var(--exile-color-accent-focus)] underline">poe2scout</a>
        ／ <span class="font-mono">{{ r.league.value }}</span>
        ／各列は「1 アイテム = X 神 / 高貴 / カオス」
      </p>
    </div>

    <EffectHoverCard :item="hoverItem" :effect="hoverEffect" :x="tip.x" :y="tip.y" />
  </div>
</template>

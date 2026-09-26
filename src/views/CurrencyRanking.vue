<!--
  CurrencyRanking.vue — カレンシーランキング (poe2scout)
  ---------------------------------------------------------------------------
  2026-09-07 リファクタ: 735 行あった画面を分割した。この画面は配線とレイアウトだけ持つ。
    views/currency/useCurrencyRanking.ts   取得・状態・絞り込み
    views/currency/format.ts               数値 / 時刻 / スパークライン / カテゴリ順 / 効果辞書
    components/currency/CategorySidebar    左サイドバー (検索 + カテゴリ)
    components/currency/RateHeader         基準レート帯 (3 行)
    components/currency/RankingTable       本体テーブル
    components/currency/CurrencyHoverCard  ゲーム風ホバーカード (ユニーク装備価格推移と同じ枠 GameItemCard)
    components/currency/Sparkline          7 日折れ線 + %
-->
<script setup lang="ts">
import { toCss } from "../utils/zoom";
import RefreshButton from "../components/RefreshButton.vue";
import { onActivated, onMounted } from "vue";
import type { RankedItem } from "../api/poe2scout";
import CategorySidebar from "../components/currency/CategorySidebar.vue";
import RateHeader from "../components/currency/RateHeader.vue";
import RankingTable from "../components/currency/RankingTable.vue";
import CurrencyPicker from "../components/vaal-scales/CurrencyPicker.vue";
import { hoverStack } from "../state/hover-stack";
import { formatEpoch, formatTime } from "./currency/format";
import { useCurrencyRanking } from "./currency/useCurrencyRanking";

const r = useCurrencyRanking();

// ホバーカード (名前にカーソル。ユニーク装備価格推移と同じ重なり hover-stack。説明が無い物も「説明のデータがありません」で出す)
function showTip(p: RankedItem, ev: MouseEvent) {
  // リネージュサポートはジェムのカード (タグ・レベルごとの効果まで。オーナー 2026-09-26「ゲーム内表記くらい詳しく」)
  const payload = p.categoryApiId === "lineagesupportgems" ? { kind: "gem" as const, en: p.text } : { kind: "currency" as const, item: p };
  hoverStack.openRoot(payload, toCss(ev.clientX), toCss(ev.clientY));
}
function moveTip(_ev: MouseEvent) {
  /* 位置は開いた時のまま (カードへカーソルを移せるように) */
}
function hideTip() {
  hoverStack.leave();
}

onMounted(() => {
  // 起動時は前回の保存分をすぐ出したうえで取り直す (真っ白にしない)
  void r.refresh();
});
// keep-alive なのでタブを開き直しても mount されない。開いた時にここで更新する
// (前回から 5 分経っていなければ見送り。オーナー指示 2026-09-17)
onActivated(() => {
  void r.refreshIfStale();
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
        <div class="min-w-0">
          <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">カレンシーランキング</h1>
          <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">poe2scout の相場。素材の単価はこの数字を使います。</p>
          <!-- 出どころと取得時刻は他の画面と同じ並び (2026-09-21) -->
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
            相場: poe2scout ({{ formatEpoch(r.snapshotEpoch.value) }} 更新) · {{ formatTime(r.lastUpdated.value) }} 取得
            <span v-if="r.fromCache.value">(前回のデータ)</span>
            <span v-if="r.ranking.value.length"> / {{ r.ranking.value.length }} 件</span>
            <span v-if="r.autoNote.value"> / {{ r.autoNote.value }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <CurrencyPicker />
          <select
            v-model="r.league.value"
            @change="r.onLeagueChange"
            class="px-3 py-2 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] text-sm"
          >
            <option v-for="l in r.leagues.value" :key="l.Value" :value="l.Value">{{ l.Value }}{{ l.IsCurrent ? " ★" : "" }}</option>
            <option v-if="!r.leagues.value.length" :value="r.league.value">{{ r.league.value }}</option>
          </select>
          <RefreshButton
            :label="r.loading.value ? '更新中…' : '更新'"
            :disabled="r.loading.value"
            title="poe2scout から相場を取り直します"
            @click="r.refresh"
          />
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
        class="p-12 text-center text-[var(--exile-color-text-secondary)] text-sm rounded-xl border border-white/10 bg-white/[0.03]"
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
        / <span class="font-mono">{{ r.league.value }}</span>
        / 値段は表示通貨 (適正 = 神、1 未満はカオス、1 カオス未満は高貴) / 取引の推奨 = カオスと神で交換の安い方 (1 個あたりの値段)
      </p>
    </div>

  </div>
</template>

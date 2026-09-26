<!--
  UniqueDetail.vue — 行を開いた時の詳細: 長い履歴のグラフ / 最安・最高 / 取引所の即時購入の最安 (2026-09-26)
  取引所はボタンを押した時だけ 1 回検索する (オーナー指示「インスタントバイアウトで」)。
-->
<script setup lang="ts">
import { toRef } from "vue";
import LineChart from "./LineChart.vue";
import { displayCurrency } from "../../state/display-currency";
import { openExternal } from "../../services/trade2/open-external";
import { useUniqueDetail } from "../../views/unique-trend/useUniqueDetail";
import type { UniqueRow, UniqueTrend } from "../../views/unique-trend/useUniqueTrend";

const props = defineProps<{ row: UniqueRow; trend: UniqueTrend | undefined }>();
const d = useUniqueDetail(toRef(props, "row"), toRef(props, "trend"));

const money = (ex: number | null | undefined) => displayCurrency.money(ex);
function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}
function fmtClock(t: number): string {
  return new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}
</script>

<template>
  <div class="px-5 py-4 bg-[var(--exile-color-bg-canvas)]">
    <div class="flex items-start gap-8">
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-3 mb-6">
          <span class="text-sm text-[var(--exile-color-text-secondary)]">価格の推移</span>
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">
            poe.ninja の日ごとの記録 {{ d.points.value.length }} 日分<span v-if="d.loadingLong.value"> · 読込中…</span>
          </span>
        </div>
        <LineChart :points="d.points.value" :format="money" />
      </div>

      <div class="w-72 shrink-0 space-y-3 text-sm">
        <dl v-if="d.stats.value" class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt class="text-[var(--exile-color-text-secondary)]">期間</dt>
          <dd class="text-right tabular-nums">{{ fmtDay(d.stats.value.first.t) }} 〜 {{ fmtDay(d.stats.value.last.t) }}</dd>
          <dt class="text-[var(--exile-color-text-secondary)]">最高</dt>
          <dd class="text-right tabular-nums text-[var(--exile-color-signal-success)]">
            {{ money(d.stats.value.max.price) }} <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">({{ fmtDay(d.stats.value.max.t) }})</span>
          </dd>
          <dt class="text-[var(--exile-color-text-secondary)]">最安</dt>
          <dd class="text-right tabular-nums text-[var(--exile-color-signal-error)]">
            {{ money(d.stats.value.min.price) }} <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">({{ fmtDay(d.stats.value.min.t) }})</span>
          </dd>
          <dt class="text-[var(--exile-color-text-secondary)]">最新</dt>
          <dd class="text-right tabular-nums text-[var(--exile-color-accent-focus)]">{{ money(d.stats.value.last.price) }}</dd>
        </dl>

        <div class="pt-3 border-t border-[var(--exile-color-border-subtle)]">
          <button
            class="w-full px-3 py-2 rounded text-sm border transition border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="d.button.value.disabled"
            @click="d.fetchInstant"
          >
            {{ d.button.value.label }}
          </button>
          <div v-if="d.result.value" class="mt-2 p-2 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)]">
            <div class="flex items-baseline justify-between">
              <span class="text-[var(--exile-color-text-secondary)]">即時購入の最安</span>
              <span class="text-base tabular-nums text-[var(--exile-color-accent-focus)]">{{ money(d.result.value.minExalted) }}</span>
            </div>
            <div class="flex items-baseline justify-between mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
              <span>{{ d.result.value.total }} 件 · {{ fmtClock(d.result.value.at) }} 取得</span>
              <button v-if="d.result.value.url" class="underline hover:text-[var(--exile-color-accent-focus)]" @click="openExternal(d.result.value.url)">取引所で開く ↗</button>
            </div>
          </div>
          <p v-else-if="d.error.value" class="mt-2 text-xs text-[var(--exile-color-signal-error)]">{{ d.error.value }}</p>
          <p v-else class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">押した時だけ取引所を 1 回検索します (即時購入の出品だけ)</p>
          <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">※ 左の値段とグラフは poe.ninja の相場で、コラプトしていない純正品の値段です。取引所の最安はコラプト品も含むので、安く出ることがあります</p>
        </div>
      </div>
    </div>
  </div>
</template>

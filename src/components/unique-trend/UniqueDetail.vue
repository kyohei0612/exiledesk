<!--
  UniqueDetail.vue — 行を開いた時の詳細: 長い履歴のグラフ / 最安・最高 / 取引所へのボタン (2026-09-26)
  取引所の最安を取るのはやめ、取引所を開くだけにした (オーナー「最安値をとるはいらない。普通にトレードサイトへ促すボタンで」)。
-->
<script setup lang="ts">
import { toRef } from "vue";
import LineChart from "./LineChart.vue";
import { displayCurrency } from "../../state/display-currency";
import { useUniqueDetail } from "../../views/unique-trend/useUniqueDetail";
import type { UniqueRow, UniqueTrend } from "../../views/unique-trend/useUniqueTrend";

const props = defineProps<{ row: UniqueRow; trend: UniqueTrend | undefined }>();
const emit = defineEmits<{ trade: [] }>();
const d = useUniqueDetail(toRef(props, "row"), toRef(props, "trend"));

const money = (ex: number | null | undefined) => displayCurrency.money(ex);
function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
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
            class="w-full px-3 py-2 rounded text-sm border transition border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]"
            @click="emit('trade')"
          >
            取引所で見る ↗
          </button>
          <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">即時購入の出品を安い順で開きます (コラプトの指定なし)</p>
          <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">※ 左の値段とグラフは poe.ninja の相場で、コラプトしていない純正品の値段です。取引所はコラプト品も並ぶので、安く出ることがあります</p>
        </div>
      </div>
    </div>
  </div>
</template>

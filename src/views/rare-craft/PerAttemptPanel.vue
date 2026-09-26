<!--
  PerAttemptPanel.vue — 1 回あたり (費用・期待売上・期待収支・黒字の確率、売値の段ごとの内訳、N 回やった場合)
  RareCraft.vue から切り出し (2026-09-26)。中身は変えていない。回数は素材欄と共有 (v-model:attempts)。
-->
<script setup lang="ts">
import { computed } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { ATTEMPT_OPTIONS, evClass, money, pct } from "./ui";
import { METRIC_LABEL, METRIC_UNIT } from "./sim";
import { bucketLabel } from "./recipes";
import type { useRareCraft } from "./useRareCraft";

const props = defineProps<{ c: ReturnType<typeof useRareCraft> }>();
const c = props.c;
/** 「N 回やった場合」の N (素材欄と同じ値) */
const attempts = defineModel<number>("attempts", { required: true });

/** 「N 回やった場合」 */
const atN = computed(() => {
  const r = c.result.value;
  const top = c.topRow.value;
  const n = attempts.value;
  if (!r || c.cost.value == null) return null;
  return {
    cost: n * c.cost.value,
    revenue: n * r.expectedSale,
    profit: n * r.ev,
    topLabel: top?.label ?? null,
    topExpected: top ? n * top.pSold : 0,
    pTopAny: top ? 1 - Math.pow(1 - top.pSold, n) : 0,
  };
});
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">1 回あたり</h2>
        <p v-if="!c.sim.value.ok" class="text-[12px] text-amber-300">計算できません: {{ c.sim.value.reason }}</p>
        <p v-else-if="!c.result.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">不足: {{ c.missing.value.join("、") || "相場を取得中" }}</p>
        <template v-else>
          <div class="grid grid-cols-2 @3xl:grid-cols-4 gap-3 text-[12px]">
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">1 回の費用</div>
              <div class="tabular-nums text-[16px]">{{ money(c.cost.value) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">ベース + 素材</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">期待売上</div>
              <div class="tabular-nums text-[16px]">{{ money(c.result.value.expectedSale) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">結果ごとの売値の平均</div>
            </div>
            <div class="rounded border p-3" :class="c.result.value.ev > 0 ? 'border-emerald-500/40' : 'border-[var(--exile-color-border-subtle)]'">
              <div class="text-[var(--exile-color-text-secondary)]">期待収支</div>
              <div class="tabular-nums text-[16px]" :class="evClass(c.result.value.ev)">{{ money(c.result.value.ev, true) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">期待売上 − 費用</div>
            </div>
            <div class="rounded border border-[var(--exile-color-border-subtle)] p-3">
              <div class="text-[var(--exile-color-text-secondary)]">黒字になる確率</div>
              <div class="tabular-nums text-[16px]">{{ pct(c.result.value.pProfit) }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">売値が費用以上になる 1 回の割合</div>
            </div>
          </div>
          <p class="text-[13px] mt-3" :class="evClass(c.result.value.ev)">
            {{ c.result.value.ev > 0 ? `作る価値あり: 1 回につき平均 ${money(c.result.value.ev)} の利益` : `作らない方が得: 1 回につき平均 ${money(-c.result.value.ev)} の赤字` }}
          </p>

          <table class="mt-3 text-[12px] w-full max-w-4xl break-words">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">売値の段</th>
                <th class="text-right font-normal pb-1 pl-2">条件を満たす確率</th>
                <th class="text-right font-normal pb-1 pl-2">この段で売る確率</th>
                <th class="text-right font-normal pb-1 pl-2">売値</th>
                <th class="text-right font-normal pb-1 pl-2">期待売上への寄与</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in c.result.value.rows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)] tabular-nums">
                <td class="py-1 pr-2">{{ r.label }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(r.pReach) }}</td>
                <td class="py-1 pl-2 text-right">{{ pct(r.pSold) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ r.price == null ? "出品なし" : money(r.price) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(r.contribution) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)] tabular-nums">
                <td class="py-1 pr-2">外れ ({{ bucketLabel(c.floorConds.value) }} の最安で売る)</td>
                <td></td>
                <td class="py-1 pl-2 text-right">{{ pct(c.result.value.floor.pSold) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(c.result.value.floor.price) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(c.result.value.floor.contribution) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-subtle)] tabular-nums">
                <td class="py-1 pr-2">外れの条件にも届かない (売れない扱い)</td>
                <td></td>
                <td class="py-1 pl-2 text-right">{{ pct(c.result.value.below.pSold) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(0) }}</td>
                <td class="py-1 pl-2 text-right whitespace-nowrap">{{ money(0) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-[var(--exile-color-text-secondary)]">
            <span v-for="m in c.recipe.value.metrics" :key="m">{{ METRIC_LABEL[m] }} の平均 <span class="tabular-nums text-[var(--exile-color-text-primary)]">{{ Math.round(c.result.value.means[m]) }}{{ METRIC_UNIT[m] }}</span></span>
            <span>冒涜のあとの空き: プレフィックス {{ c.slots.value.prefixOpen }} / サフィックス {{ c.slots.value.suffixOpen }}</span>
            <span>高貴なオーブで足す MOD: {{ c.effectiveCount.value }} つ</span>
            <span v-if="c.echo.value === 'echoes'">反響で引き直す割合 <span class="tabular-nums text-[var(--exile-color-text-primary)]">{{ pct(c.sim.value.pReroll) }}</span></span>
          </div>

          <div class="mt-3 rounded border border-[var(--exile-color-border-subtle)] p-3 text-[12px] max-w-3xl">
            <div class="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
              <span class="font-display tracking-[0.04em]">{{ attempts }} 回やった場合</span>
              <label class="text-[11px] text-[var(--exile-color-text-secondary)] inline-flex items-center gap-2">
                回数
                <select v-model.number="attempts" class="num w-20">
                  <option v-for="n in ATTEMPT_OPTIONS" :key="n" :value="n">{{ n }} 回</option>
                </select>
              </label>
            </div>
            <div v-if="atN" class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1">
              <span class="text-[var(--exile-color-text-secondary)]">総費用</span>
              <span class="text-right tabular-nums">{{ money(atN.cost) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待売上</span>
              <span class="text-right tabular-nums">{{ money(atN.revenue) }}</span>
              <span class="text-[var(--exile-color-text-secondary)]">期待損益</span>
              <span class="text-right tabular-nums" :class="evClass(atN.profit)">{{ money(atN.profit, true) }}</span>
              <template v-if="atN.topLabel">
                <span class="text-[var(--exile-color-text-secondary)]">一番高い段 ({{ atN.topLabel }}) が 1 個以上出る確率</span>
                <span class="text-right tabular-nums">{{ pct(atN.pTopAny) }} (期待 {{ atN.topExpected.toFixed(2) }} 個)</span>
              </template>
            </div>
          </div>
        </template>
      </div>
    </BaseCard>
</template>

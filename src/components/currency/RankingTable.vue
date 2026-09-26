<!--
  RankingTable.vue — 1 アイテム = 1 行、値段 + 過去 7 日
  値段は 1 種類の通貨で出す。適正 = 一番安く交換できる通貨 (カオスと神で安い方)、通貨を選べばその通貨。
  オーナー指示 2026-09-26:「0.003 神とか 3 種類並ぶと気持ち悪いし目移りする。カレンシーは 1 種類に統一」
  CurrencyRanking.vue から切り出し (2026-09-07)。行ホバーは親へ emit (効果カード表示用)。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ItemTrend, RankedItem } from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import { effectFor, fmt } from "../../views/currency/format";
import { displayCurrency } from "../../state/display-currency";
import Sparkline from "./Sparkline.vue";

const props = defineProps<{
  rows: RankedItem[];
  divineIcon: string;
  chaosIcon: string;
  exaltedIcon: string;
  loading7d: boolean;
  rowTrend: (p: RankedItem) => ItemTrend | undefined;
}>();
const emit = defineEmits<{ hover: [p: RankedItem, ev: MouseEvent]; move: [ev: MouseEvent]; leave: [] }>();

const JA = { divine: "神", chaos: "カオス", exalted: "高貴" } as const;
type Cur = keyof typeof JA;
const fair = computed(() => displayCurrency.choice.value === "fair");
/**
 * 行ごとの値段。適正なら一番安く交換できる通貨 (カオスと神で安い方)、ペアが薄ければ相場の値段を 神 → カオス → 高貴 で。
 * 通貨を 1 つ選んでいれば、その通貨に直した相場の値段
 */
const cells = computed(() => {
  const m = new Map<string, { value: number; cur: Cur; label: string; pair: boolean; title: string }>();
  for (const p of props.rows) {
    const bp = fair.value ? p.bestPay : null;
    if (bp) {
      m.set(p.apiId, { value: bp.perUnit, cur: bp.currency, label: JA[bp.currency], pair: true, title: `${JA[bp.currency]}で交換するのが一番安い (取引所のペアの値)` });
    } else {
      const u = displayCurrency.unit(p.exaltedPrice);
      m.set(p.apiId, { value: u.value, cur: u.cur, label: u.label, pair: false, title: fair.value ? "取引所のペアが薄いので相場の値段" : `相場の値段 (${u.label})` });
    }
  }
  return m;
});
function iconOf(c: Cur): string {
  return c === "divine" ? props.divineIcon : c === "chaos" ? props.chaosIcon : props.exaltedIcon;
}
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden">
    <table class="w-full text-base">
      <thead class="bg-[var(--exile-color-bg-surface)] text-xs uppercase tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th class="text-left px-3 py-3 whitespace-nowrap">#</th>
          <th class="text-left px-3 py-3 whitespace-nowrap">アイテム</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">値段</th>
          <th class="text-right px-3 py-3 whitespace-nowrap">
            過去7日間<span v-if="loading7d" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)] normal-case">読込中…</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(p, i) in rows"
          :key="p.apiId"
          class="border-t border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)] transition"
          @mouseenter="(ev) => emit('hover', p, ev)"
          @mousemove="(ev) => emit('move', ev)"
          @mouseleave="emit('leave')"
        >
          <td class="px-3 py-3 text-[var(--exile-color-text-secondary)] tabular-nums whitespace-nowrap">{{ i + 1 }}</td>
          <td class="px-3 py-3 whitespace-nowrap">
            <div class="flex items-center gap-2 whitespace-nowrap" :class="effectFor(p) ? 'cursor-help' : ''">
              <img v-if="p.icon" :src="p.icon" :alt="p.text" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
              <span
                class="text-[var(--exile-color-text-primary)]"
                :class="effectFor(p) ? 'underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4' : ''"
                >{{ jaCurrency(p.text) }}</span
              >
            </div>
          </td>
          <td class="px-2 py-3 text-right">
            <div class="flex items-center justify-end gap-1 text-sm tabular-nums" :title="cells.get(p.apiId)!.title">
              <span :class="cells.get(p.apiId)!.pair || !fair ? 'text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'">{{ fmt(cells.get(p.apiId)!.value) }}</span>
              <img v-if="iconOf(cells.get(p.apiId)!.cur)" :src="iconOf(cells.get(p.apiId)!.cur)" :alt="cells.get(p.apiId)!.label" class="w-5 h-5 object-contain" loading="lazy" />
              <span v-else class="text-xs text-[var(--exile-color-text-secondary)]">{{ cells.get(p.apiId)!.label }}</span>
            </div>
          </td>
          <td class="px-2 py-3">
            <Sparkline v-if="rowTrend(p) && rowTrend(p)!.spark.length >= 2" :trend="rowTrend(p)!" class="gap-2" />
            <div v-else class="text-right text-xs text-[var(--exile-color-text-tertiary)] pr-1">—</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<!--
  PlanTable.vue — エッセンス候補ごとの 保証モッド / 素材価格 / 完成品最安 / 収支
  Perfect エッセンスは「どの mod が外れるか」で結果が分かれるので 1 エッセンス複数行。
-->
<script setup lang="ts">
import type { OutcomePrice, PlanRow } from "../../views/craft-profit/useCraftProfit";

defineProps<{
  rows: PlanRow[];
  baseCost: number;
  pricing: boolean;
  profitOf: (row: PlanRow, op: OutcomePrice) => number | null;
}>();
const emit = defineEmits<{ price: [row: PlanRow, op: OutcomePrice]; open: [url: string] }>();

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  return abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : n.toFixed(2);
}
function profitClass(p: number | null): string {
  if (p == null) return "text-[var(--exile-color-text-tertiary)]";
  return p > 0 ? "text-emerald-300" : p < 0 ? "text-red-300" : "";
}
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden">
    <table class="w-full text-[12px]">
      <thead class="bg-[var(--exile-color-bg-surface)] text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th class="text-left px-3 py-2">エッセンス</th>
          <th class="text-left px-3 py-2">保証モッド (最低ロール)</th>
          <th class="text-left px-3 py-2">外れる mod</th>
          <th class="text-right px-3 py-2 whitespace-nowrap">素材 (高貴)</th>
          <th class="text-right px-3 py-2 whitespace-nowrap">合計コスト</th>
          <th class="text-right px-3 py-2 whitespace-nowrap">完成品 最安</th>
          <th class="text-right px-3 py-2 whitespace-nowrap">収支</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="row.plan.essence.id">
          <tr v-if="row.plan.blocked" class="border-t border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)]">
            <td class="px-3 py-2">{{ row.plan.essence.nameJa }}</td>
            <td class="px-3 py-2">{{ row.plan.guaranteed.textJa }}</td>
            <td class="px-3 py-2 italic" colspan="6">使えません: {{ row.plan.blocked }}</td>
          </tr>
          <tr
            v-for="(op, i) in row.plan.blocked ? [] : row.prices"
            :key="row.plan.essence.id + ':' + i"
            class="border-t border-[var(--exile-color-border-subtle)] hover:bg-[var(--exile-color-bg-elevated)]"
          >
            <td class="px-3 py-2 whitespace-nowrap">
              <span v-if="i === 0">{{ row.plan.essence.nameJa }}</span>
              <span v-else class="text-[var(--exile-color-text-tertiary)]">〃</span>
            </td>
            <td class="px-3 py-2">
              <span :class="row.plan.guaranteed.affix === 'prefix' ? 'text-[#C7A7E5]' : 'text-[#D6B98A]'">{{ row.plan.guaranteed.textJa }}</span>
              <span v-if="op.missing.length" class="ml-1 text-[10px] text-amber-300" :title="op.missing.join(' / ')">(trade2 未対応 mod {{ op.missing.length }})</span>
            </td>
            <td class="px-3 py-2 text-[var(--exile-color-text-secondary)]">{{ op.outcome.removed ? op.outcome.removed.textJa : "—" }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ fmt(row.essencePrice) }}</td>
            <td class="px-3 py-2 text-right tabular-nums">{{ row.essencePrice == null ? "—" : fmt(baseCost + row.essencePrice) }}</td>
            <td class="px-3 py-2 text-right tabular-nums">
              <template v-if="op.status === 'done' && op.result">
                <span>{{ fmt(op.result.minExalted) }}</span>
                <span class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">({{ op.result.total }} 件)</span>
              </template>
              <span v-else-if="op.status === 'loading'" class="text-[var(--exile-color-text-tertiary)]">検索中…</span>
              <span v-else-if="op.status === 'error'" class="text-red-300" :title="op.error ?? ''">失敗</span>
              <span v-else class="text-[var(--exile-color-text-tertiary)]">—</span>
            </td>
            <td class="px-3 py-2 text-right tabular-nums font-semibold" :class="profitClass(profitOf(row, op))">
              {{ profitOf(row, op) == null ? "—" : (profitOf(row, op)! > 0 ? "+" : "") + fmt(profitOf(row, op)) }}
            </td>
            <td class="px-3 py-2 text-right whitespace-nowrap">
              <button
                type="button"
                :disabled="pricing || op.status === 'loading'"
                @click="emit('price', row, op)"
                class="px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[11px] hover:bg-[var(--exile-color-bg-surface)] disabled:opacity-50"
              >
                相場
              </button>
              <button
                v-if="op.result?.searchUrl"
                type="button"
                @click="emit('open', op.result!.searchUrl)"
                class="ml-1 px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[11px] hover:bg-[var(--exile-color-bg-surface)]"
                title="trade2 で開く"
              >
                ↗
              </button>
            </td>
          </tr>
        </template>
        <tr v-if="rows.length === 0">
          <td colspan="8" class="px-3 py-4 text-center text-[var(--exile-color-text-tertiary)] italic">この装備に使えるエッセンスはありません</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

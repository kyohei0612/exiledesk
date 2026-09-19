<!--
  EntryTable.vue — 売れた品の一覧 (日付ごとにまとめて、その日の合計つき)
  2026-09-19 に TradeHistory.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import { computed } from "vue";
import { currencyJa, displayCurrency } from "../../state/display-currency";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";
import { toExalted } from "../../services/trade2/pricing";
import { marketStore } from "../../state/market-store";
import { dayKey, dayLabel, fmtAmount, fmtHM, rarityClass, startOfDay } from "./format";
import type { TradeEntry } from "../../services/trade-history";

const props = defineProps<{ entries: TradeEntry[]; visible: TradeEntry[]; game: string }>();
const entries = computed(() => props.entries);
const game = computed(() => props.game);
const money = (n: number | null | undefined): string => displayCurrency.money(n);
const curLabel = currencyJa;
/** クライアントと同じ日本語名 (ユニーク名とベース名を別々に引く) */
const jaName = (e: TradeEntry): string => (e.name ? jaUniqueName(e.name) : "");
const jaType = (e: TradeEntry): string => (e.typeLine ? jaTypeName(e.typeLine) : "");
/** PoE2 の通貨だけ高貴に換算できる (換算レートは PoE2 の相場) */
function exaltedOf(e: TradeEntry): number | null {
  if (game.value !== "poe2" || e.amount == null || !e.currency) return null;
  return toExalted(e.amount, e.currency, marketStore.rates.value);
}
const valueOf = (e: TradeEntry): number => exaltedOf(e) ?? 0;

/** 一覧は日付ごとにまとめる (新しい日が上) */
const dayGroups = computed(() => {
  const map = new Map<string, { start: number; list: TradeEntry[]; total: number }>();
  for (const e of props.visible) {
    const k = dayKey(e.time);
    const g = map.get(k) ?? { start: startOfDay(e.time), list: [], total: 0 };
    g.list.push(e);
    g.total += valueOf(e);
    map.set(k, g);
  }
  const out = [...map.values()].sort((a, b) => b.start - a.start);
  for (const g of out) g.list.sort((a, b) => b.time - a.time);
  return out;
});
</script>

<template>
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] p-3 text-[12px] overflow-x-auto">
      <p v-if="entries.length === 0" class="text-[var(--exile-color-text-tertiary)]">
        まだ履歴がありません。ログインして「履歴を取得」を押すと、公式サイトのマーチャント履歴がここに入ります。
      </p>
      <table v-else class="w-full">
        <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
          <tr>
            <th class="text-left font-normal pb-1 whitespace-nowrap">時刻</th>
            <th class="text-left font-normal pb-1 pl-3">アイテム</th>
            <th class="text-right font-normal pb-1 pl-3">数</th>
            <th class="text-right font-normal pb-1 pl-3">売値</th>
            <th v-if="game === 'poe2'" class="text-right font-normal pb-1 pl-3">換算</th>
          </tr>
        </thead>
        <tbody v-for="g in dayGroups" :key="g.start">
          <!-- 日付の見出し (その日の合計つき) -->
          <tr class="border-t border-[var(--exile-color-border-brass)]">
            <td :colspan="game === 'poe2' ? 5 : 4" class="pt-3 pb-1">
              <div class="flex items-baseline gap-3">
                <span class="font-display tracking-[0.06em] text-[13px] text-[var(--exile-color-accent-focus)]">{{ dayLabel(g.start) }}</span>
                <span v-if="game === 'poe2'" class="tabular-nums text-emerald-300">{{ money(g.total) }}</span>
                <span class="text-[11px] text-[var(--exile-color-text-tertiary)] tabular-nums">{{ g.list.length }} 件</span>
              </div>
            </td>
          </tr>
          <tr v-for="e in g.list" :key="e.key" class="border-t border-[var(--exile-color-border-subtle)]">
            <td class="py-1 tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ fmtHM(e.time) }}</td>
            <td class="py-1 pl-3">
              <div class="flex items-center gap-2 min-w-0">
                <img v-if="e.icon" :src="e.icon" alt="" class="w-6 h-6 object-contain shrink-0" loading="lazy" />
                <span class="min-w-0" :class="rarityClass(e.rarity)" :title="`${e.name} ${e.typeLine}`.trim()">
                  <span v-if="e.name" class="mr-1.5">{{ jaName(e) }}</span><span :class="e.name ? 'text-[var(--exile-color-text-secondary)]' : ''">{{ jaType(e) }}</span>
                  <span v-if="e.ilvl" class="text-[10px] text-[var(--exile-color-text-tertiary)]"> ilvl {{ e.ilvl }}</span>
                </span>
              </div>
            </td>
            <td class="py-1 pl-3 text-right tabular-nums">{{ e.stack ?? "" }}</td>
            <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ e.amount != null ? `${fmtAmount(e.amount)} ${curLabel(e.currency)}` : "—" }}</td>
            <td v-if="game === 'poe2'" class="py-1 pl-3 text-right tabular-nums whitespace-nowrap text-[var(--exile-color-text-secondary)]">{{ money(exaltedOf(e)) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
        取った履歴はリーグごとにこの PC に残ります (公式サイトは直近の分しか返さないため、古い分も消さずに足していきます)。換算は今の相場 (カレンシーランキング) で、売れた時の相場ではありません。
      </p>
    </div>
</template>

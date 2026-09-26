<!--
  LedgerCard.vue — 収支 (実績入力。使った数・完成数・神のオーブの回数から損益を出す)
  Overquality.vue から切り出し (2026-09-26)。中身は変えていない。
-->
<script setup lang="ts">
import { evClass } from "../../utils/ev-class";
import { computed, ref, watch } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import MoneyInput from "../../components/vaal-scales/MoneyInput.vue";
import { displayCurrency } from "../../state/display-currency";
import { marketStore } from "../../state/market-store";
import { pct } from "./format";
import type { useOverquality } from "./useOverquality";

const props = defineProps<{ o: ReturnType<typeof useOverquality> }>();
const o = props.o;
const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });

/**
 * 収支 (実績): 実際に使った素材の数と、完成した数、神のオーブでリロールした回数を手で入れて損益を出す (オーナー指示 2026-09-13)。
 * 数は手入力、単価は相場 (ワンド・完成品は trade2、その他はカレンシーランキング)。売値だけは実際に売った額に直せる。
 * 入力は localStorage に残す (この PC だけ)。
 */
const LEDGER_KEY = "exiledesk.adonia.ledger";
interface Ledger {
  wands: number;
  etchers: number;
  infusers: number;
  omens: number;
  chances: number;
  divines: number;
  finished: number;
  /** 実際に売った 1 個あたりの額 (高貴)。null なら相場の売値 */
  soldEach: number | null;
}
const EMPTY_LEDGER: Ledger = { wands: 0, etchers: 0, infusers: 0, omens: 0, chances: 0, divines: 0, finished: 0, soldEach: null };
function loadLedger(): Ledger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? { ...EMPTY_LEDGER, ...(JSON.parse(raw) as Partial<Ledger>) } : { ...EMPTY_LEDGER };
  } catch {
    return { ...EMPTY_LEDGER };
  }
}
const ledger = ref<Ledger>(loadLedger());
watch(
  ledger,
  (v) => {
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(v));
    } catch {
      /* 保存できなくても動く */
    }
  },
  { deep: true },
);
function resetLedger(): void {
  ledger.value = { ...EMPTY_LEDGER };
}
const divinePrice = computed(() => marketStore.priceOf("divine"));
const ledgerRows = computed(() => {
  const l = ledger.value;
  const n = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const rows = [
    { key: "wands", label: "吸収のワンド", unit: o.autoBasePrice.value, qty: n(l.wands) },
    { key: "etchers", label: o.preset.value.qualityCurrencyJa, unit: o.auto.value.qualityCurrency, qty: n(l.etchers) },
    { key: "infusers", label: o.preset.value.infuserJa, unit: o.auto.value.infuser, qty: n(l.infusers) },
    { key: "omens", label: "可能性のお告げ", unit: o.auto.value.omen, qty: n(l.omens) },
    { key: "chances", label: "可能性のオーブ", unit: o.auto.value.chance, qty: n(l.chances) },
    { key: "divines", label: "神のオーブ (完成品のリロール)", unit: divinePrice.value, qty: n(l.divines) },
  ];
  return rows.map((r) => ({ ...r, cost: r.unit == null ? null : r.unit * r.qty }));
});
const ledgerTotals = computed(() => {
  const l = ledger.value;
  const rows = ledgerRows.value;
  const missing = rows.some((r) => r.qty > 0 && r.cost == null);
  const cost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  const each = l.soldEach ?? o.salePrice.value;
  const finished = Number.isFinite(l.finished) && l.finished > 0 ? l.finished : 0;
  const revenue = each == null ? null : each * finished;
  const attempts = Number.isFinite(l.wands) && l.wands > 0 ? l.wands : 0;
  return {
    cost,
    missing,
    each,
    finished,
    revenue,
    profit: revenue == null ? null : revenue - cost,
    /** 実測の生存率 (完成数 ÷ ワンド数) */
    rate: attempts > 0 ? finished / attempts : null,
    /** 完成 1 個あたりの実コスト */
    perFinished: finished > 0 ? cost / finished : null,
  };
});
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">収支</h2>
          <div class="flex items-center gap-3 text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>実際に使った数を入れる。単価は上の相場、売値は相場か実売</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)]" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
        <table class="w-full text-[12px]">
          <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
            <tr>
              <th class="text-left font-normal pb-1">素材</th>
              <th class="text-right font-normal pb-1 pl-3">単価</th>
              <th class="text-right font-normal pb-1 pl-3">使った数</th>
              <th class="text-right font-normal pb-1 pl-3">費用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in ledgerRows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
              <td class="py-1.5 pr-2">{{ r.label }}</td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.unit) }}</td>
              <td class="py-1.5 pl-3 text-right">
                <input v-model.number="ledger[r.key as keyof typeof ledger]" type="number" min="0" step="1" class="num w-24" />
              </td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
            </tr>
            <tr class="border-t border-[var(--exile-color-border-brass)]">
              <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
              <td></td>
              <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                {{ ledgerTotals.rate != null ? `実測生存率 ${pct(ledgerTotals.rate)}` : "" }}
              </td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.cost) }}</td>
            </tr>
            <tr class="border-t border-[var(--exile-color-border-subtle)]">
              <td class="py-1.5 pr-2">完成したアドニアのエゴ</td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                <MoneyInput v-model="ledger.soldEach" :placeholder-exalted="o.salePrice.value" width="w-24" />
              </td>
              <td class="py-1.5 pl-3 text-right">
                <input v-model.number="ledger.finished" type="number" min="0" step="1" class="num w-24" />
              </td>
              <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.revenue) }}</td>
            </tr>
            <tr class="border-t border-[var(--exile-color-border-brass)]">
              <td class="py-1.5 pr-2 font-display tracking-[0.04em]">収支</td>
              <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                {{ ledgerTotals.perFinished != null ? `完成 1 個あたり ${money(ledgerTotals.perFinished)}` : "" }}
              </td>
              <td></td>
              <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ ledgerTotals.profit == null ? "—" : money(ledgerTotals.profit, true) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
          売値の欄は空欄なら上の相場 (アドニアのエゴ 30% の最安)、実際に売れた額があればそれを入れてください。神のオーブは完成品のロール直しに使った数。入力はこの PC に残ります。
          <span v-if="ledgerTotals.missing" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
        </p>
      </div>
    </BaseCard>
</template>

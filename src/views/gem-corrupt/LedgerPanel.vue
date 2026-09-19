<!--
  LedgerPanel.vue — 収支 (実績入力)。計算の本体は gem-corrupt/ledger.ts
  2026-09-19 に GemCorrupt.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import BaseCard from "../../components/decor/BaseCard.vue";
import MoneyInput from "../../components/vaal-scales/MoneyInput.vue";
import { fmtQty, type GemLedgerApi } from "./ledger";
import { evClass, fmtStamp, money } from "./ui";
import type { useGemCorrupt } from "./useGemCorrupt";

const props = defineProps<{ g: ReturnType<typeof useGemCorrupt>; api: GemLedgerApi }>();
const g = props.g;
const {
  ledger, ledgerRows, ledgerSales, ledgerTotals,
  setAttempts, setRoute, setQty, setSold, setUnit, setEach,
  resetLedger, clearCounts, refreshLedgerPrices,
} = props.api;
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">
            収支<span v-if="g.selected.value" class="text-[12px] text-[var(--exile-color-text-secondary)] tracking-normal"> · {{ g.selected.value.ja }}</span>
          </h2>
          <div class="flex items-center gap-3 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <span>経路と回数を入れると使った数と売れた数が期待値で埋まる。実際と違う数だけ上書き</span>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40" :disabled="!g.selected.value" title="上書きした数を消して、回数から出る期待値に戻します (回数・経路・単価はそのまま)" @click="clearCounts">数を期待値に戻す</button>
            <button type="button" class="underline hover:text-[var(--exile-color-accent-focus)] disabled:opacity-40" :disabled="!g.selected.value" @click="resetLedger">全部 0 に</button>
          </div>
        </div>
        <p v-if="!g.selected.value" class="text-[12px] text-[var(--exile-color-text-tertiary)]">ジェムを選ぶと、そのジェムの帳簿が出ます。</p>
        <template v-else>
          <div class="mb-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-[var(--exile-color-text-secondary)]">
            <label class="inline-flex items-center gap-2 min-w-0 max-w-full">
              経路
              <select :value="ledger.route ?? ''" class="num w-72 max-w-full min-w-0" @change="setRoute">
                <option value="">最も得に合わせる{{ g.best.value ? ` (${g.best.value.label})` : "" }}</option>
                <option v-for="r in g.routes.value" :key="r.id" :value="r.id">{{ r.label }}</option>
              </select>
            </label>
            <label class="inline-flex items-center gap-2">
              回数
              <input :value="ledger.attempts || ''" type="number" min="0" step="1" placeholder="0" class="num w-20" @input="setAttempts" />
            </label>
            <span v-if="ledger.pricesAt">
              単価は {{ fmtStamp(ledger.pricesAt) }} 時点で固定
              <button type="button" class="ml-1 underline hover:text-[var(--exile-color-accent-focus)]" @click="refreshLedgerPrices">今の相場に更新</button>
            </span>
          </div>
          <!--
            オーナー指摘 (2026-09-17): 数字を打つと表の幅が動いて画面全体がズレる。
            自動列幅だと中身の桁数で毎回配分し直されるため、table-fixed + colgroup で固定する。
          -->
          <div class="overflow-x-auto">
          <table class="w-full table-fixed min-w-[36rem] text-[12px] break-words">
            <colgroup>
              <col />
              <col class="w-[13rem]" />
              <col class="w-[11rem]" />
              <col class="w-[8rem]" />
            </colgroup>
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">素材</th>
                <th class="text-right font-normal pb-1 pl-3">単価 (空欄は固定した値 / 相場)</th>
                <th class="text-right font-normal pb-1 pl-3">使った数 (空欄は 1 回の数 × 回数)</th>
                <th class="text-right font-normal pb-1 pl-3">費用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerRows" :key="r.key" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">
                  <div>{{ r.label }}</div>
                  <div v-if="r.hint" class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ r.hint }}</div>
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                  <MoneyInput
                    :model-value="r.each"
                    :placeholder-exalted="r.pinned ?? r.market"
                    width="w-24"
                    @update:model-value="setUnit(r.key, $event)"
                  />
                </td>
                <td class="py-1.5 pl-3 text-right">
                  <input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtQty(r.auto)" class="num w-24" @input="setQty(r.key, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.cost) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">費用合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.cost) }}</td>
              </tr>
            </tbody>
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pt-3 pb-1">売れた物</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">1 個の売値 (空欄なら相場)</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">売れた数</th>
                <th class="text-right font-normal pt-3 pb-1 pl-3">売上</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in ledgerSales" :key="r.qtyKey" class="border-t border-[var(--exile-color-border-subtle)]">
                <td class="py-1.5 pr-2">{{ r.label }}</td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">
                  <MoneyInput :model-value="r.each" :placeholder-exalted="r.market" width="w-24" @update:model-value="setEach(r.eachKey, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right">
                  <input :value="r.override ?? ''" type="number" min="0" step="1" :placeholder="fmtQty(r.auto)" class="num w-24" @input="setSold(r.qtyKey, $event)" />
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.revenue) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">売上合計</td>
                <td></td>
                <td></td>
                <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(ledgerTotals.revenue) }}</td>
              </tr>
              <tr class="border-t border-[var(--exile-color-border-brass)]">
                <td class="py-1.5 pr-2 font-display tracking-[0.04em]">収支</td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                  {{ ledgerTotals.perFinished != null ? `完成 1 個あたり ${money(ledgerTotals.perFinished)}` : "" }}
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
                  {{ ledgerTotals.perAttempt != null ? `1 回あたり ${money(ledgerTotals.perAttempt, true)}` : "" }}
                </td>
                <td class="py-1.5 pl-3 text-right tabular-nums text-[14px] whitespace-nowrap" :class="evClass(ledgerTotals.profit)">{{ money(ledgerTotals.profit, true) }}</td>
              </tr>
            </tbody>
          </table>
          </div>
          <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-2">
            単価は回数を入れた時点の値 (相場と取引所の安い方) で固定します。あとで相場が動いても、やった分の費用は変わりません。実際に払った額が違う時は単価の欄に直接入れてください (空欄に戻すと固定値に戻ります)。素材の「取引所で比べる」を押すと、その結果で固定単価も入れ替えます (手入力した分はそのまま)。「今の相場に更新」でも固定し直せます。
            使った数と売れた数は空欄なら「経路の 1 回の数 × 回数」で、結晶・原石・売れた数のように結果次第の物は期待値です。実際に違った数だけ入れてください。
            回数を入れた時点の「最も得」の経路で帳簿を固定します (相場が変わっても、やった分を別の経路で数え直さない)。
            買ったジェムと売れた物の値段は空欄なら上の売値 (trade2 最安)、実際の額があればそれを入れてください。「その他」は外れの生存品などで、空欄の売値は前提の割合から出した平均です。入力はジェムごとにこの PC に残ります。
            <span v-if="ledgerTotals.missingCost" class="text-amber-300">相場が取れていない素材があるため費用が不完全です。</span>
            <span v-if="ledgerTotals.missingSale" class="text-amber-300">売値が無い行があるため売上が不完全です。</span>
          </p>
        </template>
      </div>
    </BaseCard>
</template>

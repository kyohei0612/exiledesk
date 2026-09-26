<!--
  RoutesPanel.vue — 経路の比較 (結論 1 行 + 経路の表 + やった場合の表)
  2026-09-19 に GemCorrupt.vue から切り出し。中身は変えていない。
-->
<script setup lang="ts">
import AttemptsSelect from "../../components/AttemptsSelect.vue";
import { computed, ref } from "vue";
import BaseCard from "../../components/decor/BaseCard.vue";
import { displayCurrency, type DisplayCurrency } from "../../state/display-currency";
import { budgetRisk, roi, type RouteResult } from "./model";
import { evClass, money, pct, unit } from "./ui";
import type { useGemCorrupt } from "./useGemCorrupt";

const props = defineProps<{ g: ReturnType<typeof useGemCorrupt> }>();
const g = props.g;
/**
 * 「N 回やった場合」の N。素材の札と同じ値を見る (親が持っていて、どちらから変えても揃う)。
 * 2026-09-20 オーナー「収支計算・素材計算周りの同期がエラーかも」: ここが props から作った
 * **読み取り専用の computed** だったので、この札のプルダウンを 50 にしても表は 10 回のままだった。
 */
const attempts = defineModel<number>("attempts", { required: true });

const expanded = ref<Record<string, boolean>>({});
function isBest(r: RouteResult): boolean {
  return !!g.best.value && g.best.value.id === r.id;
}

type CompareMode = "attempts" | "budget";
// 既定は「回数で比べる」(オーナー指示 2026-09-20:「デフォで期待値計算の選択は予算じゃなくて回数で」)
const compareMode = ref<CompareMode>("attempts");
/** 表示通貨 100 を高貴建てにした額 */
const hundredEx = computed(() => displayCurrency.fromDisplay(100) ?? 100);
/** 100 (表示通貨) 入れた時の平均損益 (高貴建て) */
function per100(r: RouteResult): number | null {
  const v = roi(r);
  return v == null ? null : v * hundredEx.value;
}
/** 利回りの高い順 (計算できない経路は最後) */
const routesSorted = computed(() =>
  [...g.routes.value].sort((a, b) => (roi(b) ?? Number.NEGATIVE_INFINITY) - (roi(a) ?? Number.NEGATIVE_INFINITY)),
);
/** 予算の選択肢 (表示通貨ごと)。2026-09-16 オーナー指示: 表示通貨 (高貴 / カオス / 神) の単位で選べるように */
const BUDGET_OPTIONS: Record<DisplayCurrency, number[]> = {
  exalted: [1000, 2000, 5000, 10000, 20000, 50000],
  chaos: [50, 100, 200, 500, 1000, 2000],
  divine: [5, 10, 20, 50, 100],
};
const budgetOptions = computed(() => BUDGET_OPTIONS[displayCurrency.cur.value]);
/** 選んだ予算 (高貴建て)。未選択は 20 神相当。通貨を切り替えたら一番近い選択肢に寄せる */
const budgetChosenEx = ref<number | null>(null);
const budgetDisplay = computed<number>({
  get: () => {
    const ex = budgetChosenEx.value ?? 20 * (g.divineRate.value > 0 ? g.divineRate.value : 1);
    const d = displayCurrency.toDisplay(ex) ?? 0;
    return budgetOptions.value.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a));
  },
  set: (v) => {
    budgetChosenEx.value = displayCurrency.fromDisplay(v);
  },
});
const budgetExalted = computed(() => displayCurrency.fromDisplay(budgetDisplay.value) ?? 0);
/** やった場合 (回数 / 予算)。予算が 1 回分の費用に届かない経路は「予算不足」 */
const atCompare = computed(() =>
  routesSorted.value.flatMap((r) => {
    if (!r.ok) return [];
    const byBudget = compareMode.value === "budget";
    const short = byBudget && r.expectedCost > budgetExalted.value;
    const risk = short ? null : budgetRisk(r, byBudget ? budgetExalted.value : attempts.value * r.expectedCost);
    return [{ id: r.id, label: r.label, cost1: r.expectedCost, short, risk }];
  }),
);
/** 結論の 1 行 */
const summary = computed(() => {
  const b = g.best.value;
  if (!b) return null;
  if (b.id === "buyFinished") return { buyFinished: true as const };
  const risk = budgetRisk(b, attempts.value * b.expectedCost);
  return { buyFinished: false as const, label: b.label, per100: per100(b), attempts: attempts.value, pLoss: risk?.pLoss ?? null };
});
</script>

<template>
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <h2 class="text-sm font-bold text-amber-100 mb-2"><span class="mr-2 rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">3</span>経路の比較</h2>
        <p v-if="summary" class="text-[14px] mb-3 leading-relaxed">
          <template v-if="summary.buyFinished">今の相場では、どの経路も<span class="font-display text-[var(--exile-color-accent-focus)]">完成品を買う</span>より損です。</template>
          <template v-else>
            今の相場なら <span class="font-display text-[var(--exile-color-accent-focus)]">{{ summary.label }}</span> が一番得:
            100 {{ unit }} 入れると平均 <span class="font-display tabular-nums text-[16px]" :class="evClass(summary.per100)">{{ money(summary.per100, true) }}</span>
            <span class="text-[12px] text-[var(--exile-color-text-secondary)]">({{ summary.attempts }} 回やって赤字になる確率 {{ summary.pLoss == null ? "—" : pct(summary.pLoss) }})</span>
          </template>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-[12px]">
            <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
              <tr>
                <th class="text-left font-normal pb-1">経路</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">1 回の費用</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">100 {{ unit }} あたりの損益</th>
                <th class="text-right font-normal pb-1 pl-3 whitespace-nowrap">完成品ができる確率</th>
                <th class="pb-1 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in routesSorted" :key="r.id">
                <tr class="border-t border-[var(--exile-color-border-subtle)]" :class="isBest(r) ? 'text-[var(--exile-color-accent-focus)]' : ''">
                  <td class="py-1.5 pr-2">
                    <span>{{ r.label }}</span>
                    <span v-if="isBest(r)" class="ml-2 text-[10px] px-1 rounded bg-[var(--exile-color-accent-focus)]/15 text-[var(--exile-color-accent-focus)]">最も得</span>
                    <div v-if="r.id === 'craft' && r.ok" class="text-[10px] text-[var(--exile-color-text-tertiary)]">
                      レベル +1 のあと: {{ r.gambleAfterLevel ? "結晶で品質を賭ける" : "そのまま売る" }} / 品質 23% のあと: {{ r.gambleAfterQuality ? "結晶でレベルを賭ける" : "そのまま売る" }}
                    </div>
                  </td>
                  <template v-if="r.ok">
                    <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.expectedCost) }}</td>
                    <td class="py-1.5 pl-3 text-right tabular-nums whitespace-nowrap text-[14px]" :class="evClass(r.id === 'buyFinished' ? null : per100(r))">{{ r.id === "buyFinished" ? "0 (基準)" : money(per100(r), true) }}</td>
                    <td class="py-1.5 pl-3 text-right tabular-nums">{{ pct(r.pFinished) }}</td>
                    <td class="py-1.5 pl-3 text-right whitespace-nowrap">
                      <button type="button" class="text-[11px] underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="expanded[r.id] = !expanded[r.id]">{{ expanded[r.id] ? "▲ 内訳" : "▼ 内訳" }}</button>
                    </td>
                  </template>
                  <td v-else colspan="4" class="py-1.5 pl-3 text-[11px] text-[var(--exile-color-text-tertiary)]">不足: {{ r.missing.join("、") }}</td>
                </tr>
                <tr v-if="r.ok && expanded[r.id]">
                  <td colspan="5" class="pb-2 pl-3">
                    <div class="flex flex-wrap gap-x-5 gap-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)] mb-1">
                      <span>1 回の期待収支 <span class="tabular-nums" :class="evClass(r.id === 'buyFinished' ? null : r.ev)">{{ money(r.ev, true) }}</span></span>
                      <span>確定費用 <span class="tabular-nums">{{ money(r.upfront) }}</span> (+ 結晶と原石の期待費用)</span>
                      <span v-if="r.costPerFinished != null && r.costPerFinished > 0">完成品 1 個の実質コスト <span class="tabular-nums">{{ money(r.costPerFinished) }}</span></span>
                    </div>
                    <table class="w-full text-[11px]">
                      <tbody>
                        <tr v-for="(o, i) in r.outcomes" :key="i" class="border-t border-[var(--exile-color-border-subtle)]">
                          <td class="py-0.5 pr-1">{{ o.label }}</td>
                          <td class="py-0.5 text-right tabular-nums w-14">{{ pct(o.p) }}</td>
                          <td class="py-0.5 text-right tabular-nums w-24">{{ money(o.net) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div v-if="atCompare.length > 0" class="mt-3 rounded-lg bg-black/20 p-3 text-[12px]">
          <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span class="font-bold">やった場合</span>
            <div class="flex items-center gap-3 flex-wrap text-[11px]">
              <div class="inline-flex rounded border border-[var(--exile-color-border-subtle)] overflow-hidden">
                <button type="button" class="px-2 py-0.5" :class="compareMode === 'attempts' ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'" @click="compareMode = 'attempts'">回数で比べる</button>
                <button type="button" class="px-2 py-0.5" :class="compareMode === 'budget' ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-secondary)]'" @click="compareMode = 'budget'">予算で比べる</button>
              </div>
              <label v-if="compareMode === 'attempts'" class="inline-flex items-center gap-2 text-[var(--exile-color-text-secondary)]">
                回数
                <AttemptsSelect v-model="attempts" />
              </label>
              <label v-else class="inline-flex items-center gap-2 text-[var(--exile-color-text-secondary)]">
                予算
                <select v-model.number="budgetDisplay" class="num w-28">
                  <option v-for="v in budgetOptions" :key="v" :value="v">{{ v }} {{ unit }}</option>
                </select>
              </label>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-[12px]">
              <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
                <tr>
                  <th class="text-left font-normal pb-1">経路</th>
                  <th class="text-right font-normal pb-1 pl-3">回数</th>
                  <th class="text-right font-normal pb-1 pl-3">総費用</th>
                  <th class="text-right font-normal pb-1 pl-3">期待損益</th>
                  <th class="text-right font-normal pb-1 pl-3">赤字の確率</th>
                  <th class="text-right font-normal pb-1 pl-3">完成品 1 個以上</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in atCompare" :key="r.id" class="border-t border-[var(--exile-color-border-subtle)]" :class="g.best.value && g.best.value.id === r.id ? 'text-[var(--exile-color-accent-focus)]' : ''">
                  <td class="py-1 pr-2">{{ r.label }}</td>
                  <td v-if="r.short || !r.risk" colspan="5" class="py-1 pl-3 text-right text-[11px] text-[var(--exile-color-text-tertiary)]">予算不足 (1 回 {{ money(r.cost1) }})</td>
                  <template v-else>
                    <td class="py-1 pl-3 text-right tabular-nums">{{ r.risk.attempts }} 回</td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ money(r.risk.cost) }}</td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap" :class="evClass(r.id === 'buyFinished' ? null : r.risk.profit)">{{ r.id === "buyFinished" ? "0 (基準)" : money(r.risk.profit, true) }}</td>
                    <td class="py-1 pl-3 text-right tabular-nums">{{ r.id === "buyFinished" ? "—" : pct(r.risk.pLoss) }}</td>
                    <td class="py-1 pl-3 text-right tabular-nums whitespace-nowrap">{{ pct(r.risk.pAnyFinished) }} ({{ r.risk.expectedFinished.toFixed(2) }} 個)</td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <!-- 長い説明は畳んでおく (オーナー指示 2026-09-20) -->
        <details class="mt-3">
          <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer select-none hover:text-[var(--exile-color-accent-focus)]">
            比べ方と「100 {{ unit }} あたりの損益」の意味
          </summary>
          <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)] mt-1">
            <span class="text-[var(--exile-color-text-secondary)]">回数で比べる</span>: どの経路も同じ回数。
            <span class="text-[var(--exile-color-text-secondary)]">予算で比べる</span>: 回数 = 予算 ÷ 1 回の費用 (切り捨て)、1 回分に届かない経路は予算不足。
            期待損益は平均、赤字の確率は結果ごとの損益を回数ぶん引く試行を 1 万回やった中で赤字に終わった割合です (出来た物は全部その相場で売れた前提)。
          </p>
          <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)] mt-2">
            <span class="text-[var(--exile-color-text-secondary)]">「100 {{ unit }} あたりの損益」</span>= 1 回の期待収支 ÷ 1 回の費用 × 100 {{ unit }}。
            1 回の費用が経路ごとに数十倍違うので、金額ではなく投資額あたりで比べ、一番高い経路を「最も得」にしています。
            1 回の費用は確定費用に結晶と原石の期待費用を足した額。完成品を買う経路が 0 の基準です。
          </p>
        </details>
      </div>
    </BaseCard>
</template>

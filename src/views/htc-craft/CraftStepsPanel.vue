<script setup lang="ts">
/**
 * CraftStepsPanel.vue — 作り方を 1 手ずつ (2026-09-23)
 *
 * オーナー:「1 個 1 個確率出していこう、次へ みたいな。実際の UI 適当でいいから作ってみて。
 * 最終完成品はトータルコストの期待値で予算予想って出せばいい」。
 * 「完成品とベースが離れてるほど作った方が良い」ので、最後に売値とベースの差と並べる。
 * カードは [[craft-steps.ts]]、予算は [[budget.ts]] (スパムの組み立てと共通)。
 */
import { computed, ref, watch } from "vue";
import { craftBudgetDivine, reachWithin } from "./budget";
import { craftSteps } from "./craft-steps";
import type { MissPlan } from "../../services/htc/spam-total";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; listingDivine: number | null }>();
const c = props.c;
const div = computed(() => c.prices.value?.currency.divine ?? null);

const cards = computed(() => (c.spam.value ? craftSteps(c.spam.value, c.stepTarget, c.money) : []));
/** 0 = ベース、1..n = 手、n+1 = 完成 */
const at = ref(0);
watch(cards, () => { at.value = 0; });
const last = computed(() => cards.value.length + 1);
const card = computed(() => (at.value >= 1 && at.value <= cards.value.length ? cards.value[at.value - 1]! : null));

const reach = computed(() => {
  const t = c.spam.value?.total;
  return t && div.value ? reachWithin(t, craftBudgetDivine.value * div.value) : [];
});
/** この手の前までの支出の期待値 (累計) */
const spentBefore = computed(() => cards.value.slice(0, Math.max(0, at.value - 1)).reduce((a, x) => a + x.spend, 0));
const stage = computed(() => reach.value.find((r) => r.label === card.value?.stage) ?? null);

/** ベースの値段 (高貴換算)。樹 MOD の固定済みを取っていればその判定の平均、無ければ不明 */
const baseCost = computed<number | null>(() => {
  const d = c.treeResult.value?.decision, v = div.value;
  return d && v ? d.expected * v : null;
});
const total = computed(() => c.spam.value?.total ?? null);
/** 売値 − ベース と 作る平均 の比べ。プラスなら作る方が安い */
const verdict = computed(() => {
  const v = div.value, t = total.value;
  if (!props.listingDivine || !v || !t) return null;
  const listing = props.listingDivine * v;
  const gap = listing - (baseCost.value ?? 0);
  return { listing, gap, diff: gap - t.expected };
});
/** 消去が当たった物と、その後どうなるか */
const outcomeJa = (o: MissPlan["outcomes"][number]): string =>
  o.kind === "junk" ? "外れが消える (成功。この手に戻る)"
    : o.kind === "spam" ? `スパムの狙い「${c.stepTarget([o.modId!])}」が消える → 剥がしてスパムからやり直し`
      : o.kind === "target" ? `付けた「${c.stepTarget([o.modId!])}」が消える → 外れを消し直して付け直し`
        : "ブリーチの MOD が消える (付け直しは次の触媒の高貴のお告げの前)";
const pct = (p: number): string => (p >= 0.995 ? "100" : (p * 100).toFixed(p < 0.1 ? 1 : 0));
const reachClass = (p: number): string => (p >= 0.8 ? "text-emerald-300" : p >= 0.5 ? "text-amber-300" : "text-rose-300");
</script>

<template>
  <div v-if="total" class="text-xs">
    <p class="mb-2 opacity-70">
      予算 <input v-model.number="craftBudgetDivine" type="number" min="1" step="50" class="num w-20" /> 神 —
      進めるのは狙いの MOD の数だけ。1 手ごとに当たる確率・支出の期待値と、外れた時のリカバリーを出します。
    </p>

    <!-- どこにいるか。押せば飛べる -->
    <div class="mb-2 flex flex-wrap gap-1">
      <button
        v-for="i in last + 1" :key="i" type="button" class="rounded border px-1.5"
        :class="at === i - 1 ? 'border-amber-400 text-amber-300' : 'border-white/10 opacity-60'"
        @click="at = i - 1"
      >{{ i === 1 ? "ベース" : i === last + 1 ? "完成" : i - 1 }}</button>
    </div>

    <div class="rounded border border-white/10 bg-white/5 p-3">
      <!-- 0: ベース -->
      <template v-if="at === 0">
        <b class="text-sm">0. ベースを用意する</b>
        <p class="mt-1">{{ c.item.value?.baseText ?? "" }} ({{ c.item.value?.baseType ?? "" }}) / ilvl {{ c.item.value?.itemLevel ?? "?" }}</p>
        <p v-if="c.dropOnly.value.length" class="mt-1">
          作れない MOD (樹 MOD) が付いた<b>固定済み</b>を買う:
          <b v-if="baseCost != null">平均 {{ c.money(baseCost) }}</b>
          <span v-else class="text-amber-300">値段はまだ取っていません (① の樹 MOD の検索で入ります)</span>
        </p>
        <p v-else class="mt-1 opacity-70">素のベース (安いので値段は数えていません)</p>
      </template>

      <!-- 1..n: 手 -->
      <template v-else-if="card">
        <b class="text-sm">{{ at }}. {{ card.title }}</b>
        <table class="mt-2">
          <tr><td class="pr-3 opacity-60">打つ物</td><td>{{ card.action }}</td></tr>
          <tr>
            <td class="pr-3 opacity-60">1 回で当たる</td>
            <td><b>{{ card.odds >= 1 ? "確定" : `1/${(1 / card.odds).toFixed(1)} (${pct(card.odds)}%)` }}</b></td>
          </tr>
          <tr><td class="pr-3 opacity-60">1 回の値段</td><td>{{ c.money(card.perTry) }}</td></tr>
          <tr v-if="card.odds < 1">
            <td class="pr-3 opacity-60">当たるまで</td>
            <td>平均 {{ (1 / card.odds).toFixed(1) }} 回</td>
          </tr>
          <tr>
            <td class="pr-3 opacity-60">この手の支出</td>
            <td>
              期待値 <b class="text-amber-300">{{ c.money(card.spend) }}</b>
              <span class="opacity-60">(外れの後始末・やり直し込み)</span>
              — ここまでの累計 {{ c.money(spentBefore + card.spend) }}
            </td>
          </tr>
          <tr v-if="card.onMiss"><td class="pr-3 align-top opacity-60">外れたら</td><td>{{ card.onMiss }}</td></tr>
          <tr v-if="card.miss">
            <td class="pr-3 align-top opacity-60">外れたら</td>
            <td>
              <b class="text-rose-300">{{ pct(card.miss.p) }}%</b> で外れ → <b>{{ card.miss.action }}</b>
              <div v-for="(o, i) in card.miss.outcomes" :key="i" class="pl-3">
                {{ (o.p * 100).toFixed(0) }}%: {{ outcomeJa(o) }}
              </div>
              <div class="mt-0.5">外れ 1 回の損 (リカバリーの期待値) <b class="text-rose-300">{{ c.money(card.miss.loss) }}</b></div>
            </td>
          </tr>
        </table>
        <p v-if="stage" class="mt-2 text-sky-300">
          ここは「{{ stage.label }}」の段階 — そこまでの平均 {{ c.money(stage.mean) }}、
          予算内に届く確率 <b :class="reachClass(stage.p)">{{ pct(stage.p) }}%</b>
        </p>
      </template>

      <!-- 完成 -->
      <template v-else>
        <b class="text-sm">完成</b>
        <p class="mt-1">
          作る費用: 平均 <b>{{ c.money(total.expected) }}</b>
          / 半分の確率で {{ c.money(total.p50) }} / 8 割 {{ c.money(total.p80) }} / 9 割 {{ c.money(total.p90) }}
          <span v-if="baseCost != null" class="opacity-70">(+ ベース {{ c.money(baseCost) }})</span>
        </p>
        <p class="mt-1">
          予算 {{ craftBudgetDivine }} 神で:
          <template v-for="(r, i) in reach" :key="r.label">
            <span v-if="i" class="opacity-50"> → </span>{{ r.label }} <b :class="reachClass(r.p)">{{ pct(r.p) }}%</b>
          </template>
        </p>
        <p class="mt-1 opacity-80">
          予算の目安: 半分の確率で済ませるなら {{ c.money(total.p50) }}、8 割なら {{ c.money(total.p80) }} を用意
        </p>
        <p v-if="verdict" class="mt-2 rounded bg-black/20 p-2">
          完成品の売値 {{ c.money(verdict.listing) }}
          <template v-if="baseCost != null"> − ベース {{ c.money(baseCost) }} = 差 {{ c.money(verdict.gap) }}</template>
          に対して、作る平均 {{ c.money(total.expected) }} →
          <b :class="verdict.diff > 0 ? 'text-emerald-300' : 'text-rose-300'">
            {{ verdict.diff > 0 ? "作る方が" : "買う方が" }} {{ c.money(Math.abs(verdict.diff)) }} 安い
          </b>
        </p>
        <p v-else class="mt-2 opacity-60">完成品の売値 (神) を入れると、買うのと比べます</p>
      </template>
    </div>

    <div class="mt-2 flex gap-2">
      <button type="button" class="rounded border border-white/20 px-3 py-1" :disabled="at === 0" @click="at--">前へ</button>
      <button type="button" class="rounded bg-amber-600/80 px-3 py-1 font-bold" :disabled="at === last" @click="at++">次へ</button>
    </div>
  </div>
</template>

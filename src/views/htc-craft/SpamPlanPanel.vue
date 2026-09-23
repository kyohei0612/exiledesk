<script setup lang="ts">
/**
 * SpamPlanPanel.vue — カオススパムで何を狙い、同じ側の残りをどう足すか (2026-09-23)
 *
 * 計算は [[spam-plan.ts]]、状態は useHtcCraft の `spam` / `catalystChoice` / `spamOverride`。
 * ここは出すだけ。カタリストの使う / 使わないと、スパムの狙いの選び直しだけ受け付けます。
 */
import { computed } from "vue";
import { craftBudgetDivine, reachWithin } from "./budget";
import type { useHtcCraft } from "./useHtcCraft";
import { usePartialBuy } from "./usePartialBuy";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();

/** 途中品を買って始める ([[partial-buy.ts]])。押された時だけ取引所に投げる */
const partial = usePartialBuy({
  data: props.c.data, base: props.c.base, prices: props.c.prices, targets: props.c.targets, spam: props.c.spam,
  treeBuys: computed(() => props.c.treePlan.value?.buys ?? []),
  used: props.c.spamUsed,
  ilvlMin: computed(() => props.c.item.value?.itemLevel ?? undefined),
  baseType: computed(() => props.c.item.value?.baseType ?? undefined),
});
const bestPartial = computed(() => {
  const rows = (partial.rows.value ?? []).filter((r) => r.sum != null);
  return rows.length ? rows.reduce((a, b) => (b.sum! < a.sum! ? b : a)) : null;
});

/** 予算 (神、既定 500)。段階ごとに「予算内でそこまで行ける確率」を数える ([[budget.ts]]) */
const budgetDivine = craftBudgetDivine;
const budgetReach = computed(() => {
  const t = props.c.spam.value?.total, div = props.c.prices.value?.currency.divine;
  if (!t || !div || !(budgetDivine.value > 0)) return [];
  return reachWithin(t, budgetDivine.value * div);
});

const roleJa = { spam: "カオススパム", exalt: "高貴で足す", later: "後で" } as const;
const groupJa = { "no-catalyst": "効くカタリスト無し", "catalyst-off": "カタリストを使わない", catalyst: "カタリストあり", later: "" } as const;
const sideJa = (s: string | null) => (s === "prefix" ? "プレ" : s === "suffix" ? "サフィ" : "");

function toggle(tag: string, on: boolean): void {
  props.c.catalystChoice.value = { ...props.c.catalystChoice.value, [tag]: on };
}
function choose(modId: string): void {
  props.c.spamOverride.value = modId;
}
</script>

<template>
  <div v-if="c.spam.value" class="mt-2 rounded border border-sky-700/50 p-2 text-xs">
    <b>カオススパムの組み立て</b>
    <p class="mt-1 opacity-60">
      固定済み + 外せる MOD 1 つにカオスを打ち、狙いが付いたら同じ側の残りを高貴で足します。外れたら消去。
      スパムの狙いが消えたら剥がしてやり直しです。サフィが揃ったら、プレを削減のお告げ → エッセンス → 冒涜 (光ガチャ) で仕上げます。
    </p>

    <!-- 狙いごとの手とカタリスト。カタリストは種類ごとに使う / 使わないを選べる -->
    <table class="mt-1 w-full">
      <tr class="opacity-50"><th class="text-left">狙い</th><th>側</th><th class="text-left">効くカタリスト (触媒の高貴のお告げ 1 回ぶん)</th><th class="text-left">手</th></tr>
      <tr v-for="m in c.spam.value.methods" :key="m.modId" class="border-b border-white/5 align-top">
        <td class="py-0.5 pr-2">{{ c.stepTarget([m.modId]) }}</td>
        <td class="text-center">{{ sideJa(m.side) }}</td>
        <td>
          <span v-if="!m.catalysts.length" class="opacity-50">{{ m.group === "later" ? "—" : "無し" }}</span>
          <label v-for="k in m.catalysts" :key="k.tag" class="mr-2 whitespace-nowrap" :class="k.unpriced ? 'opacity-40' : ''">
            <input type="checkbox" :checked="k.enabled" :disabled="k.unpriced" @change="toggle(k.tag, ($event.target as HTMLInputElement).checked)" />
            {{ k.ja }} {{ k.unpriced ? "相場に無い" : c.money(k.perTry) }}
          </label>
        </td>
        <td :class="m.role === 'spam' ? 'text-sky-300 font-bold' : ''">
          {{ roleJa[m.role] }}<span v-if="m.group !== 'later'" class="opacity-50"> ({{ groupJa[m.group] }})</span>
        </td>
      </tr>
    </table>

    <p v-if="c.spam.value.spam" class="mt-2">
      スパム: <b class="text-sky-300">{{ c.stepTarget([c.spam.value.spam.modId]) }}</b> を
      {{ c.spam.value.spam.currency }} で — 1 回 1/{{ Math.round(1 / c.spam.value.spam.odds) }}、平均
      <b>{{ c.money(c.spam.value.spam.expected) }}</b>
    </p>
    <p v-if="c.spam.value.expensive" class="mt-1 text-amber-300">
      高額コース: 品質 20% でプレをスパムすると、後で削減のお告げの付け直しが続きます (まだ詰めていません)。
    </p>
    <p v-if="c.spam.value.reason" class="mt-1 text-amber-300">{{ c.spam.value.reason }}</p>

    <template v-if="c.spam.value.phase">
      <p class="mt-2">
        {{ sideJa(c.spam.value.side) }}が揃うまで: 平均 <b>{{ c.money(c.spam.value.phase.expected) }}</b>
        / 半分の確率で {{ c.money(c.spam.value.phase.p50) }}
        / <b>8 割の確率で {{ c.money(c.spam.value.phase.p80) }}</b>
        / 9 割 {{ c.money(c.spam.value.phase.p90) }}
        — 高貴は 8 割で {{ c.spam.value.phase.exalts80 }} 回
      </p>
      <table class="mt-1 w-full">
        <tr class="opacity-50"><th class="text-left">いまの状態</th><th class="text-left">打つ物</th><th class="text-right">1 回</th></tr>
        <tr v-for="s in c.spam.value.phase.steps" :key="s.have.join() + s.junk + s.breachGone" class="border-b border-white/5">
          <td class="py-0.5 pr-2">{{ s.have.length ? c.stepTarget(s.have) + " あり" : "狙い無し" }}{{ s.junk ? ` / 外れ ${s.junk}` : "" }}{{ s.breachGone ? " / ブリーチ無し" : "" }}</td>
          <td>{{ s.action }}</td>
          <td class="text-right">{{ c.money(s.perTry) }}</td>
        </tr>
      </table>
    </template>

    <!-- サフィが揃った後のプレの仕上げ (削減のお告げ → エッセンス → 冒涜の光ガチャ) -->
    <template v-if="c.spam.value.finish">
      <p class="mt-2">サフィが揃った後のプレの仕上げ</p>
      <p v-if="c.spam.value.finish.reason" class="text-amber-300">{{ c.spam.value.finish.reason }}</p>
      <table v-else class="mt-1 w-full">
        <tr v-if="c.spam.value.finish.exalt" class="border-b border-white/5 align-top">
          <td class="py-0.5 pr-2">
            1. {{ c.stepTarget(c.spam.value.finish.exalt.modIds) }} を左側の高貴で足す (外れは左側の消去のお告げ)
            <div v-for="(s, k) in c.spam.value.finish.exalt.steps" :key="k" class="opacity-60">
              ・{{ s.have.length ? c.stepTarget(s.have) + " あり" : "狙い無し" }}{{ s.junk ? ` / 外れ ${s.junk}` : "" }}{{ s.breachGone ? " / ブリーチ無し" : "" }} → {{ s.action }} ({{ c.money(s.perTry) }})
            </div>
          </td>
          <td class="text-right">平均 {{ c.money(c.spam.value.finish.exalt.expected) }}</td>
        </tr>
        <tr v-for="(st, i) in c.spam.value.finish.steps" :key="i" class="border-b border-white/5">
          <td class="py-0.5 pr-2">{{ i + (c.spam.value.finish.exalt ? 2 : 1) }}. {{ st.label }}<template v-if="st.modId"> で {{ c.stepTarget([st.modId]) }}</template></td>
          <td class="text-right">{{ c.money(st.cost) }}</td>
        </tr>
        <tr v-if="c.spam.value.finish.desecrate" class="border-b border-white/5">
          <td class="py-0.5 pr-2">
            {{ c.spam.value.finish.steps.length + (c.spam.value.finish.exalt ? 2 : 1) }}. 冒涜 ({{ c.spam.value.finish.desecrate.bone }} + 左手のネクロマンシーのお告げ{{ c.spam.value.finish.desecrate.echoes ? " + 反響のお告げ" : "" }})
            で {{ c.stepTarget([c.spam.value.finish.desecrate.modId]) }} — 1 回 1/{{ (1 / c.spam.value.finish.desecrate.odds).toFixed(1) }}、外れたら消去のオーブ + 光のお告げ ({{ c.money(c.spam.value.finish.desecrate.light) }}) で冒涜だけ消して引き直し
          </td>
          <td class="text-right">1 回 {{ c.money(c.spam.value.finish.desecrate.perTry) }}</td>
        </tr>
      </table>
      <p v-if="!c.spam.value.finish.reason" class="mt-1">仕上げ 平均 <b>{{ c.money(c.spam.value.finish.expected) }}</b></p>
    </template>
    <p v-if="c.spam.value.total" class="mt-2 text-sky-300">
      合計 (サフィ + 仕上げ): 平均 <b>{{ c.money(c.spam.value.total.expected) }}</b>
      / 半分の確率で {{ c.money(c.spam.value.total.p50) }}
      / <b>8 割の確率で {{ c.money(c.spam.value.total.p80) }}</b>
      / 9 割 {{ c.money(c.spam.value.total.p90) }}
    </p>
    <p v-if="c.spam.value.total && budgetReach.length" class="mt-1">
      予算 <input v-model.number="budgetDivine" type="number" min="1" step="50" class="num w-20" /> 神で:
      <template v-for="(r, i) in budgetReach" :key="r.label">
        <span v-if="i" class="text-[var(--exile-color-text-tertiary)]"> → </span>
        {{ r.label }} <b :class="r.p >= 0.8 ? 'text-emerald-300' : r.p >= 0.5 ? 'text-amber-300' : 'text-rose-300'">{{ (r.p * 100).toFixed(0) }}%</b>
      </template>
    </p>

    <!-- 途中品を買って始める: スパムの狙いを含む組み合わせごとに「最安 + そこから完成までの平均」 -->
    <template v-if="c.spam.value.total && partial.plans.value.length">
      <p class="mt-2">
        途中品を買って始める ({{ partial.plans.value.length }} 本 / 約 {{ partial.plans.value.length * 11 }} 秒)
        <button class="ml-2 rounded border border-sky-600 px-2 py-0.5" :disabled="partial.busy.value" @click="partial.search()">
          {{ partial.busy.value ? "探しています…" : "最安を取って比べる" }}
        </button>
      </p>
      <p class="opacity-60">
        条件: {{ c.item.value?.baseText ?? c.item.value?.baseType }} / ilvl {{ c.item.value?.itemLevel ?? "?" }} 以上 / コラプト無し /
        作れない MOD は固定済み / 外れの無い物だけ (同じ側の MOD の数 = 付いている狙いの数、反対側 = 固定済みの数まで)
      </p>
      <p v-if="partial.error.value" class="text-amber-300">{{ partial.error.value }}</p>
      <table v-if="partial.rows.value" class="mt-1 w-full">
        <tr class="opacity-50"><th class="text-left">付いている狙い</th><th class="text-right">最安</th><th class="text-right">残りの平均</th><th class="text-right">合計</th></tr>
        <tr v-for="r in partial.rows.value" :key="r.held.join()" class="border-b border-white/5" :class="bestPartial === r ? 'text-sky-300' : ''">
          <td class="py-0.5 pr-2">{{ c.stepTarget(r.held) }}</td>
          <td class="text-right">
            <template v-if="r.unmatched.length">条件にできない</template>
            <a v-else-if="r.cheapest == null && r.url" :href="r.url" target="_blank" class="underline opacity-70">出品無し ({{ r.total }} 件)</a>
            <template v-else-if="r.cheapest == null">出品無し</template>
            <a v-else-if="r.url" :href="r.url" target="_blank" class="underline">{{ c.money(r.cheapest) }} ({{ r.total }} 件)</a>
            <template v-else>{{ c.money(r.cheapest) }}</template>
          </td>
          <td class="text-right">{{ c.money(r.remaining) }}</td>
          <td class="text-right">{{ r.sum == null ? "—" : c.money(r.sum) }}</td>
        </tr>
        <tr class="opacity-70">
          <td class="py-0.5 pr-2">最初から作る (樹 MOD の固定済みベースの値段は別)</td><td></td><td></td>
          <td class="text-right">{{ c.money(c.spam.value.total.expected) }}</td>
        </tr>
      </table>
    </template>

    <!-- 優先順のルールが一番安いとは限らないので、同じ側の候補を全部並べる -->
    <p class="mt-2">スパムの狙いの候補 (平均の安い順)</p>
    <table class="mt-1 w-full">
      <tr v-for="a in c.spam.value.alternatives" :key="a.modId" class="border-b border-white/5">
        <td class="py-0.5 pr-2">
          {{ c.stepTarget([a.modId]) }}
          <span v-if="a.byRule" class="opacity-50">(ルール)</span>
        </td>
        <td>{{ sideJa(a.side) }}</td>
        <td class="text-right">{{ a.expected == null ? "—" : c.money(a.expected) }}</td>
        <td class="text-right">{{ a.p80 == null ? "" : "8 割 " + c.money(a.p80) }}</td>
        <td class="pl-2 opacity-60">{{ a.reason ?? "" }}</td>
        <td class="text-right">
          <span v-if="a.chosen" class="text-sky-300">採用</span>
          <button v-else-if="a.expected != null" class="underline opacity-80" @click="choose(a.modId)">これにする</button>
        </td>
      </tr>
    </table>
  </div>
</template>

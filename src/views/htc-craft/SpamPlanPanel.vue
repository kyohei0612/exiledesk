<script setup lang="ts">
/**
 * SpamPlanPanel.vue — カオススパムで何を狙い、同じ側の残りをどう足すか (2026-09-23)
 *
 * 計算は [[spam-plan.ts]]、状態は useHtcCraft の `spam` / `catalystChoice` / `spamOverride`。
 * ここは出すだけ。カタリストの使う / 使わないと、スパムの狙いの選び直しだけ受け付けます。
 */
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();

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
      スパムの狙いが消えたら剥がしてやり直しです。反対側・エッセンス・冒涜 (一番最後) はまだ数えていません。
    </p>

    <!-- 狙いごとの手とカタリスト。カタリストは種類ごとに使う / 使わないを選べる -->
    <table class="mt-1 w-full">
      <tr class="opacity-50"><th class="text-left">狙い</th><th>側</th><th class="text-left">効くカタリスト (触媒の高貴のお告げ 1 回ぶん)</th><th class="text-left">手</th></tr>
      <tr v-for="m in c.spam.value.methods" :key="m.modId" class="border-b border-white/5 align-top">
        <td class="py-0.5 pr-2">{{ c.stepTarget([m.modId]) }}</td>
        <td class="text-center">{{ sideJa(m.side) }}</td>
        <td>
          <span v-if="!m.catalysts.length" class="opacity-50">{{ m.group === "later" ? "—" : "無し" }}</span>
          <label v-for="k in m.catalysts" :key="k.tag" class="mr-2 whitespace-nowrap">
            <input type="checkbox" :checked="k.enabled" @change="toggle(k.tag, ($event.target as HTMLInputElement).checked)" />
            {{ k.ja }} {{ c.money(k.perTry) }}
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
        <tr v-for="s in c.spam.value.phase.steps" :key="s.have.join() + s.junk" class="border-b border-white/5">
          <td class="py-0.5 pr-2">{{ s.have.length ? c.stepTarget(s.have) + " あり" : "狙い無し" }}{{ s.junk ? ` / 外れ ${s.junk}` : "" }}</td>
          <td>{{ s.action }}</td>
          <td class="text-right">{{ c.money(s.perTry) }}</td>
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

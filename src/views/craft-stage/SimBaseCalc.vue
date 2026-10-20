<!--
  SimBaseCalc.vue — ④ 付ける順番のページの上に出す「ベースの計算」(2026-10-21 オーナー「③ はベース計算へで ④ にパスして、付ける順番の所に
  ベースを計算後表示させて、その上で MOD 順番って感じの方が綺麗」)。③ で入れた値段から、始め方ごとのフラクチャー済み (+ 反対側の狙い) までの費用、
  一番安い印、内訳の「?」、白から自作の補足 (グレーターの道・反対側の取り方・買う値段までに作れる割合)、フラクチャーの候補の付きやすさ。
  行を押すとその始め方にする (③ の「次へ」で一番安い物を選んである)
-->
<script setup lang="ts">
import SimCostTip from "./SimCostTip.vue";
import { tr } from "../../i18n/lang";
import type { SimStartKind } from "../../services/craft-stage/sim-methods";
import type { useSimCalc } from "./use-sim-calc";

type Calc = ReturnType<typeof useSimCalc>["calc"]["value"];
defineProps<{
  /** over = 白から自作が上限 (買う方の高い値段) を越えた時のその上限 (この道は無し) */
  rows: Array<{ k: SimStartKind; label: string; cost: number | null; base: number | null; over?: number }>;
  /** 選んでいる始め方 */
  chosen: string;
  cheapest: string | null;
  note: string;
  calc: Calc;
  /** 白から自作の補足の文 (無ければ出さない) */
  notes: string[];
  budget: { budget: number; p: number; p50: number } | null;
  frac: Array<{ modId: string; text: string; rank: string; side: string; tone: string }>;
  fracTitle: string;
  money: (x: number) => string;
  pct: (x: number) => string;
}>();
const emit = defineEmits<{ choose: [k: SimStartKind] }>();
</script>

<template>
  <div data-sim-base-calc class="mb-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-[11px]">
    <p class="mb-1.5 flex flex-wrap items-baseline gap-x-2"><b class="text-[12px] text-[var(--exile-color-text-title)]">{{ tr("ベースの計算", "Base cost") }}</b><span class="opacity-60">{{ note }}</span></p>
    <div class="flex flex-col gap-1">
      <div v-for="r in rows" :key="r.k" data-sim-base-row :data-start="r.k" class="flex min-h-8 items-center gap-2.5 rounded-md border px-2 py-1 max-md:min-h-11" :class="r.over != null ? 'border-white/5 opacity-50' : chosen === r.k ? 'border-[var(--exile-color-border-brass)] bg-white/[0.04]' : 'cursor-pointer border-white/10 hover:bg-white/[0.03]'" @click="r.over == null && emit('choose', r.k)">
        <span class="grid size-4 shrink-0 place-items-center rounded-full border" :class="chosen === r.k ? 'border-amber-300' : 'border-white/30'"><span v-if="chosen === r.k" class="size-2 rounded-full bg-amber-300" /></span>
        <b class="min-w-0 truncate text-[12px]">{{ r.label }}</b>
        <span v-if="cheapest === r.k" class="shrink-0 text-[10px] text-emerald-200">{{ tr("一番安い", "Cheapest") }}</span>
        <!-- 白から自作が買う方の高い値段を越えた: この道は無し (2026-10-21 オーナー) -->
        <span v-if="r.over != null" data-sim-base-over class="shrink-0 text-[10px] text-rose-300" :title="tr(`フラクチャー済みを買う・4 MOD を買うの高い方 (${money(r.over)}) を越えるので、白から作る道は選ばない`, `Costs more than the pricier buy option (${money(r.over)}), so crafting from white is not an option`)">{{ tr(`買う方 (${money(r.over)}) より高い · この道は無し`, `Over the buy price (${money(r.over)}) · not an option`) }}</span>
        <span class="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
          <span v-if="r.cost != null" :class="r.over != null ? 'line-through' : cheapest === r.k ? 'font-bold text-emerald-300' : 'text-[var(--exile-color-text-primary)]'">{{ money(r.cost) }}</span>
          <span v-else class="opacity-45">{{ tr("③ で値段を入れる", "Enter a price in step 3") }}</span>
          <SimCostTip v-if="calc && r.cost != null && r.k !== 'item' && r.k !== 'magic'" :kind="r.k === 'four' ? 'four' : r.k === 'fractured' ? 'fractured' : 'white'" :calc="calc" :base="r.base" />
        </span>
      </div>
    </div>
    <p v-for="(t, i) in notes" :key="i" data-sim-base-note class="mt-1 text-[var(--exile-color-text-secondary)]">{{ t }}</p>
    <p v-if="budget" data-sim-budget class="mt-1">{{ tr(`白から自作: 買う方の高い値段 ${money(budget.budget)} までに作れる`, `From white: done within the pricier buy option (${money(budget.budget)})`) }} <b :class="budget.p >= 0.8 ? 'text-emerald-300' : budget.p >= 0.5 ? 'text-amber-200' : 'text-rose-300'">{{ pct(budget.p) }}</b> <span class="opacity-70">{{ tr(`(2 人に 1 人は ${money(budget.p50)} まで)`, `(half finish within ${money(budget.p50)})`) }}</span></p>
    <template v-if="frac.length">
      <p class="mt-2 font-semibold text-[var(--exile-color-text-secondary)]">{{ fracTitle }}</p>
      <p v-for="(f, i) in frac" :key="f.modId" class="flex items-center gap-2 py-0.5">
        <span class="shrink-0 rounded-sm border border-white/15 px-1 text-[10px] opacity-70">{{ f.side.startsWith("プレ") ? tr("プレ", "Prefix") : tr("サフィ", "Suffix") }}</span>
        <span class="min-w-0 truncate" :class="f.tone">{{ f.text }}</span> <span class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ f.rank }} {{ tr("以上", "+") }}</span>
        <span v-if="calc?.each?.[i] && chosen !== 'fractured'" class="ml-auto shrink-0 tabular-nums opacity-80" :title="tr('増強 1 回でこの段以上が付く割合', 'Chance one Augmentation rolls this tier or better')">{{ tr("増強で付く", "Per Augment") }} {{ pct(calc.each[i]!.p) }}</span>
      </p>
      <p v-if="calc?.pHit != null && frac.length >= 2" class="opacity-80">{{ tr("付きやすさ 合計", "Combined chance") }} {{ pct(calc.pHit) }}</p>
    </template>
  </div>
</template>

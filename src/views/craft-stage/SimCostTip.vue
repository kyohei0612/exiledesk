<!--
  SimCostTip.vue — 3 の始め方の右の値段の「?」: フラクチャー済みのベースになるまでの費用の内訳 (2026-10-18 オーナー「白ベースの値段初見で? 多くね。? マーク押してカード出してあげた方が良い」)。
  式は 4 の段の比べと同じ (use-sim-run.ts の calc)。白から = 1 回分 × 3 (骨の壁でフラクチャーが 1/3) + 消去 × 2、MOD 付きレア = (ベース + 壁 + フラクチャー) × 3 + 消去 × 2、フラクチャー済み = 入れた値段
-->
<script setup lang="ts">
import { computed } from "vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import { simCurrency } from "../../state/display-currency";
import { tr } from "../../i18n/lang";

type Line = { name: string; n: number; each: number };
const props = defineProps<{
  kind: "white" | "four" | "fractured";
  calc: { lines: Line[]; buyLines: Line[]; once: number; after: number; total: number; buyRest: number; rerolls: number; grade: string } | null;
  /** その行に入れたベースの値段 (高貴建て) */
  base: number | null;
}>();
const money = (x: number): string => (Number.isFinite(x) ? simCurrency.money(x) : "—");
const fmtN = (n: number): string => (Number.isFinite(n) ? (Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(2)) : "∞");
const rows = computed((): Line[] => {
  const c = props.calc;
  if (!c) return [];
  if (props.kind === "white") return c.lines;
  if (props.kind === "four") return [{ name: tr("フラクチャーの MOD 付きレア", "Rare with the mod"), n: 1, each: props.base ?? 0 }, ...c.buyLines];
  return [];
});
const once = computed(() => rows.value.reduce((a, l) => a + l.n * l.each, 0));
const title = computed(() => (props.kind === "white" ? tr("白から作る費用の内訳", "Cost from a white base") : props.kind === "four" ? tr("MOD 付きレアから作る費用の内訳", "Cost from a rare with the mod") : tr("フラクチャー済みを買う", "Buy fractured")));
</script>

<template>
  <HelpTip :title="title" :width="340" @click.stop>
    <template v-if="kind === 'fractured'">
      <p>{{ tr("入れた値段がそのまま、フラクチャー済みのベース 1 個の費用", "The price you entered is the cost of one fractured base") }}</p>
    </template>
    <template v-else-if="calc">
      <p class="mb-1 text-[var(--exile-color-text-secondary)]">{{ tr("フラクチャー済みのベースになるまでの平均。1 回分を作って骨の壁を足し、フラクチャーが狙いに当たるのは 1/3 なので 3 回分", "Average cost until you have a fractured base. Fracture hits the target 1 in 3 with the bone wall, so 3 attempts") }}</p>
      <table class="w-full text-[11px] tabular-nums">
        <tbody>
          <tr v-for="(l, i) in rows" :key="i" class="border-b border-white/5">
            <td class="py-0.5 pr-2">{{ l.name }}</td>
            <td class="py-0.5 pr-2 text-right opacity-70">× {{ fmtN(l.n) }}</td>
            <td class="py-0.5 text-right">{{ money(l.n * l.each) }}</td>
          </tr>
          <tr class="font-bold"><td class="pt-1">{{ tr("1 回分", "One attempt") }}</td><td></td><td class="pt-1 text-right">{{ money(once) }}</td></tr>
          <tr><td>{{ tr("× 3 (フラクチャーが 1/3)", "× 3 (fracture hits 1 in 3)") }}</td><td></td><td class="text-right">{{ money(once * 3) }}</td></tr>
          <tr><td>{{ tr("+ 固定できた後の消去 × 2", "+ 2 annuls after fracturing") }}</td><td></td><td class="text-right">{{ money(calc.after) }}</td></tr>
          <tr class="font-bold text-emerald-300"><td class="pt-1">{{ tr("合計", "Total") }}</td><td></td><td class="pt-1 text-right">{{ money(once * 3 + calc.after) }}</td></tr>
        </tbody>
      </table>
      <p v-if="kind === 'white'" class="mt-1 text-[10px] opacity-60">{{ tr(`リロール = 増強 1 回で狙いが付く確率の逆数 (平均 ${fmtN(calc.rerolls)} 回)。変成・増強は${calc.grade}`, `Rerolls = 1 ÷ chance per augment (avg ${fmtN(calc.rerolls)}). Transmute / augment grade: ${calc.grade}`) }}</p>
    </template>
  </HelpTip>
</template>

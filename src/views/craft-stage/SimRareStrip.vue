<!--
  SimRareStrip.vue — 白ベースの値段の比べ: 「適当なレアを買って、消去で 1 MOD まで削る」といくらか (2026-10-18 オーナー「白ベースから入力 → 下に適当なレアに消去した場合 ● 適正単位」)。
  買うレアは満杯と見る (普通のベースは 6 MOD = 消去 5 回、特殊なベースは暗黙の「プレ / サフィ ±N 個」を入れた上限 − 1 回。オーナー「6 MOD で普通、特殊ベースはベースの MOD 数みて判断」)。
  消去は今の相場。フラクチャー予定が無い時は値段の比べだけ (1 MOD 残ったレアは白とは違う始め方なので、回す時の始め方にはしない)。
  フラクチャー予定がある時は、フラクチャー済みのベースになるまでの道 (消去で 1 MOD → カオスで狙いまで → 高貴 × 2 → 骨の壁 → フラクチャー、
  use-sim-run の calc) の費用を出し、4 最安値スタートの比べ・回す時のベース代に入る (2026-10-19 オーナー「フラクチャーまでの費用の道として計算に入れて」)
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s, priceOf } from "../../state/craft-stage";
import { simCurrency } from "../../state/display-currency";
import { freshItem } from "../../services/craft-stage/run-plan";
import { limitOf } from "../../services/craft-stage/stage-core";
import PriceInput from "../../components/PriceInput.vue";
import Icon from "../../components/ui/Icon.vue";
import SimCostTip from "./SimCostTip.vue";
import { tr } from "../../i18n/lang";

type Line = { name: string; n: number; each: number };
const props = defineProps<{
  white: number | null;
  /** フラクチャー予定がある時の計算 (無ければ null = 値段の比べだけ) */
  calc?: { lines: Line[]; buyLines: Line[]; rareLines: Line[]; once: number; after: number; total: number; buyRest: number; rerolls: number; grade: string; rareTotal: number | null; rareChaos: { grade: string; n: number } | null; keep?: { together: number; chaos: number; use: "together" | "chaos" } | null } | null;
  /** 3 の始め方の中でこの道が一番安い */
  cheapest?: boolean;
}>();
/** search: 取引所でこのベースのレアを探す (use-sim-search の searchRare) */
const emit = defineEmits<{ search: [] }>();
/** 買う適当なレアの値段 (高貴建て。use-sim-targets の rareDivine、ベースごとに覚える) */
const rare = defineModel<number | null>({ default: null });
/** そのベースのレアの MOD の上限 (プレ + サフィ) */
const slots = computed(() => {
  const d = s.data.value;
  if (!d) return 6;
  try {
    const it = { ...freshItem(d, s.base.value, s.itemLevel.value), rarity: "rare" as const };
    return limitOf(it, "prefix") + limitOf(it, "suffix");
  } catch { return 6; }
});
const annuls = computed(() => Math.max(0, slots.value - 1));
const annulPrice = computed(() => priceOf("annul"));
const total = computed(() => (rare.value ?? 0) + annuls.value * annulPrice.value);
/** どちらが安いか (白の値段が入っている時だけ) */
const cheaper = computed(() => (props.white == null || rare.value == null ? null : total.value < props.white ? "rare" : "white"));
</script>

<template>
  <div data-sim-rare-strip class="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
    <span class="opacity-70">{{ tr("適当なレアを消去で 1 MOD に", "A random Rare annulled to 1 mod") }}</span>
    <PriceInput v-model="rare" base="exalted" unit-key="sim.rare" :placeholder="tr('レアの値段', 'Rare price')" />
    <button type="button" data-sim-rare-search class="inline-flex shrink-0 items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline max-md:min-h-11" :title="tr('このベースのレア (フラクチャー無し・アイテムレベル以上) を取引所で探す (開くだけ)', 'Search the trade site for a Rare of this base (no fractured mod, at least this item level). Opens only')" @click.stop="emit('search')">{{ tr("取引所で探す", "Search trade") }}<Icon name="external" class="size-3.5" /></button>
    <span v-if="!calc" class="tabular-nums opacity-80">+ {{ tr(`消去 × ${annuls}`, `Annul × ${annuls}`) }} ({{ simCurrency.money(annuls * annulPrice) }})</span>
    <!-- フラクチャー予定がある時: フラクチャー済みになるまでの道の費用 (カオスで狙いまで・高貴・壁・フラクチャー込み、× 3 + 消去 × 2) -->
    <template v-if="calc">
      <span v-if="calc.rareChaos" class="tabular-nums opacity-80">+ {{ tr(`カオス (${calc.rareChaos.grade}) × ${calc.rareChaos.n.toFixed(1)} → 高貴 × 2 → 壁 → フラクチャー`, `Chaos (${calc.rareChaos.grade}) × ${calc.rareChaos.n.toFixed(1)} → Exalt × 2 → wall → Fracture`) }}</span>
      <span v-else class="text-rose-300">{{ tr("カオスではこの段は出ない (アイテムレベルが足りない)", "Chaos can't roll this tier (item level too low)") }}</span>
      <span v-if="calc.rareTotal != null" class="ml-auto flex items-center gap-1.5 tabular-nums font-semibold" :class="cheapest ? 'text-emerald-300' : 'text-[var(--exile-color-text-primary)]'">= {{ simCurrency.money(calc.rareTotal + (calc.keep?.chaos ?? 0)) }}<SimCostTip kind="rare" :calc="calc" :base="rare" /></span>
      <span v-else-if="calc.rareChaos" class="ml-auto opacity-45">{{ tr("値段を入れる", "Enter a price") }}</span>
      <span v-if="cheapest" class="text-[10px] text-emerald-200">{{ tr("一番安い", "Cheapest") }}</span>
    </template>
    <template v-else>
    <span v-if="rare != null" class="tabular-nums font-semibold" :class="cheaper === 'rare' ? 'text-emerald-300' : 'text-[var(--exile-color-text-primary)]'">= {{ simCurrency.money(total) }}</span>
    <span v-else class="opacity-50">{{ tr("(レアの値段を入れると合計が出る)", "(enter the Rare price to see the total)") }}</span>
    <span v-if="cheaper === 'rare'" class="rounded-sm bg-emerald-500/20 px-1.5 py-px text-emerald-200">{{ tr("白ベースより安い", "Cheaper than a white base") }}</span>
    <span v-else-if="cheaper === 'white'" class="opacity-60">{{ tr("白ベースの方が安い", "The white base is cheaper") }}</span>
    </template>
    <span class="opacity-50">{{ tr(`(満杯のレア ${slots} MOD と見る)`, `(assumes a full ${slots}-mod Rare)`) }}</span>
  </div>
</template>

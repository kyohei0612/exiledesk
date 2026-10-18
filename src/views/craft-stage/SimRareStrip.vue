<!--
  SimRareStrip.vue — 白ベースの値段の比べ: 「適当なレアを買って、消去で 1 MOD まで削る」といくらか (2026-10-18 オーナー「白ベースから入力 → 下に適当なレアに消去した場合 ● 適正単位」)。
  買うレアは満杯と見る (普通のベースは 6 MOD = 消去 5 回、特殊なベースは暗黙の「プレ / サフィ ±N 個」を入れた上限 − 1 回。オーナー「6 MOD で普通、特殊ベースはベースの MOD 数みて判断」)。
  消去は今の相場。今は比べの表示だけ (1 MOD 残ったレアは白とは違う始め方なので、回す時の始め方にはまだしない)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s, priceOf } from "../../state/craft-stage";
import { simCurrency } from "../../state/display-currency";
import { freshItem } from "../../services/craft-stage/run-plan";
import { limitOf } from "../../services/craft-stage/stage-core";
import PriceInput from "../../components/PriceInput.vue";
import Icon from "../../components/ui/Icon.vue";
import { tr } from "../../i18n/lang";

const props = defineProps<{ white: number | null }>();
/** search: 取引所でこのベースのレアを探す (use-sim-search の searchRare) */
const emit = defineEmits<{ search: [] }>();
/** 買う適当なレアの値段 (高貴建て) */
const rare = ref<number | null>(null);
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
    <span class="tabular-nums opacity-80">+ {{ tr(`消去 × ${annuls}`, `Annul × ${annuls}`) }} ({{ simCurrency.money(annuls * annulPrice) }})</span>
    <span v-if="rare != null" class="tabular-nums font-semibold" :class="cheaper === 'rare' ? 'text-emerald-300' : 'text-[var(--exile-color-text-primary)]'">= {{ simCurrency.money(total) }}</span>
    <span v-else class="opacity-50">{{ tr("(レアの値段を入れると合計が出る)", "(enter the Rare price to see the total)") }}</span>
    <span v-if="cheaper === 'rare'" class="rounded-sm bg-emerald-500/20 px-1.5 py-px text-emerald-200">{{ tr("白ベースより安い", "Cheaper than a white base") }}</span>
    <span v-else-if="cheaper === 'white'" class="opacity-60">{{ tr("白ベースの方が安い", "The white base is cheaper") }}</span>
    <span class="opacity-50">{{ tr(`(満杯のレア ${slots} MOD と見る)`, `(assumes a full ${slots}-mod Rare)`) }}</span>
  </div>
</template>

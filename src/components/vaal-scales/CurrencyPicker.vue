<!--
  CurrencyPicker.vue — 表示通貨のプルダウン (2026-09-12)。ヴァールの天秤の全画面で共通 (localStorage)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { displayCurrency, rankingCurrency, setDisplayCurrency, simCurrency, type DisplayChoice } from "../../state/display-currency";

/**
 * ranking = カレンシーランキングだけの表示通貨 (適正なし、既定は最安値。2026-10-04)。
 * sim = クラフトステージのシミュレーションだけの表示通貨 (既定は適正。2026-10-05)
 */
const props = defineProps<{ ranking?: boolean; sim?: boolean }>();
const value = computed(() => (props.ranking ? rankingCurrency.choice.value : props.sim ? simCurrency.choice.value : displayCurrency.choice.value));
const options = computed(() => (props.ranking ? rankingCurrency.options : props.sim ? simCurrency.options : displayCurrency.options));
function onChange(v: string): void {
  if (props.ranking) rankingCurrency.set(v as Parameters<typeof rankingCurrency.set>[0]);
  else if (props.sim) simCurrency.set(v as DisplayChoice);
  else setDisplayCurrency(v as DisplayChoice);
}
</script>

<template>
  <label class="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] text-[var(--exile-color-text-secondary)]">
    <span class="max-md:hidden">表示通貨</span>
    <select
      :value="value"
      class="text-[12px] px-2 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
      @change="onChange(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </label>
</template>

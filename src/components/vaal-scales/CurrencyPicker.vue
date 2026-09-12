<!--
  CurrencyPicker.vue — 表示通貨のプルダウン (2026-09-12)。ヴァールの天秤の全画面で共通 (localStorage)。
-->
<script setup lang="ts">
import { displayCurrency, setDisplayCurrency, type DisplayCurrency } from "../../state/display-currency";
</script>

<template>
  <label class="inline-flex items-center gap-2 text-[11px] text-[var(--exile-color-text-secondary)]">
    <span>表示通貨</span>
    <select
      :value="displayCurrency.cur.value"
      class="text-[12px] px-2 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
      @change="setDisplayCurrency(($event.target as HTMLSelectElement).value as DisplayCurrency)"
    >
      <option v-for="o in displayCurrency.options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </label>
</template>

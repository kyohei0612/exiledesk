<!--
  SiteSkinPicker.vue — サイト全体の色の皮のプルダウン (shared-ui.md U-49b、スイッチ siteLook)。見た目は表示通貨 (CurrencyPicker) と同じ。
  既定 / 日替わり / 12 か月の色 (睦月〜師走)。選んだ答えは端末に覚え、すべてのページに効く (state/site-skin.ts)
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { setSiteSkin, siteSkin, siteSkinOptions } from "../../state/site-skin";

const options = computed(() => siteSkinOptions());
</script>

<template>
  <!-- スマホは並びが窓に入るよう縮める (日替わりの長い名前は select の中で切れる) -->
  <label data-site-skin-picker class="inline-flex min-w-0 items-center gap-2 whitespace-nowrap text-[11px] text-[var(--exile-color-text-secondary)]">
    <span class="max-md:hidden">{{ tr("色", "Colors") }}</span>
    <select
      :value="siteSkin"
      :aria-label="tr('サイトの色', 'Site colors')"
      class="min-w-0 max-w-[13rem] text-[12px] px-2 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
      @change="setSiteSkin(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </label>
</template>

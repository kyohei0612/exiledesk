<!--
  LangSwitch.vue — 日本語 / English の切り替え (2026-10-10 英語版)。Web の上の帯に置く。選んだ方は localStorage に覚える (i18n/lang.ts)
-->
<script setup lang="ts">
import { lang, setLang } from "../i18n/lang";
</script>

<template>
  <span class="inline-flex shrink-0 overflow-hidden rounded-lg border border-white/20 text-[11px]" role="group" aria-label="Language">
    <button v-for="o in ([['ja', '日本語'], ['en', 'EN']] as const)" :key="o[0]" type="button" class="g-plain px-2 py-0.5" :class="lang === o[0] ? 'bg-white/15 text-[var(--exile-color-text-title)]' : 'opacity-55 hover:opacity-100'" :aria-pressed="lang === o[0]" @click="setLang(o[0])">{{ o[1] }}</button>
  </span>
</template>

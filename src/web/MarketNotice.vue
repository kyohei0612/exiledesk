<script setup lang="ts">
/**
 * 相場 (poe2scout の中継) が取れない時の帯 (Web 版、2026-10-07)。取れている間は何も出さない。
 * 取れないと値段が 0 のまま計算され、取引所のリーグも Standard になるので、それだけ短く知らせて「もう一度」
 */
import { computed } from "vue";
import { marketStore } from "../state/market-store";
import { tr } from "../i18n/lang";

const show = computed(() => !!marketStore.error.value && !marketStore.loading.value);
</script>

<template>
  <div v-if="show" class="flex items-center gap-3 border-b border-rose-500/30 bg-rose-950/40 px-4 py-1.5 text-[12px] text-rose-100">
    <span class="font-bold">{{ tr("相場が取れていません", "Could not load market prices") }}</span>
    <span class="opacity-70">{{ tr("値段は 0 のまま計算され、取引所のリーグも Standard になります", "Prices are treated as 0 and trade site searches use the Standard league") }}</span>
    <span class="truncate opacity-40" :title="marketStore.error.value ?? ''">({{ marketStore.error.value }})</span>
    <button type="button" class="ml-auto shrink-0 rounded-lg border border-rose-300/50 px-2.5 py-0.5 font-bold hover:bg-rose-500/20" @click="marketStore.refreshMarket()">{{ tr("もう一度", "Retry") }}</button>
  </div>
  <div v-else-if="marketStore.loading.value && !marketStore.items.value.length" class="border-b border-white/10 px-4 py-1 text-[11px] opacity-50">{{ tr("相場を読んでいます…", "Loading market prices…") }}</div>
</template>

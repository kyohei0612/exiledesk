<script setup lang="ts">
/**
 * 相場 (poe2scout の中継) が取れない時の帯 (Web 版、2026-10-07)。取れている間は何も出さない。
 * 取れないと値段が 0 のまま計算され、取引所のリーグも Standard になるので、それだけ短く知らせて「もう一度」
 */
import { computed } from "vue";
import { marketStore } from "../state/market-store";

const show = computed(() => !!marketStore.error.value && !marketStore.loading.value);
</script>

<template>
  <div v-if="show" class="flex items-center gap-3 border-b border-rose-500/30 bg-rose-950/40 px-4 py-1.5 text-[12px] text-rose-100">
    <span class="font-bold">相場が取れていません</span>
    <span class="opacity-70">値段は 0 のまま計算され、取引所のリーグも Standard になります</span>
    <span class="truncate opacity-40" :title="marketStore.error.value ?? ''">({{ marketStore.error.value }})</span>
    <button type="button" class="ml-auto shrink-0 rounded-lg border border-rose-300/50 px-2.5 py-0.5 font-bold hover:bg-rose-500/20" @click="marketStore.refreshMarket()">もう一度</button>
  </div>
  <div v-else-if="marketStore.loading.value && !marketStore.items.value.length" class="border-b border-white/10 px-4 py-1 text-[11px] opacity-50">相場を読んでいます…</div>
</template>

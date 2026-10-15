<script setup lang="ts">
/**
 * PWA の帯 (2026-10-15): 新しい版を落とし終えた時の「新しい版があります → 更新」と、電波が無い時の「オフライン · 相場は ◯時の値段」。
 * どちらも無ければ何も出さない (pwa.ts)
 */
import { computed } from "vue";
import { offline, updateReady, applyUpdate } from "./pwa";
import { marketAt } from "./boot";
import { tr } from "../i18n/lang";

/** 今日なら 14:05、ほかの日は 10/15 14:05 */
const priceTime = computed(() => {
  if (!marketAt.value) return "";
  const d = new Date(marketAt.value);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
});
</script>

<template>
  <div v-if="updateReady" class="flex items-center gap-3 border-b border-amber-400/30 bg-amber-950/40 px-4 py-1.5 text-[12px] text-amber-100">
    <span class="min-w-0 text-left font-bold">{{ tr("新しい版があります", "A new version is available") }}</span>
    <button type="button" class="g-btn sm shrink-0" @click="applyUpdate">{{ tr("更新", "Update") }}</button>
  </div>
  <div v-if="offline" class="flex items-center gap-3 border-b border-white/10 bg-black/40 px-4 py-1 text-[12px]">
    <span class="font-bold">{{ tr("オフライン", "Offline") }}</span>
    <span v-if="priceTime" class="min-w-0 truncate opacity-70">{{ tr(`相場は ${priceTime} の値段`, `Prices as of ${priceTime}`) }}</span>
  </div>
</template>

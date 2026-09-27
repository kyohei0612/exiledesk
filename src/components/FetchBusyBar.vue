<!--
  FetchBusyBar.vue — 取引所を使っている間、画面の下に「今こうなっている」を出す

  オーナー報告 2026-09-20:「今自動巡回してるけど UI 止まって見えるね」。
  2026-09-27「トレード使えるのは 1 タブだけ」「8 割レート制限に使ってる奴あったら回復まで待たせる感じでタイマーセット」:
  画面の機能 (忍者ビルドコピー・クラフト計算機など) が使っている時も出し、枠の 8 割で待っている時は残り秒のタイマーを出す。
  どの画面にいても出したいので App.vue に置く。
-->
<script setup lang="ts">
import { computed } from "vue";
import { fetchBusy, fetchBusyKind, fetchBusyStopped, fetchBusyText, manualSweeping, tradeWaitText } from "../state/fetch-busy";
import { tradeLock, tradeOwner, tradeUserLabel, TRADE_USER_JA } from "../state/trade-lock";
import { cancelSweep } from "../services/market-flow";

const show = computed(() => fetchBusy.value || !!tradeOwner.value);
const title = computed(() => (tradeOwner.value ? `${TRADE_USER_JA[tradeOwner.value]}が取引所を使用中` : `${fetchBusyKind.value}中`));
function stop(): void {
  if (tradeOwner.value) tradeLock.stop(tradeOwner.value);
  else void cancelSweep();
}
</script>

<template>
  <div
    v-if="show"
    class="fixed bottom-0 left-0 right-0 z-[95] flex items-center gap-3 border-t border-amber-400/40 bg-[var(--exile-color-bg-elevated)]/95 px-4 py-1.5 text-[11px] backdrop-blur-[2px]"
  >
    <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" aria-hidden="true"></span>
    <span class="font-bold text-amber-200">{{ title }}</span>
    <span v-if="!tradeOwner" class="truncate text-[var(--exile-color-text-secondary)]">{{ fetchBusyText }}</span>
    <!-- 枠の 8 割で待っている時のタイマー -->
    <span v-if="tradeWaitText" class="whitespace-nowrap rounded-full bg-sky-500/15 px-2 text-sky-200">⏱ {{ tradeWaitText }}</span>
    <span v-if="fetchBusyStopped > 0" class="whitespace-nowrap text-rose-300">レート制限で停止中 {{ fetchBusyStopped }} 秒</span>
    <span class="ml-auto whitespace-nowrap text-[var(--exile-color-text-tertiary)]">終わるまで他の取得は押せません ({{ tradeUserLabel }})</span>
    <button
      type="button"
      class="whitespace-nowrap rounded-lg border border-white/20 px-2 py-0.5 hover:border-rose-400/60 hover:text-rose-300"
      :title="tradeOwner ? '取得を止めます (ボタンから再開できます)' : manualSweeping ? '一括取得を止めます' : '自動巡回を止めます (次の周期でまた回ります)'"
      @click="stop"
    >
      中止
    </button>
  </div>
</template>

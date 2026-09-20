<!--
  FetchBusyBar.vue — 取得が走っている間、画面の下に「今こうなっている」を出す

  オーナー報告 2026-09-20:「今自動巡回してるけど UI 止まって見えるね」。
  巡回中は他の取得ボタンを押せなくするので、押せない理由と進み具合が見えないと
  本当に固まったように見える。どの画面にいても出したいので App.vue に置く。
-->
<script setup lang="ts">
import { fetchBusy, fetchBusyKind, fetchBusyStopped, fetchBusyText, manualSweeping } from "../state/fetch-busy";
import { cancelSweep } from "../services/market-flow";
</script>

<template>
  <div
    v-if="fetchBusy"
    class="fixed bottom-0 left-0 right-0 z-[95] px-4 py-1.5 flex items-center gap-3 text-[11px] border-t border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)]/95 backdrop-blur-[2px]"
  >
    <span class="inline-block w-1.5 h-1.5 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse" aria-hidden="true"></span>
    <span class="text-[var(--exile-color-accent-focus)] font-display tracking-[0.06em]">{{ fetchBusyKind }}中</span>
    <span class="text-[var(--exile-color-text-secondary)] truncate">{{ fetchBusyText }}</span>
    <span v-if="fetchBusyStopped > 0" class="text-amber-300 whitespace-nowrap">レート制限で停止中 {{ fetchBusyStopped }} 秒</span>
    <span class="text-[var(--exile-color-text-tertiary)] whitespace-nowrap ml-auto">終わるまで他の取得は押せません</span>
    <button
      type="button"
      class="underline text-[var(--exile-color-text-tertiary)] hover:text-rose-300 whitespace-nowrap"
      :title="manualSweeping ? '一括取得を止めます' : '自動巡回を止めます (次の周期でまた回ります)'"
      @click="cancelSweep"
    >
      中止
    </button>
  </div>
</template>

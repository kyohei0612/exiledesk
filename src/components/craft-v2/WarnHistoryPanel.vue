<!--
  WarnHistoryPanel.vue — 致命的エラーバナー / 警告履歴 (最新 5 件、詳細アコーディオン付き)
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。状態は craftV2Store を直接参照する。
-->
<script setup lang="ts">
import { ref } from "vue";
import {
  craftV2Store,
  clearWarns,
  formatHms,
  toggleWarnDetail,
  MAX_WARN_HISTORY,
} from "../../state/craft-v2-store";
import { localizeError, warnLevelClasses, warnSourceLabel } from "../../views/craft-v2/helpers";

const emit = defineEmits<{ retry: [] }>();
const store = craftV2Store;

/** 2026-09-16: 健全性チェックは内部処理なのでボタンを廃止。代わりに履歴をそのままコピーできるように */
const copied = ref(false);
async function copyWarns(): Promise<void> {
  const text = store.warnHistory
    .map((w) => {
      const head = `[${formatHms(new Date(w.timestamp))}] ${warnSourceLabel(w.source) ? warnSourceLabel(w.source) + ": " : ""}${localizeError(w.message)}`;
      const details = (w.details ?? []).map((d) => `    ${d}`);
      return [head, ...details].join("\n");
    })
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* コピーできない環境では何もしない */
  }
}
</script>

<template>
  <div v-if="store.fatalError" class="mb-3 px-3 py-2 rounded border border-red-600/60 bg-red-900/20 text-[12px] text-red-200">
    <strong class="font-display tracking-[0.05em]">致命的エラー:</strong>
    {{ localizeError(store.fatalError) }}
    <button type="button" @click="emit('retry')" class="ml-2 underline text-red-100 hover:text-white">再試行</button>
  </div>
  <div
    v-else-if="store.warnHistory.length > 0"
    class="mb-3 px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.05] text-[11px]"
  >
    <div class="flex items-center justify-between mb-1.5">
      <strong class="font-display tracking-[0.05em] text-[var(--exile-color-accent-focus)]">
        警告履歴
        <span class="ml-1 text-[10px] tabular-nums text-[var(--exile-color-text-secondary)]"
          >({{ store.warnHistory.length }} / {{ MAX_WARN_HISTORY }})</span
        >
      </strong>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          @click="copyWarns"
          class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] hover:bg-[var(--exile-color-bg-canvas)] hover:text-[var(--exile-color-accent-focus)] transition-colors text-[10px]"
          title="警告履歴をテキストでコピー"
        >
          {{ copied ? "コピーした" : "コピー" }}
        </button>
        <button
          type="button"
          @click="clearWarns"
          class="px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] hover:bg-[var(--exile-color-bg-canvas)] hover:text-[var(--exile-color-text-primary)] transition-colors text-[10px] text-[var(--exile-color-text-secondary)]"
          title="警告履歴をクリア"
        >
          クリア
        </button>
      </div>
    </div>
    <ul class="space-y-0.5">
      <li v-for="w in store.warnHistory" :key="w.timestamp" :class="['px-2 py-0.5 leading-snug', warnLevelClasses(w.level)]">
        <!-- details がある行は ▶/▼ アコーディオンで具体値を展開できる -->
        <div
          :class="['flex items-start gap-1', w.details && w.details.length > 0 ? 'cursor-pointer hover:text-[var(--exile-color-accent-focus)]' : '']"
          @click="w.details && w.details.length > 0 ? toggleWarnDetail(w.timestamp) : null"
          :title="w.details && w.details.length > 0 ? 'クリックで詳細表示' : ''"
        >
          <span v-if="w.details && w.details.length > 0" class="select-none w-3 shrink-0 text-[10px] tabular-nums" aria-hidden="true"
            >{{ store.expandedWarnTimestamps.has(w.timestamp) ? "▼" : "▶" }}</span
          >
          <div class="flex-1 min-w-0">
            <span class="tabular-nums text-[10px] text-[var(--exile-color-text-tertiary)] mr-1">[{{ formatHms(new Date(w.timestamp)) }}]</span>
            <span v-if="warnSourceLabel(w.source)" class="text-[10px] text-[var(--exile-color-text-secondary)] mr-1"
              >{{ warnSourceLabel(w.source) }}:</span
            >
            {{ localizeError(w.message) }}
          </div>
        </div>
        <ul
          v-if="w.details && w.details.length > 0 && store.expandedWarnTimestamps.has(w.timestamp)"
          class="mt-1 ml-4 pl-2 border-l border-[var(--exile-color-border-subtle)] space-y-0.5 text-[10px] text-[var(--exile-color-text-secondary)]"
        >
          <li v-for="(d, di) in w.details" :key="di" class="tabular-nums leading-tight">{{ d }}</li>
        </ul>
      </li>
    </ul>
  </div>
</template>

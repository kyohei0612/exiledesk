<!--
  ConfirmDialog.vue — アプリの中で描く「よろしいですか?」(2026-09-21)

  オーナー指摘:「確認ダイアログが 2 種類ある」。Windows の素のダイアログ (window.confirm) は
  見た目が浮くので、監視の入れ替え (WatchReplaceDialog) と同じ形に揃える。
  App.vue に 1 つ置いて、どこからでも askConfirm() で呼ぶ。
-->
<script setup lang="ts">
import BaseCard from "./decor/BaseCard.vue";
import { answerConfirm, confirmDialog } from "../state/confirm-dialog";
</script>

<template>
  <div
    v-if="confirmDialog.pending.value"
    class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-[1px]"
    @click.self="answerConfirm(false)"
  >
    <BaseCard class="max-w-lg mx-6">
      <div class="p-5 pl-6">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base mb-2">
          {{ confirmDialog.pending.value.title ?? "確認" }}
        </h2>
        <p class="text-[12px] text-[var(--exile-color-text-secondary)] leading-relaxed whitespace-pre-line mb-4">
          {{ confirmDialog.pending.value.message }}
        </p>
        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            class="text-[12px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]"
            @click="answerConfirm(false)"
          >
            {{ confirmDialog.pending.value.cancelLabel ?? "キャンセル" }}
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded border font-display tracking-[0.06em] text-[12px] transition-colors"
            :class="
              confirmDialog.pending.value.danger
                ? 'border-rose-500/70 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
                : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]'
            "
            @click="answerConfirm(true)"
          >
            {{ confirmDialog.pending.value.okLabel ?? "はい" }}
          </button>
        </div>
      </div>
    </BaseCard>
  </div>
</template>

<!--
  ConfirmDialog.vue — アプリの中で描く「よろしいですか?」(2026-09-21)

  オーナー指摘:「確認ダイアログが 2 種類ある」。Windows の素のダイアログ (window.confirm) は
  見た目が浮くので、監視の入れ替え (WatchReplaceDialog) と同じ形に揃える。
  App.vue に 1 つ置いて、どこからでも askConfirm() で呼ぶ。
-->
<script setup lang="ts">
import ModalShell from "./ui/ModalShell.vue";
import { answerConfirm, confirmDialog } from "../state/confirm-dialog";
</script>

<template>
  <!-- 窓の動きは ModalShell (2026-10-10 オーナー「動きが統一されてない所」)。ほかの窓の上に出す (layer="confirm")。Esc・× はキャンセル -->
  <ModalShell
    :open="!!confirmDialog.pending.value"
    :title="confirmDialog.pending.value?.title ?? '確認'"
    layer="confirm"
    width="w-full max-w-lg"
    body-class="px-4 py-3"
    @close="answerConfirm(false)"
  >
    <p v-if="confirmDialog.pending.value" class="text-[12px] text-[var(--exile-color-text-secondary)] leading-relaxed whitespace-pre-line">
      {{ confirmDialog.pending.value.message }}
    </p>
    <template #footer>
      <template v-if="confirmDialog.pending.value">
        <button
          type="button"
          class="ml-auto text-[12px] underline text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]"
          @click="answerConfirm(false)"
        >
          {{ confirmDialog.pending.value.cancelLabel ?? "キャンセル" }}
        </button>
        <button
          type="button"
          class="px-3 py-1 rounded-lg border text-[12px] transition-colors"
          :class="
            confirmDialog.pending.value.danger
              ? 'border-rose-500/70 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20'
              : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]'
          "
          @click="answerConfirm(true)"
        >
          {{ confirmDialog.pending.value.okLabel ?? "はい" }}
        </button>
      </template>
    </template>
  </ModalShell>
</template>

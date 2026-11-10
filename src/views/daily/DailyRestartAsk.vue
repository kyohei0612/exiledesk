<!--
  DailyRestartAsk.vue — 「スタートからやり直す」の確かめの窓 (D-37j、11-10)。木はリセットされ、始め方 (1 段目) から選び直す。残り時間は止まらない。
  形は提出の確かめ (DailySubmitAsk) と同じ ModalShell。やり直す中身は呼ぶ側 (DailyPlay の restart)
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; yes: [] }>();
</script>

<template>
  <ModalShell :open="open" :title="tr('スタートからやり直しますか?', 'Start over?')" width="w-[440px] max-w-[94vw]" @close="emit('close')">
    <div data-daily-restart-ask class="flex flex-col gap-3 p-4 text-[14px]">
      <p>{{ tr("今の木はリセットされ、始め方とフラクチャーする MOD を選び直します。", "Your current tree will be reset, and you'll choose how to start and which mod to fracture again.") }}</p>
      <p class="text-[13px] opacity-80">{{ tr("残り時間は止まらずに進みます。", "The clock keeps running.") }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn" data-daily-restart-no @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" class="g-btn-red" data-daily-restart-yes @click="emit('yes')">{{ tr("やり直す", "Start over") }}</button>
      </div>
    </div>
  </ModalShell>
</template>

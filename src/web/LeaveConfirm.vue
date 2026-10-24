<!--
  LeaveConfirm.vue — ツリーの作りかけで外のページへ移る前の確かめ (2026-10-24 オーナー「ツリー作成中は離れる時に保存せずに終了するか聞く」)。
  聞くかどうかと移る先は web/page.ts (setLeaveGuard・leaveAsk)。WebApp.vue に 1 つ置く。Esc・× ・後ろを押すは「やめる」
-->
<script setup lang="ts">
import ModalShell from "../components/ui/ModalShell.vue";
import { tr } from "../i18n/lang";
import { answerLeave, leaveAsk } from "./page";
</script>

<template>
  <ModalShell :open="!!leaveAsk" :title="tr('確認', 'Confirm')" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" rec="leave-confirm" @close="answerLeave(false)">
    <p class="text-[13px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ tr("保存していない変更があります。保存せずに終了しますか?", "You have unsaved changes. Leave without saving?") }}</p>
    <template #footer>
      <button type="button" data-leave-cancel class="g-btn sm ml-auto" @click="answerLeave(false)">{{ tr("やめる", "Cancel") }}</button>
      <button type="button" data-leave-ok class="g-btn sm" @click="answerLeave(true)">{{ tr("保存せずに終了", "Leave without saving") }}</button>
    </template>
  </ModalShell>
</template>

<!--
  ReplyAsk.vue — 要望への返事のポップアップ (U-36、スイッチ replyPopup)。返事は state/feedback-replies.ts の popupReplies (開いた時と 45 分後に聞く)。
  出すのは強制更新と同じく人が次に押した時 (web/force-update.ts の addPressAsker、強制更新が先・同時に 2 つは出さない)。
  閉じる・× ・Esc・後ろを押すで閉じたら見た事にして 2 度と出さない (オーナー 11-10「閉じるで２度と同じ内容のポップ表示なしでおけ」)。
  「返事を書く」は要望のページを返事の形で開く (FeedbackDialog が replyTo を見る。文・画像は要望と同じ枠)
-->
<script setup lang="ts">
import { ref } from "vue";
import ModalShell from "../components/ui/ModalShell.vue";
import { tr } from "../i18n/lang";
import { markRepliesSeen, popupReplies, replyTo } from "../state/feedback-replies";
import { addPressAsker } from "./force-update";
import { openFeedback } from "./page";

const open = ref(false);
addPressAsker(() => { if (!popupReplies.value.length) return false; open.value = true; return true; }, () => open.value);

function close(): void { open.value = false; markRepliesSeen(); }
function write(id: string): void {
  const r = popupReplies.value.find((x) => x.id === id) ?? null;
  close();
  replyTo.value = r;
  openFeedback();
}
</script>

<template>
  <ModalShell :open="open && popupReplies.length > 0" :title="tr('要望への返事が届きました', 'You got a reply to your feedback')" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" rec="reply-popup" @close="close">
    <div class="flex flex-col gap-3">
      <section v-for="r in popupReplies" :key="r.id" data-reply-item class="flex flex-col gap-1.5">
        <p class="truncate text-[11px] text-[var(--exile-color-text-tertiary)]" :title="r.asked">{{ tr("あなたの要望", "Your feedback") }}: {{ r.asked }}</p>
        <p class="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--exile-color-text-primary)]">{{ tr(r.reply, r.en ?? r.reply) }}</p>
        <p v-if="r.askImage" class="text-[11px] text-amber-200/80">{{ tr("画像を付けて返事をいただけると助かります", "A screenshot in your reply would help") }}</p>
        <div class="flex justify-end">
          <button type="button" data-reply-write class="g-btn sm" @click="write(r.id)">{{ tr("返事を書く", "Write a reply") }}</button>
        </div>
      </section>
    </div>
    <template #footer>
      <button type="button" data-reply-close class="g-btn sm ml-auto" autofocus @click="close">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>

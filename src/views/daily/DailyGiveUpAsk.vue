<!--
  DailyGiveUpAsk.vue — 挑戦を諦める確かめの窓 (D-37b)。帯の「諦める」と一覧の「続ける」の横 (D-37f) で同じ窓・同じ口 (POST /daily/giveup)。
  終えられたら done、つながらない時は窓の中に一言
-->
<script setup lang="ts">
import { ref } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { giveUpTry } from "./daily-api";

const props = defineProps<{ id: string; open: boolean; /** 開発版の見本 (dev=giveup): サーバーに送らない */ dev?: boolean }>();
const emit = defineEmits<{ close: []; done: [] }>();
const failed = ref(false);
async function giveUp(): Promise<void> {
  failed.value = false;
  if (props.dev || (await giveUpTry(props.id))) emit("done"); else failed.value = true;
}
</script>

<template>
  <ModalShell :open="open" :title="tr('挑戦を諦める', 'Give up the challenge')" width="w-[420px] max-w-[94vw]" @close="emit('close')">
    <div data-daily-giveup-ask class="flex flex-col gap-3 p-4 text-[14px]">
      <!-- 11-09 夜オーナー「本当に諦めますか？でいいと思う赤文字」 -->
      <p data-daily-giveup-q class="text-[16px] text-[var(--exile-color-signal-down)]">{{ tr("本当に諦めますか?", "Really give up?") }}</p>
      <p class="text-[13px] opacity-80">{{ tr("提出せずに終わります。今日の挑戦はもう始め直せません。", "This ends without a submission. You can't restart today's challenge.") }}</p>
      <p v-if="failed" class="text-[13px] text-[var(--exile-color-signal-down)]">{{ tr("サーバーにつながらず、終えられませんでした。もう一度押してください。", "Couldn't reach the server, so it didn't end. Press again.") }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn" @click="emit('close')">{{ tr("続ける", "Keep going") }}</button>
        <button type="button" class="g-btn-red" data-daily-giveup-ok @click="giveUp">{{ tr("諦める", "Give up") }}</button>
      </div>
    </div>
  </ModalShell>
</template>

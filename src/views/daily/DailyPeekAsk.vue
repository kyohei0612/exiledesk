<!--
  DailyPeekAsk.vue — 今日の順位のレシピを見る前の窓 (D-50c)。今日まだ挑戦できる人に「見ると今日の挑戦は諦めた扱い」を出し、
  「諦めて見る」で諦め (POST /daily/giveup、始めていない人は始めずに諦めた印) にしてから done。つながらない時は窓の中に一言
-->
<script setup lang="ts">
import { ref } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { giveUpTry } from "./daily-api";
import { liveFlush } from "./daily-live";

const props = defineProps<{ id: string; name: string | null }>();
const emit = defineEmits<{ close: []; done: [] }>();
const failed = ref(false);
async function peek(): Promise<void> {
  failed.value = false;
  await liveFlush(); // 挑戦の画面から来た時は最後の手を控えへ (D-57b、挑戦中でなければ何もしない)
  if (await giveUpTry(props.id)) emit("done"); else failed.value = true;
}
</script>

<template>
  <ModalShell :open="!!name" :title="tr('今日のレシピを見る', 'View today\'s recipe')" width="w-[420px] max-w-[94vw]" @close="emit('close')">
    <div data-daily-peek-ask class="flex flex-col gap-3 p-4 text-[14px]">
      <p>{{ tr(`${name} のレシピの中身を見ると、今日の挑戦は諦めた扱いになり、もう挑戦できない。前に出した提出の記録は残る。`, `Viewing ${name}'s recipe counts as giving up today's challenge; you can't take it afterwards. Earlier submissions stay on record.`) }}</p>
      <p v-if="failed" class="text-[var(--exile-color-signal-down)]">{{ tr("諦めの印を置けなかった (つながらない)。もう一度押す。", "Couldn't record giving up (connection). Try again.") }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn" @click="emit('close')">{{ tr("見ない", "Don't view") }}</button>
        <button type="button" class="g-btn-red" data-daily-peek-ok @click="peek">{{ tr("諦めて見る", "Give up and view") }}</button>
      </div>
    </div>
  </ModalShell>
</template>

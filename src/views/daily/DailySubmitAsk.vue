<!--
  DailySubmitAsk.vue — 提出の確かめの窓と、出した後の結果の窓 (D-35c)。提出は 1 回だけで、出したら挑戦は終わり。
  確かめ: 「これで提出しますか?」+ 完成 1 個あたりの費用・完成率 → 「提出する」で POST /daily/submit。結果: 完成 1 個あたりの費用・完成率・今の順位 (D-02、1 人でも完成すれば順位に載る) → 「順位を見る」でお題のページへ
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { rankOf, SOLVE_RATE, submitTry } from "./daily-api";
import { goDaily } from "./daily-open";

const props = defineProps<{ id: string; open: boolean; cost: number; rate: number; /** 開発版の見本: 結果の窓から開く (dev=done) */ shown?: { cost: number; rate: number } | null; /** 開発版の見本: サーバーに送らない */ dev?: boolean }>();
const emit = defineEmits<{ close: []; done: [] }>();
const step = ref<"ask" | "sending" | "done">(props.shown ? "done" : "ask");
const failed = ref(false);
/** 出した時の数 (出した後に木を見ても変わらない) */
const sent = ref<{ cost: number; rate: number } | null>(props.shown ?? null);
const solved = computed(() => (sent.value?.rate ?? 0) >= SOLVE_RATE);
/** 今の順位 (順位に載る時だけ。サーバーの表が古くても自分の記録は端末の物で入る) */
const place = computed(() => { if (!solved.value) return null; const i = rankOf(props.id).findIndex((r) => r.me); return i < 0 ? null : i + 1; });
async function send(): Promise<void> {
  failed.value = false;
  step.value = "sending";
  const r = props.dev ? { ok: true } : await submitTry(props.id, props.cost, props.rate);
  if (!r.ok) { step.value = "ask"; failed.value = true; return; }
  sent.value = { cost: props.cost, rate: props.rate };
  step.value = "done";
  emit("done");
}
function close(): void {
  if (step.value === "sending") return;
  emit("close");
  if (step.value === "done") step.value = "ask";
}
</script>

<template>
  <ModalShell :open="open" :title="step === 'done' ? tr('提出した', 'Submitted') : tr('これで提出しますか?', 'Submit this?')" width="w-[440px] max-w-[94vw]" @close="close">
    <div v-if="step !== 'done'" data-daily-submit-ask class="flex flex-col gap-3 p-4 text-[14px]">
      <p>{{ tr("提出すると今日の挑戦は終わり、出し直せません。", "Submitting ends today's challenge. You can't submit again.") }}</p>
      <p class="daily-submit-nums"><b>{{ cost }} {{ tr("神", "div") }}</b> <small>{{ tr("完成 1 個あたりの費用", "per finished item") }}</small> <b>{{ rate }}%</b> <small>{{ tr("完成率", "finished") }}</small></p>
      <p v-if="failed" class="text-[var(--exile-color-signal-down)]">{{ tr("提出が届かなかった (つながらない・時間切れ・もう出した)。", "The submission didn't go through (connection, time is up, or already submitted).") }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn" data-daily-submit-cancel :disabled="step === 'sending'" @click="close">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" class="g-btn-red" data-daily-submit-ok :disabled="step === 'sending'" @click="send">{{ tr("提出する", "Submit") }}</button>
      </div>
    </div>
    <div v-else data-daily-submit-done class="flex flex-col gap-3 p-4 text-[14px]">
      <p class="daily-submit-nums"><b>{{ sent!.cost }} {{ tr("神", "div") }}</b> <small>{{ tr("完成 1 個あたりの費用", "per finished item") }}</small> <b>{{ sent!.rate }}%</b> <small>{{ tr("完成率", "finished") }}</small></p>
      <p v-if="solved">{{ place ? tr(`今の順位は ${place} 位。`, `You're #${place} right now.`) : tr("順位は少し後に出ます。", "Your place shows up shortly.") }}</p>
      <p v-else>{{ tr("完成 0 の記録。順位には載りません。", "Nothing finished, so this isn't ranked.") }}</p>
      <p class="text-[13px] opacity-80">{{ tr("今日の挑戦はこれで終わり。木は見るだけで開けます。", "Today's challenge is over. You can still view the tree.") }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="g-btn" data-daily-submit-close @click="close">{{ tr("木を見る", "View the tree") }}</button>
        <button type="button" class="g-btn-red" data-daily-submit-rank @click="close(); goDaily({ view: 'detail', q: id })">{{ tr("順位を見る", "See the ranking") }}</button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.daily-submit-nums { display: flex; align-items: baseline; gap: 6px; }
.daily-submit-nums b { font-size: 20px; }
.daily-submit-nums small { margin-right: 12px; opacity: 0.7; }
</style>

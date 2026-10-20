<!--
  SimAutoConfirm.vue — 自動 / 手動を切り替える時の確かめの窓 (2026-10-20 S2 の手 4、文は設計 auto-flow-design の 2)。
  消える物がある時だけ出す (use-sim-auto.ts の ask)。窓の動きは ModalShell
-->
<script setup lang="ts">
import ModalShell from "../../components/ui/ModalShell.vue";
import { tr } from "../../i18n/lang";

const props = defineProps<{ ask: { to: boolean; n: number; t1?: boolean } | null }>();
const emit = defineEmits<{ ok: [to: boolean]; cancel: [] }>();
</script>

<template>
  <ModalShell :open="!!props.ask" :title="props.ask?.t1 ? tr('T1 の狙いがあります', 'Some targets are T1') : props.ask?.to ? tr('自動にしますか?', 'Switch to auto?') : tr('手動にしますか?', 'Switch to manual?')" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" rec="sim-auto-confirm" @close="emit('cancel')">
    <p v-if="props.ask" class="text-[13px] leading-relaxed text-[var(--exile-color-text-secondary)]">
      <template v-if="props.ask.t1">{{ tr("T1 の狙いがあります。自動は T2 以上として組みます (T1 は完成しにくく計算も長い)。", "Some targets are T1. Auto plans them as T2 or better (T1 rarely finishes and takes long to calculate).") }}<template v-if="props.ask.n"><br />{{ tr(`手で入れた打ち方の答え (${props.ask.n} 場面) と回した結果は消えます。`, `Your answers (${props.ask.n} situations) and run results will be cleared.`) }}</template></template>
      <template v-else-if="props.ask.to">{{ tr(`手で入れた打ち方の答え (${props.ask.n} 場面) と回した結果は消えて、付け方・付ける順番・打ち方を最善手で埋め直します。`, `Your answers (${props.ask.n} situations) and run results will be cleared, and methods, order and answers will be refilled with the best moves.`) }}</template>
      <template v-else>{{ tr("自動で決めた付け方・付ける順番・打ち方の答えは消えて、② の付け方を選ぶ所に戻ります。狙う MOD と値段はそのまま。", "The methods, order and answers chosen automatically will be cleared, and you'll go back to choosing methods in step 2. Your target mods and prices stay.") }}</template>
    </p>
    <template #footer>
      <button type="button" class="g-btn sm ml-auto max-md:min-h-10" @click="emit('cancel')">{{ props.ask?.to ? tr("手動のまま", "Keep manual") : tr("自動のまま", "Keep auto") }}</button>
      <button type="button" data-sim-auto-ok class="g-btn-red sm max-md:min-h-10" @click="props.ask && emit('ok', props.ask.to)">{{ props.ask?.t1 ? tr("T2 以上にして自動にする", "Set to T2+ and switch to auto") : props.ask?.to ? tr("自動にする", "Switch to auto") : tr("手動にする", "Switch to manual") }}</button>
    </template>
  </ModalShell>
</template>

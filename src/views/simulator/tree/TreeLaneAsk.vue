<!--
  TreeLaneAsk.vue — 削減の手を消す・打ち直す前の一言の窓 (S-65c4、スイッチ treeLaneAsk)。
  聞くかどうかと数は tree-lane-ask.ts (askLane)。TreeOverlays.vue に 1 つ置く。Esc・×・後ろを押すは「やめる」(何も変えない)
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import { tr } from "../../../i18n/lang";
import { answerLane, laneAsk, laneText } from "./tree-lane-ask";
</script>

<template>
  <ModalShell :open="!!laneAsk" :title="tr('削減の手を変えます', 'Changing the Whittling craft')" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" rec="tree-lane-ask" @close="answerLane(false)">
    <p data-tree-lane-ask class="text-[13px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ laneText(laneAsk?.n ?? 0) }}</p>
    <template #footer>
      <button type="button" data-tree-lane-cancel class="g-btn sm ml-auto" @click="answerLane(false)">{{ tr("やめる", "Cancel") }}</button>
      <button type="button" data-tree-lane-ok class="g-btn sm" @click="answerLane(true)">{{ tr("消して進む", "Remove and continue") }}</button>
    </template>
  </ModalShell>
</template>

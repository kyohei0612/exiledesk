<!--
  TreeWhittleQuit.vue — 帯の右の「削減をやめる」を押した時の確かめの窓 (S-65c5、スイッチ treeWhittleQuit)。
  数えと組み替えは tree-whittle-quit.ts (askQuit)。TreeOverlays.vue に 1 つ置く。Esc・×・後ろを押すは「やめる」(何も変えない)
-->
<script setup lang="ts">
import ModalShell from "../../../components/ui/ModalShell.vue";
import { tr } from "../../../i18n/lang";
import { answerQuit, quitAsk } from "./tree-whittle-quit";
</script>

<template>
  <ModalShell :open="!!quitAsk" :title="tr('削減をやめます', 'Stop Whittling')" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" rec="tree-whittle-quit" @close="answerQuit(false)">
    <p data-tree-whittle-quit-ask :data-n="quitAsk?.n ?? 0" class="text-[13px] leading-relaxed text-[var(--exile-color-text-secondary)]">
      {{ tr(`外れの MOD レベルで分けた ${quitAsk?.frames ?? 0} つの枠を 1 つの箱に戻します。枠に置いた手 ${quitAsk?.n ?? 0} つは、下の枝ごと消えます (1 つ戻すで戻せる)。続けて次に打つ手を選べます。`,
        `The ${quitAsk?.frames ?? 0} frames split by the miss's mod level go back to one box. ${quitAsk?.n ?? 0} ${(quitAsk?.n ?? 0) === 1 ? "craft" : "crafts"} placed in the frames will be removed, along with the branches below (Undo restores them). You can then choose the next craft.`) }}
    </p>
    <template #footer>
      <button type="button" data-tree-whittle-quit-cancel class="g-btn sm ml-auto" @click="answerQuit(false)">{{ tr("やめる", "Cancel") }}</button>
      <button type="button" data-tree-whittle-quit-ok class="g-btn sm" @click="answerQuit(true)">{{ tr("削減をやめる", "Stop Whittling") }}</button>
    </template>
  </ModalShell>
</template>

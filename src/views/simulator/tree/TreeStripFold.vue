<!--
  TreeStripFold.vue — 消去の続きを畳んだ札 (S-28g ③、前の S-28b の札の見た目のまま)。
  根の最初の自動の消去の箱の場所に「消去 × n 段・止まった所 m」。止まった箱は札の下に並ぶ。押すと開く (Vue Flow の node-click、SimTreePage の onNodeClick)。
  中の箱に足りない所 (S-89b の「!」) や止まり (S-72) があれば赤で数を出す。fold = 開いた続きの「≈ 畳む」のボタン (head の箱の左)
-->
<script setup lang="ts">
import { BOX_W } from "../../../services/simulator/tree/tree-model";
import { FOLD_H } from "../../../services/simulator/tree/tree-strip-fold";
import { tr } from "../../../i18n/lang";

defineProps<{ head: string; n?: number; m?: number; issues?: number; stops?: number; /** 開いた続きの「≈ 畳む」(箱の左、ツリーの座標) */ fold?: { x: number; y: number; inv: number } }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button v-if="fold" type="button" data-tree-strip-refold :data-box-id="head" class="nodrag nopan pointer-events-auto absolute z-[5] -translate-x-full whitespace-nowrap rounded-md border border-dashed border-sky-400/70 bg-[#101820] px-2 text-[12px] leading-7 text-sky-200 hover:bg-sky-500/20"
    :style="{ left: `${fold.x - 10}px`, top: `${fold.y + 8}px`, scale: String(fold.inv), transformOrigin: 'right top' }" :title="tr('消去の続きを札 1 枚に畳む', 'Fold the repeated annuls into one card')" @click.stop="emit('toggle')">≈ {{ tr("畳む", "Fold") }}</button>
  <div v-else data-tree-strip-fold :data-box-id="head" class="flex cursor-pointer select-none flex-col justify-center rounded-xl border-[1.5px] border-dashed border-sky-400/70 bg-[#101820] px-3 text-[12px] hover:border-sky-300"
    :style="{ width: `${BOX_W}px`, height: `${FOLD_H}px` }" :title="tr('押すと消去の続きの箱を開く', 'Click to show the repeated annul boxes')">
    <b class="text-[14px] text-sky-200">≈ {{ tr(`消去 × ${n} 段・止まった所 ${m}`, `Annul × ${n} steps, ${m} stop points`) }}</b>
    <span class="flex flex-wrap gap-x-2 text-[#9fb4c4]">{{ tr("押すと開く", "Click to open") }}
      <b v-if="issues" data-tree-strip-issues class="text-rose-400">! {{ issues }}</b>
      <b v-if="stops" data-tree-strip-stops class="text-rose-400">{{ tr(`止まり ${stops} 人`, `${stops} stuck`) }}</b>
    </span>
  </div>
</template>

<!--
  TreeStripFold.vue — 全部消えてよい消去の直線の間の箱を畳んだ札 (S-28b 案 A、スイッチ stripFold)。
  間の最初の箱の場所に「≈ 途中 n 箱 (消去 × n)」。押すと開く (Vue Flow の node-click、SimTreePage の onNodeClick)。
  間の箱に足りない所 (S-89b の「!」) や止まり (S-72) があれば赤で数を出す。fold = 開いた直線の「≈ 畳む」のボタン (間の最初の箱の左)
-->
<script setup lang="ts">
import { BOX_W } from "../../../services/simulator/tree/tree-model";
import { FOLD_H } from "../../../services/simulator/tree/tree-strip-fold";
import { tr } from "../../../i18n/lang";

defineProps<{ head: string; n?: number; issues?: number; stops?: number; /** 開いた直線の「≈ 畳む」(箱の左、ツリーの座標) */ fold?: { x: number; y: number; inv: number } }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <button v-if="fold" type="button" data-tree-strip-refold :data-box-id="head" class="nodrag nopan pointer-events-auto absolute z-[5] -translate-x-full whitespace-nowrap rounded-md border border-dashed border-sky-400/70 bg-[#101820] px-2 text-[12px] leading-7 text-sky-200 hover:bg-sky-500/20"
    :style="{ left: `${fold.x - 10}px`, top: `${fold.y + 8}px`, scale: String(fold.inv), transformOrigin: 'right top' }" :title="tr('途中の箱を札 1 枚に畳む', 'Fold the middle boxes into one card')" @click.stop="emit('toggle')">≈ {{ tr("畳む", "Fold") }}</button>
  <div v-else data-tree-strip-fold :data-box-id="head" class="flex cursor-pointer select-none flex-col justify-center rounded-xl border-[1.5px] border-dashed border-sky-400/70 bg-[#101820] px-3 text-[12px] hover:border-sky-300"
    :style="{ width: `${BOX_W}px`, height: `${FOLD_H}px` }" :title="tr('押すと途中の箱を開く', 'Click to show the middle boxes')">
    <b class="text-[14px] text-sky-200">≈ {{ tr(`途中 ${n} 箱 (消去 × ${n})`, `${n} middle boxes (Annul × ${n})`) }}</b>
    <span class="flex flex-wrap gap-x-2 text-[#9fb4c4]">{{ tr("押すと開く", "Click to open") }}
      <b v-if="issues" data-tree-strip-issues class="text-rose-400">! {{ issues }}</b>
      <b v-if="stops" data-tree-strip-stops class="text-rose-400">{{ tr(`止まり ${stops} 人`, `${stops} stuck`) }}</b>
    </span>
  </div>
</template>

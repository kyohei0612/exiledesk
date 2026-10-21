<!--
  TreeHandChip.vue — 矢印の上の打つ手の札 (押すと替える・消す)。SimTreePage から分けた (2026-10-22)。
  今の形 = 1 行の全文 (長いと … で切れる)。&ui=next = カレンシー・お告げ・カタリストのアイコンの列 + カレンシーの名前だけ、全文は乗せた時
  (オーナー 10-22「高貴なオーブ (完全) + 触媒の高貴のお告げ + 右… が切れて何の手か分からない」)
-->
<script setup lang="ts">
import { computed } from "vue";
import { iconOf } from "../../../state/craft-stage";
import { CATALYSING } from "../../../services/simulator/tree/tree-hands";
import type { Hand } from "../../../services/simulator/tree/tree-model";
import { handLabel, handName } from "./tree-names";
import { TREE_NEXT } from "./tree-merge";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ hand: Hand; id: string; x: number; y: number; inv: number; off: boolean }>();
defineEmits<{ open: [] }>();
/** アイコンの列 (カレンシー → お告げ → 触媒の時のカタリスト) */
const icons = computed(() => [props.hand.currency, ...props.hand.omens, ...(props.hand.catalyst && props.hand.omens.includes(CATALYSING) ? [props.hand.catalyst] : [])].filter((k) => !!iconOf(k)));
</script>

<template>
  <button type="button" data-tree-hand :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/60 bg-[#1a140d] text-[12px] font-semibold text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-amber-300 hover:bg-[#2a2014]"
    :class="[off ? '!pointer-events-none' : '', TREE_NEXT ? 'flex max-w-[260px] items-center gap-1.5 py-0.5 pl-1.5 pr-3' : 'max-w-[300px] truncate px-3 py-1']" :style="{ left: `${x}px`, top: `${y}px`, scale: String(inv) }" :title="handLabel(hand)" @click="$emit('open')">
    <template v-if="TREE_NEXT">
      <span class="flex shrink-0 items-center -space-x-1"><img v-for="k in icons" :key="k" :src="iconOf(k)" alt="" class="size-6 object-contain" /></span>
      <span class="min-w-0 truncate">{{ handName(hand.currency) }}</span>
      <span v-if="hand.repeat" class="shrink-0 rounded-sm bg-amber-400/20 px-1 text-[10px]">{{ tr("当たるまで", "until a hit") }}</span>
    </template>
    <template v-else>{{ handLabel(hand) }}</template>
  </button>
</template>

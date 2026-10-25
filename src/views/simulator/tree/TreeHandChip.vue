<!--
  TreeHandChip.vue — 矢印の上の打つ手の札 (押すと替える・消す)。SimTreePage から分けた (2026-10-22)。
  カレンシー・お告げ・カタリストのアイコンの列 + カレンシーの名前だけ、全文は乗せた時 (前は 1 行の全文で、長いと … で切れた)
  (オーナー 10-22「高貴なオーブ (完全) + 触媒の高貴のお告げ + 右… が切れて何の手か分からない」)
-->
<script setup lang="ts">
import { computed } from "vue";
import { iconOf } from "../../../state/craft-stage";
import { CATALYSING } from "../../../services/simulator/tree/tree-hands";
import type { Hand } from "../../../services/simulator/tree/tree-model";
import { handLabel, handName } from "./tree-names";
import { tr } from "../../../i18n/lang";

/** hand が無い = 分かれ目の札 (split = 行の数。打たずに分ける、10-22) */
/** room = 札の幅の上限 (ツリーの座標、use-tree-edges の chipRoom) */
const props = defineProps<{ hand: Hand | null; split?: number; id: string; x: number; y: number; inv: number; off: boolean; room: number }>();
defineEmits<{ open: [] }>();
/** 触媒の時に先に打つカタリスト (札の頭に「カタリスト →」で出す。10-22 オーナー「カタリストを打つルートが無いとあかん」) */
const cat = computed(() => (props.hand?.catalyst && props.hand.omens.includes(CATALYSING) ? props.hand.catalyst : null));
/** アイコンの列 (カレンシー → お告げ) */
const icons = computed(() => (props.hand ? [props.hand.currency, ...props.hand.omens] : []).filter((k) => !!iconOf(k)));
/** 札の幅の上限: 隣の札と重ならない幅 (倍率で拡げる分を戻す)。はみ出す名前は … で切り、全文は乗せた時 (10-25 オーナー「こういうところだぶるね」) */
const maxW = computed(() => `${Math.round(props.room / props.inv)}px`);
</script>

<template>
  <button v-if="!hand" type="button" data-tree-split-chip :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-teal-400/60 bg-[#0f1a18] px-3 py-0.5 text-[12px] font-semibold text-teal-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-teal-300"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${x}px`, top: `${y}px`, scale: String(inv) }" :title="tr('打たずに分ける: 上の行から見て、合った行の箱へ進む (押すと行を替える)', 'Split without crafting: go to the first matching row (click to edit rows)')" @click="$emit('open')">
    ◇ {{ tr(`分かれ目 (${split ?? 0} 行)`, `Split (${split ?? 0} rows)`) }}
  </button>
  <button v-else type="button" data-tree-hand :data-hand-of="id" class="nodrag nopan pointer-events-auto absolute z-[5] flex -translate-x-1/2 items-center gap-1.5 py-0.5 pl-1.5 pr-3 -translate-y-1/2 rounded-full border border-amber-400/60 bg-[#1a140d] text-[12px] font-semibold text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)] hover:border-amber-300 hover:bg-[#2a2014]"
    :class="off ? '!pointer-events-none' : ''" :style="{ left: `${x}px`, top: `${y}px`, scale: String(inv), maxWidth: maxW }" :title="handLabel(hand)" @click="$emit('open')">
    <span v-if="cat" data-tree-hand-catalyst class="flex min-w-0 shrink items-center gap-0.5 text-sky-200"><img v-if="iconOf(cat)" :src="iconOf(cat)" alt="" class="size-6 object-contain" />{{ handName(cat) }}<span aria-hidden="true" class="opacity-70">→</span></span>
    <span class="flex shrink-0 items-center -space-x-1"><img v-for="k in icons" :key="k" :src="iconOf(k)" alt="" class="size-6 object-contain" /></span>
    <span class="min-w-0 truncate">{{ hand.repeat ? tr("カオススパムオーブ", "Chaos Spam Orb") : handName(hand.currency) }}</span>
    <!-- カオススパムオーブ (当たるまで) は横にカオスの段の名前 -->
    <span v-if="hand.repeat" class="shrink-0 rounded-sm bg-rose-400/20 px-1 text-[10px]">{{ handName(hand.currency) }}</span>
    <!-- 狙い無しの手 (結果は「打った後」の箱 1 つ。札が高貴だけで狙い無しと分からなかった、10-22 白紙から組んだ試し) -->
    <span v-if="hand.free" class="shrink-0 rounded-sm bg-white/15 px-1 text-[10px]">{{ tr("狙い無し", "no target") }}</span>
  </button>
</template>

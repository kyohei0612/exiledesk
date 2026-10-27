<script setup lang="ts">
/**
 * TreeRevealCard.vue — 未発現の冒涜が付いた箱の棚の「発現」の札 (10-27 夜オーナー「未発現のまま次へ」の後で打つ発現、スイッチ boneLater)。
 * 形はカオススパムオーブの札と同じ (棚の札の枠・名前)。絵は相場に無いのでアビスの反響のお告げの絵。持つと発現で出うる MOD から当たりを ☑ で選ぶ
 */
import { iconOf } from "../../../state/craft-stage";
import { ECHO } from "../../../services/simulator/tree/tree-hands";
import { tr } from "../../../i18n/lang";

defineProps<{ on: boolean }>();
const emit = defineEmits<{ hold: [] }>();
</script>

<template>
  <button type="button" data-tree-reveal-card :aria-pressed="on" class="group relative mb-2 flex w-[74px] flex-col items-center px-0.5 pb-1 text-[10px] transition md:w-[80px] md:text-[11px]" :class="on ? 'text-[var(--exile-color-text-title)]' : ''"
    :title="tr('発現 (魂の井戸): 未発現の冒涜 MOD を 3 つの候補から選んで付ける', 'Reveal (the Well of Souls): pick one of 3 options for the unrevealed desecrated mod')" @click="emit('hold')">
    <span class="g-slot grid size-[52px] place-items-center ring-1 ring-violet-400/50 md:size-[56px]" :class="on ? 'on' : ''"><img v-if="iconOf(ECHO)" :src="iconOf(ECHO)" alt="" class="h-9 w-9 object-contain md:h-[42px] md:w-[42px]" draggable="false" /></span>
    <span class="mt-0.5 min-h-[2.5em] text-center leading-tight">{{ tr("発現", "Reveal") }}</span>
  </button>
</template>

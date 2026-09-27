<!--
  ShelfButton.vue — クラフトステージの棚の 1 つ (2026-09-27、ADR-001)

  アイコン・名前・強さの札 (上級 / 完全 / レッサー / グレーター / パーフェクト / 古びた / 変質)・値段。
  カレンシー等は「持つ」(持っている物は金の枠)、お告げは「掛ける」(掛けてある物は紫の枠)。打てない物は灰色 (カーソルで理由)。
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";

const props = defineProps<{ k: string; omen?: boolean }>();
const emit = defineEmits<{ pick: [key: string] }>();

const BADGE: Array<[RegExp, string, string]> = [
  [/_greater$/, "上級", "text-sky-300"],
  [/_perfect$/, "完全", "text-amber-300"],
  [/^essence:lesser:/, "レッサー", "text-white/60"],
  [/^essence:greater:/, "グレーター", "text-sky-300"],
  [/^essence:perfect:/, "パーフェクト", "text-amber-300"],
  [/^desecrate_ancient$/, "古びた", "text-sky-300"],
  [/^desecrate_altered$/, "変質", "text-fuchsia-300"],
];
const badge = computed(() => BADGE.find(([re]) => re.test(props.k)) ?? null);
const reason = computed(() => (props.omen ? null : craftStage.usable(props.k)));
const on = computed(() => (props.omen ? craftStage.omens.value.includes(props.k) : craftStage.held.value === props.k));
</script>

<template>
  <button
    type="button"
    class="group relative flex w-[74px] flex-col items-center rounded-lg border px-1 pb-1 pt-1.5 text-[10px] transition"
    :class="[
      on ? (omen ? 'border-violet-400 bg-violet-500/20 ring-2 ring-violet-400/60' : 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60') : 'border-white/10 bg-black/30 hover:border-white/30',
      reason ? 'opacity-35' : '',
    ]"
    :title="`${nameOf(k)}${reason ? ` — ${reason}` : ''}`"
    data-shelf
    @click="emit('pick', k)"
  >
    <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="h-9 w-9 object-contain" draggable="false" />
    <span v-else class="grid h-9 w-9 place-items-center rounded bg-white/10 text-[16px]">◎</span>
    <span class="mt-0.5 line-clamp-2 text-center leading-tight">{{ nameOf(k) }}</span>
    <span v-if="badge" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px]" :class="badge[2]">{{ badge[1] }}</span>
    <span v-if="priceOf(k)" class="text-[9px] tabular-nums opacity-60">{{ displayCurrency.money(priceOf(k)) }}</span>
  </button>
</template>

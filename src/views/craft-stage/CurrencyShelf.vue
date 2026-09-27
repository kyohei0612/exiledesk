<!--
  CurrencyShelf.vue — クラフトステージのカレンシー棚 (2026-09-27、ADR-001)

  オーナー:「操作は Craft of Exile 仕様 — カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用」
  「カレンシーの種類・アイコン・名前・値段は計算機にリンクして実体化」。
  種類ごとに 普通 / 上級 / 完全 を並べる。アイコンと値段は相場 (market-store)、名前は計算機の jaOfPriceKey。
  その状態で打てない物は灰色 (カーソルを乗せると理由)。持っている物は枠を光らせる。
-->
<script setup lang="ts">
import { craftStage, iconOf, nameOf, priceOf, SHELF } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";

const emit = defineEmits<{ hold: [key: string] }>();
const STRENGTH = (k: string): string => (k.endsWith("_greater") ? "上級" : k.endsWith("_perfect") ? "完全" : "");
</script>

<template>
  <div class="flex flex-wrap gap-x-4 gap-y-2">
    <div v-for="s in SHELF" :key="s.kind" class="flex gap-1.5">
      <button
        v-for="k in s.keys"
        :key="k"
        type="button"
        class="group relative flex w-[74px] flex-col items-center rounded-lg border px-1 pb-1 pt-1.5 text-[10px] transition"
        :class="[
          craftStage.held.value === k ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60' : 'border-white/10 bg-black/30 hover:border-white/30',
          craftStage.usable(k) ? 'opacity-35' : '',
        ]"
        :title="`${nameOf(k)}${craftStage.usable(k) ? ` — ${craftStage.usable(k)}` : ''}`"
        @click="emit('hold', k)"
      >
        <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="h-9 w-9 object-contain" draggable="false" />
        <span v-else class="grid h-9 w-9 place-items-center rounded bg-white/10 text-[16px]">◎</span>
        <span class="mt-0.5 line-clamp-2 text-center leading-tight">{{ nameOf(k) }}</span>
        <span v-if="STRENGTH(k)" class="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[9px]" :class="STRENGTH(k) === '完全' ? 'text-amber-300' : 'text-sky-300'">{{ STRENGTH(k) }}</span>
        <span v-if="priceOf(k)" class="text-[9px] tabular-nums opacity-60">{{ displayCurrency.money(priceOf(k)) }}</span>
      </button>
    </div>
  </div>
</template>

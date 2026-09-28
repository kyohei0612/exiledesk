<!--
  StageCurrencyCard.vue — クラフトステージの棚の詳細カード (2026-09-28、ADR-001)

  オーナー:「ステージでのカレンシー詳細カードは文字だけでいいから、どんな挙動するオーブやお告げなのか細かく書いてくれ」。
  上: ゲームの公式の説明 (currency-hover-ja.json、クライアント原本)。下: このステージでの動き ([[craft-stage-help.ts]])。
  打てない時は理由、相場があれば値段。棚のボタン ([[ShelfButton.vue]]) に 0.4 秒乗せると出る。
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage, nameOf, priceOf } from "../../state/craft-stage";
import { enOf } from "../../state/craft-stage-shelf";
import { stageHelp } from "../../state/craft-stage-help";
import { currencyHoverOf } from "../../services/currency/currency-hover";
import { displayCurrency } from "../../state/display-currency";

const props = defineProps<{ k: string; x: number; y: number; reason: string | null; omen?: boolean }>();
/** ゲームの書式記号 ([Corrupted|コラプト] → コラプト、[Hit] → Hit) を外す */
const plain = (s: string): string => s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
const official = computed(() => (currencyHoverOf(enOf(props.k, craftStage.item.value))?.e ?? []).map(plain));
const help = computed(() => stageHelp(props.k, craftStage.data.value, craftStage.item.value));
/** 「**強調**」を太字の区切りにする */
const parts = (line: string): Array<{ t: string; b: boolean }> => line.split("**").map((t, i) => ({ t, b: i % 2 === 1 }));
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed z-[500] w-[340px] rounded-xl border border-amber-300/40 bg-[#0d0b08]/95 p-3 text-[12px] leading-relaxed shadow-[0_8px_30px_rgba(0,0,0,0.7)]" :style="{ left: `${x}px`, top: `${y}px` }">
      <p class="text-[14px] font-bold" :class="omen ? 'text-violet-200' : 'text-amber-100'">{{ nameOf(k) }}</p>
      <p v-if="priceOf(k)" class="text-[11px] text-white/50">相場 {{ displayCurrency.money(priceOf(k)) }}</p>
      <div v-if="official.length" class="mt-2 border-t border-white/10 pt-2 text-[#b8c8e8]">
        <p v-for="(l, i) in official" :key="'o' + i">{{ l }}</p>
      </div>
      <div v-if="help.length" class="mt-2 border-t border-white/10 pt-2">
        <p class="mb-1 text-[11px] font-bold text-amber-200/80">このステージでの動き</p>
        <p v-for="(l, i) in help" :key="'h' + i" class="flex gap-1.5">
          <span class="text-amber-300/60">・</span>
          <span><template v-for="(p, j) in parts(l)" :key="j"><b v-if="p.b" class="text-white">{{ p.t }}</b><template v-else>{{ p.t }}</template></template></span>
        </p>
      </div>
      <p v-if="reason" class="mt-2 rounded-lg bg-rose-500/15 px-2 py-1 text-rose-300">今は打てない: {{ reason }}</p>
    </div>
  </Teleport>
</template>

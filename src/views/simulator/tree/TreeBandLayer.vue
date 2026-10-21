<!--
  TreeBandLayer.vue — 段の目印 (2026-10-22 オーナー「段ごとに 1 つ揃った / 2 つ揃った…、木の左の外、全体表示でも読める、乗せると説明」)。
  整列 (tree-model の tidy) で当たりの箱は揃った狙いの数の段に並ぶので、その段の高さに木の左の外へ小さな札を置く (bandsOf)。
  Vue Flow の倍率と移動が掛かる層 (zoom-pane) に置き、k = 倍率の逆数で画面の上の大きさをいつも同じにする
-->
<script setup lang="ts">
import { computed } from "vue";
import { bandsOf, BOX_H, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ doc: TreeDoc; k: number }>();
/** 木の一番左の箱からの空き (ツリーの座標) */
const GAP = 28;
const bands = computed(() => bandsOf(props.doc));
const left = computed(() => Math.min(...Object.values(props.doc.boxes).map((b) => b.x)) - GAP);
</script>

<template>
  <div v-for="b in bands" :key="b.n" data-tree-band :data-band="b.n" class="nopan pointer-events-auto absolute z-[4] -translate-x-full -translate-y-1/2 whitespace-nowrap rounded-full border border-amber-400/50 bg-[#1a140d]/90 px-2.5 py-0.5 text-[12px] font-semibold text-amber-100/90"
    :style="{ left: `${left}px`, top: `${b.y + BOX_H / 2}px`, scale: String(k), transformOrigin: 'right center' }"
    :title="tr(`この高さの当たりの箱は、狙いの MOD が ${b.n} つ揃った所 (整列で段を合わせる)`, `Hit boxes at this height have ${b.n} target mod${b.n > 1 ? 's' : ''} in place (Tidy lines them up)`)">
    {{ tr(`${b.n} つ揃った`, `${b.n} target${b.n > 1 ? "s" : ""}`) }}
  </div>
</template>

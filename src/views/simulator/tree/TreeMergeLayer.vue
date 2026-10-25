<!--
  TreeMergeLayer.vue — 戻りの矢印だけの箱から行き先へ流れ込む線 (tree-merge.ts。Vue Flow の zoom-pane の中)。
  当たりの箱 = 進む色、外れ・消えたの箱 = 戻りの色。既定はどれも線無しで、行き先は箱の下の「↩」札で読む (押すとその箱へ寄る)。
  乗せた箱・選んだ箱に関わる線だけ濃く出す、帯の「線を全部表示」で全部 (10-25 オーナー「整列しても線がごちゃってて気持ち悪い」。前は行き先が 1 か所の当たりの線をいつも出していた)。箱は全部普通の箱 (10-22 オーナーの選び、前の小さな札は消した)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { MergeLine } from "./tree-merge";

const props = defineProps<{ lines: readonly MergeLine[]; paths: ReadonlyMap<string, string>; hover: string | null; /** 選んだ箱 (窓を開いている箱) */ sel: string | null; showAll: boolean }>();
const COLOR = { fwd: "#a39a88", back: "#5fd0e0" } as const;

/** 乗せた箱・選んだ箱に関わる線 (出元の箱・行き先・出元の親) */
const on = (l: MergeLine, id: string | null): boolean => !!id && (l.from === id || l.to === id || l.parent === id);
const hot = (l: MergeLine): boolean => on(l, props.hover) || on(l, props.sel);
const shown = computed(() => props.lines.filter((l) => props.showAll || hot(l)));
const opacity = (l: MergeLine): number => (hot(l) ? 1 : l.kind === "fwd" ? 0.85 : 0.55);
</script>

<template>
  <svg data-tree-merge-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
    <path v-for="l in shown.filter((x) => !hot(x))" :key="l.id" data-tree-merge-line :data-kind="l.kind" :d="paths.get(l.id)" :stroke="COLOR[l.kind]" :stroke-opacity="opacity(l)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
  <!-- 乗せた物の線は箱の前に濃く -->
  <svg v-if="hover || sel" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
    <path v-for="l in shown.filter(hot)" :key="l.id" data-tree-merge-hot :d="paths.get(l.id)" :stroke="COLOR[l.kind]" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
</template>

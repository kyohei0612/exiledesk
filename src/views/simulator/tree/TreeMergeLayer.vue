<!--
  TreeMergeLayer.vue — 戻りの矢印だけの箱から行き先へ流れ込む線 (tree-merge.ts。Vue Flow の zoom-pane の中)。
  当たりの箱 = 進む色 (行き先が 1 か所ならいつも出す)。外れ・消えたの箱 = 戻りの色で、既定は線無し
  (乗せた箱の線だけ濃く出す、帯の「線を全部表示」で全部。オーナー 10-22 の案 A)。箱は全部普通の箱 (10-22 オーナーの選び、前の小さな札は消した)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { MergeLine } from "./tree-merge";

const props = defineProps<{ lines: readonly MergeLine[]; paths: ReadonlyMap<string, string>; hover: string | null; showAll: boolean }>();
const COLOR = { fwd: "#a39a88", back: "#5fd0e0" } as const;

/** 乗せた箱に関わる線 (出元の箱・行き先・出元の親) */
const hot = (l: MergeLine): boolean => !!props.hover && (l.from === props.hover || l.to === props.hover || l.parent === props.hover);
/** 行き先が 1 か所に決まる当たりの箱 (2 つ目の当たり → 同じ形の箱) の線はいつも出す。行き先が分かれる物 (狙いが消えた後の取り直し) は乗せた時・全部表示の時 */
const single = computed(() => { const n = new Map<string, number>(); for (const l of props.lines) n.set(l.from, (n.get(l.from) ?? 0) + 1); return n; });
const shown = computed(() => props.lines.filter((l) => (l.kind === "fwd" && single.value.get(l.from) === 1) || props.showAll || hot(l)));
const opacity = (l: MergeLine): number => (hot(l) ? 1 : l.kind === "fwd" ? 0.85 : 0.55);
</script>

<template>
  <svg data-tree-merge-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
    <defs>
      <marker v-for="(c, k) in COLOR" :id="`tree-merge-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="c" /></marker>
    </defs>
    <path v-for="l in shown.filter((x) => !hot(x))" :key="l.id" data-tree-merge-line :data-kind="l.kind" :d="paths.get(l.id)" :stroke="COLOR[l.kind]" :stroke-opacity="opacity(l)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" :marker-end="`url(#tree-merge-${l.kind})`" />
  </svg>
  <!-- 乗せた物の線は箱の前に濃く -->
  <svg v-if="hover" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
    <path v-for="l in shown.filter(hot)" :key="l.id" data-tree-merge-hot :d="paths.get(l.id)" :stroke="COLOR[l.kind]" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" :marker-end="`url(#tree-merge-${l.kind})`" />
  </svg>
</template>

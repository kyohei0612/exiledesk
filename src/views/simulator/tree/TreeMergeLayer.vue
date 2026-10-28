<!--
  TreeMergeLayer.vue — 戻りの矢印だけの箱から行き先へ流れ込む線 (tree-merge.ts。Vue Flow の zoom-pane の中)。
  当たりの箱 = 進む色、外れ・消えたの箱 = 戻りの色。既定はどれも線無しで、行き先は箱の下の「↩」札で読む (押すとその箱へ寄る)。
  乗せた箱・選んだ箱に関わる線だけ濃く出す、帯の「線を全部表示」で全部 (10-25 オーナー「整列しても線がごちゃってて気持ち悪い」。前は行き先が 1 か所の当たりの線をいつも出していた)。箱は全部普通の箱 (10-22 オーナーの選び、前の小さな札は消した)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { MergeLine } from "./tree-merge";
import { flag } from "../../../web/release-flags";

const props = defineProps<{ lines: readonly MergeLine[]; paths: ReadonlyMap<string, string>; hover: string | null; /** 選んだ箱 (窓を開いている箱) */ sel: string | null; showAll: boolean }>();
const emit = defineEmits<{ hover: [id: string | null] }>();
/** 乗せた時だけつながる線を光らせ、ほかは少し暗く。乗せていない時は全部普段の色 (統合の線もいつも光らせない。S-85b、スイッチ hoverLines、10-28 夜オーナー「真ん中とか枠にホバーしたら繋がってる線のみライトアップしてくれ」) */
const HOVER = flag("hoverLines");
const COLOR = { fwd: "#a39a88", back: "#5fd0e0", join: "#d4a94a" } as const;

/** 乗せた箱・選んだ箱に関わる線 (出元の箱・行き先・出元の親) */
// 全部消えてよい消去の直線の途中の箱 (出元の親) に乗せても線は出さない。動きは次の箱へ進むだけで、上へつながる線は誤解される (10-27 夜オーナー「何も線表示させないでおｋ」、スイッチ heldTags)
const on = (l: MergeLine, id: string | null): boolean => !!id && (l.from === id || l.to === id || (l.parent === id && !(l.viaStrip)));
const hot = (l: MergeLine): boolean => on(l, props.hover) || on(l, props.sel);
// 統合 (同じ MOD 群のため統合) の線はいつも出す (10-27 オーナー「実線で常に出す。普通の線だとなんでつながってるのか分からん」)
// 再挑戦・戻りの線 (back) は「線を全部表示」でも出さず、乗せた時だけ (案 ①、S-87c、スイッチ retryHover。10-28 深夜オーナー「P１は案①だな」。全部出すと木を囲む四角になった)
const RETRY = flag("retryHover");
// 灰の ↩ (当たり・打った後の戻り、fwd) も乗せた時だけ (S-145、⑦10 → ブラック案・オーナー「進めてくれ」10-28)
const shown = computed(() => props.lines.filter((l) => (props.showAll && !(RETRY && l.kind !== "join")) || hot(l) || l.kind === "join"));
const joins = computed(() => props.lines.filter((l) => l.kind === "join" && l.mark));
const busy = computed(() => !!(props.hover || props.sel));
const opacity = (l: MergeLine): number => (HOVER ? (busy.value ? 0.25 : l.kind === "join" ? 0.6 : 0.5) : hot(l) || l.kind === "join" ? 1 : l.kind === "fwd" ? 0.85 : 0.55);
</script>

<template>
  <svg data-tree-merge-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
    <path v-for="l in shown.filter((x) => !hot(x))" :key="l.id" data-tree-merge-line :data-kind="l.kind" :data-from="l.from" :data-to="l.to" :d="paths.get(l.id)" :stroke="COLOR[l.kind]" :stroke-opacity="opacity(l)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
  <!-- 統合の線のつながりの印 (鎖、Craft of Exile の連結の印のように。10-27 オーナー「つながりのある特殊なマークを付けた方が良い」)。箱の前に出す -->
  <svg class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
    <g v-for="l in joins" :key="l.id" data-tree-join-mark :data-from="l.from" :data-to="l.to" :transform="`translate(${l.mark!.x} ${l.mark!.y})`" :class="HOVER ? 'pointer-events-auto cursor-pointer' : ''" @pointerenter="HOVER && emit('hover', l.from)" @pointerleave="HOVER && emit('hover', null)">
      <circle r="11" fill="#1a140c" :stroke="COLOR.join" stroke-width="2" />
      <g transform="rotate(-45)" :stroke="COLOR.join" stroke-width="1.8" fill="none"><rect x="-7.5" y="-3" width="8" height="6" rx="3" /><rect x="-0.5" y="-3" width="8" height="6" rx="3" /></g>
    </g>
  </svg>
  <!-- 乗せた物の線は箱の前に濃く -->
  <svg v-if="hover || sel" class="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width="1" height="1">
    <path v-for="l in shown.filter(hot)" :key="l.id" data-tree-merge-hot :data-kind="l.kind" :data-from="l.from" :data-to="l.to" :d="paths.get(l.id)" :stroke="COLOR[l.kind]" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
</template>

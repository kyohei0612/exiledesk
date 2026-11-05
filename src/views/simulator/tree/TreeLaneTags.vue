<!--
  TreeLaneTags.vue — 木の段 (横レーン) の番号を枠の左の端に常に出す (S-147f。オーナー 11-04「左に必ず段を記載するのはどうかな 位置は枠の真ん中に配置して、シミュの枠左端
  拡大縮小に合わせて大きさも調整これは枠に合わせてとする。絶えず表示ルールともする」)。PC の木 (SimTreePage) とスマホの全体図 (PhoneViewMap) で同じ部品。
  縦は木の座標 (mid) を倍率と送りで画面へ、横は枠の左の細い暗い帯に貼り付く。押せない層 (引っ張り・ホイールは下の木へ)。
  見た目はオーナーの A/B (11-05): 字は「n 段目」(「Ｎ段目　だね」)・地は左の細い帯 (A)・最小 12px (A)。スマホも同じ (「順守でおｋ ＰＣに」)
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";

export interface Lane { /** 段の真ん中 (木の座標) */ mid: number; /** 段の番号 (畳みで混ざる時は「5〜7」) */ text: string }
const props = defineProps<{ lanes: Lane[]; /** 木の送り (縦) */ ty: number; /** 倍率 */ k: number }>();

/** 倍率 1 の時の字の大きさ (箱の幅 316 に対して) と、読める最小の大きさ */
const BASE = 28, MIN = 12;
const size = computed(() => Math.max(MIN, BASE * props.k));
const label = (t: string): string => tr(`${t} 段目`, `Step ${t}`);
/** 字の幅の見込み (字の大きさを 1 として。数字・英字は狭く、漢字・かな・〜は 1、空白は 0.3) */
const em = (s: string): number => [...s].reduce((w, ch) => w + (/[0-9A-Za-z]/.test(ch) ? 0.62 : ch === " " ? 0.3 : 1), 0);
/** 帯の幅 (一番長い札が入る幅) */
const bandW = computed(() => Math.ceil(size.value * (Math.max(...props.lanes.map((l) => em(label(l.text))), 1) + 0.8)));
</script>

<template>
  <div data-tree-lanes class="pointer-events-none absolute inset-y-0 left-0 z-[15]">
    <div data-tree-lane-band class="absolute inset-y-0 left-0 border-r border-amber-200/15 bg-black/55" :style="{ width: `${bandW}px` }" />
    <span v-for="l in lanes" :key="l.text + l.mid" data-tree-lane :data-lane-text="l.text"
      class="absolute left-0 flex -translate-y-1/2 items-center justify-center whitespace-nowrap font-bold leading-none tabular-nums text-amber-100/85 [text-shadow:0_1px_3px_#000]"
      :style="{ top: `${ty + l.mid * k}px`, fontSize: `${size}px`, width: `${bandW}px` }">{{ label(l.text) }}</span>
  </div>
</template>

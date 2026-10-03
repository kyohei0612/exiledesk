<!--
  VideoTray.vue — 動画モードの棚 (2026-09-28、ADR-001)

  その工程で使うカレンシー・骨・エッセンス・お告げだけを、ゲームのスタッシュのように並べる。
  2026-09-28 オーナー「動画用だと MOD 拡大するからアイテムの横に下の段移動したいね、ずっと拡大で使える」: アイテムの右横に縦に並べる
  (多い時は 2 列)。下の段が無いので、MOD が増えてアイテムが伸びても重ならない。
  カーソル ([[use-video-hand.ts]]) がここへ動いて拾う。持っている物は薄く (手に移った)、有効にしたお告げはゲームと同じく赤金に脈打ち、使われると消える。
-->
<script setup lang="ts">
import { computed, type ComponentPublicInstance } from "vue";
import { iconOfKey, nameOfKey } from "../../state/craft-stage-shelf";
import type { StageItem } from "../../services/craft-stage/types";
import { isShard, SHARDS_PER_ORB } from "../../services/craft-stage/apply-act";

/** height: 撮影用 (inline) で合わせるアイテム枠の高さ (px)。棚の上端・下端をこの中に収める (POE2Tube 要望 ⑥) */
/** glow: 撮影用。拾われた物を薄くせず光らせる (要望 ⑦) */
/** counts: 拾ったシャードの数 (キー → 個数)。シャードの棚に「n/10」を出す (要望 ⑧) */
/**
 * item: 画面に出しているアイテム。骨は部位で鎖骨 / 顎骨 / 肋骨が決まるので、名前と絵はこれで引く (共有の状態の item に頼らない。
 * 2026-10-04 POE2Tube: 撮影で骨の枠が「dese」(キーの頭 4 文字) になった。Vite が書き換え途中の古いモジュールを配り、棚だけ item が空の方を見ていた)
 */
const props = defineProps<{ item: StageItem; keys: string[]; omens: string[]; held: string; armed: string[]; spent: string[]; slots: Map<string, HTMLElement>; inline?: boolean; height?: number; glow?: boolean; counts?: Record<string, number> }>();
const GAP = 8;
const PAD = 8;
/**
 * 撮影用: 枠の高さに収まる一番少ない列数と、その時のアイコンの大きさ (枠の高さ ÷ 段数。大きくても 64)。
 * 2026-09-28 kyohei「使うクラフト素材が 2 列になるなら上限下限をアイテムの横枠から飛び出さないように」
 */
const fit = computed(() => {
  const h = props.height ?? 0;
  if (!props.inline || !h) return null;
  const sep = props.omens.length ? GAP * 2 + 1 : 0;
  for (let c = 1; c <= 4; c++) {
    const rows = Math.ceil(props.keys.length / c) + Math.ceil(props.omens.length / c);
    const size = Math.floor((h - PAD * 2 - sep - (rows - 1) * GAP) / Math.max(1, rows));
    if (size >= 44 || c === 4) return { cols: c, size: Math.min(64, size) };
  }
  return null;
});
/** 並べる数が多い時は小さくする (枠の幅 640 に収める) */
const size = computed(() => fit.value?.size ?? ((props.keys.length + props.omens.length) > 8 ? 52 : 56));
/**
 * 1 列に 8 つまで (高さ 560 に収める)。超えたら 2 列 (さらに超えたら 3 列)。
 * 撮影用 (inline、1.45 倍) は 5 段まで: 下 15% を空けるため (6 段で 912px / 1080 まで伸びて境目すれすれだった)
 */
const cols = computed(() => {
  if (fit.value) return fit.value.cols;
  const n = props.keys.length + props.omens.length;
  const rows = props.inline ? 5 : 8;
  return n > rows * 2 ? 3 : n > rows ? 2 : 1;
});
const grid = computed(() => ({ gridTemplateColumns: `repeat(${cols.value}, ${size.value}px)` }));
const iconOf = (k: string): string => iconOfKey(k, props.item);
const nameOf = (k: string): string => nameOfKey(k, props.item);
function reg(k: string, el: Element | ComponentPublicInstance | null): void {
  if (el instanceof HTMLElement) props.slots.set(k, el);
}
</script>

<template>
  <div
    class="shrink-0 space-y-2 rounded-2xl border border-white/10 bg-black/55 p-2 shadow-[inset_0_0_24px_rgba(0,0,0,0.6)]"
    :class="inline ? '' : 'absolute left-[612px] top-[120px] max-h-[560px]'"
    :style="fit && height ? { height: `${height}px` } : undefined"
  >
    <div class="grid gap-2" :style="grid">
      <div
        v-for="k in keys"
        :key="k"
        :ref="(el) => reg(k, el)"
        class="relative grid shrink-0 place-items-center rounded-lg border bg-[#16120c] transition-all duration-150"
        :class="glow && held === k ? 'border-amber-300 shadow-[0_0_16px_4px_rgba(250,204,21,0.75)]' : 'border-amber-200/20'"
        :style="{ width: `${size}px`, height: `${size}px` }"
        :title="nameOf(k)"
      >
        <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="h-[78%] w-[78%] object-contain transition-opacity duration-150" :class="held === k && !glow ? 'opacity-20' : ''" />
        <span v-else class="text-[10px] text-white/60">{{ nameOf(k).slice(0, 4) }}</span>
        <span v-if="isShard(k)" :key="`c${counts?.[k] ?? 0}`" class="stage-row-in absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/85 px-1 text-[10px] font-bold tabular-nums text-amber-100">{{ counts?.[k] ?? 0 }}/{{ SHARDS_PER_ORB }}</span>
      </div>
    </div>
    <template v-if="omens.length">
      <div class="h-px bg-white/15" />
      <div class="grid gap-2 pt-1" :style="grid">
        <div
          v-for="o in omens"
          :key="o"
          :ref="(el) => reg(o, el)"
          class="relative grid shrink-0 place-items-center rounded-lg border transition-all duration-200"
          :class="armed.includes(o) ? 'stage-omen-on border-orange-300' : 'border-violet-300/25 bg-[#140f1c]'"
          :style="{ width: `${size}px`, height: `${size}px` }"
          :title="nameOf(o)"
        >
          <img v-if="iconOf(o)" :src="iconOf(o)" alt="" class="h-[78%] w-[78%] object-contain" :class="spent.includes(o) ? 'stage-omen-spent' : ''" />
          <span v-else class="text-[10px] text-violet-200">{{ nameOf(o).slice(0, 4) }}</span>
          <span v-if="armed.includes(o)" class="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-orange-600/90 px-1 text-[9px] font-bold text-white">有効</span>
        </div>
      </div>
    </template>
  </div>
</template>

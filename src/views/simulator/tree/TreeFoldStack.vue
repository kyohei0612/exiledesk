<!--
  TreeFoldStack.vue — 兄弟の枠を左の枠の後ろへ重ねた形 (S-28h ④、スイッチ foldFracChaos、11-20 オーナー「3B」)。
  左の枠 (keep) の後ろに重なったカード (畳んだ数に合わせて 2 枚まで) を描き、角に「×n」と中の足りない所の「!」。押すと引き戸で開く (use-fold-slide)。
  (S-28i、スイッチ annulStack) 消去・カオスの縦の続きも同じ形 (down)。前の箱の手の札 (chip) の後ろにも同じ段々で札を重ねる。押すと下へ滑り出る。
  Vue Flow の倍率と移動が掛かる層 (zoom-pane) に置く。カードは箱の後ろ (z-index -1)、手の札の重ねは手の札の後ろ (4)、角の印は箱の前
-->
<script setup lang="ts">
import { BOX_W } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";

const p = defineProps<{ head: string; keep: string; x: number; y: number; h: number; n: number; issues: number; inv: number; /** (S-28i) 前の箱の手の札 (真ん中・大きさ・倍率) */ chip?: { x: number; y: number; w: number; h: number; k: number } | null; down?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const STEP = 9;
const cards = (): number[] => [2, 1].filter((k) => k <= Math.min(2, p.n));
</script>

<template>
  <!-- 奥のカードから描く (同じ重ね順の中で後に描いた物が前)。重ね順は線と同じ -1 = 箱の後ろ・地の前 -->
  <div v-for="i in cards()" :key="i" data-tree-fold-stack-card :data-stack-of="keep" class="pointer-events-none absolute rounded-xl border-[1.5px] border-[#a88a5c] bg-[#1d1811]"
    :style="{ left: `${x + STEP * i}px`, top: `${y + STEP * i}px`, width: `${BOX_W}px`, height: `${h}px`, zIndex: -1, opacity: i === 1 ? 1 : 0.75, boxShadow: '0 4px 10px rgba(0,0,0,0.6)' }" />
  <!-- (S-28i) 手の札 (カレンシー) も箱と同じ段々で後ろに重ねる -->
  <template v-if="chip">
    <div v-for="i in cards()" :key="`c${i}`" data-tree-fold-stack-chip :data-stack-of="keep" class="pointer-events-none absolute rounded-2xl border border-amber-400/60 bg-[#1a140d]"
      :style="{ left: `${chip.x + STEP * i}px`, top: `${chip.y + STEP * i}px`, width: `${chip.w}px`, height: `${chip.h}px`, translate: '-50% -50%', scale: String(chip.k), zIndex: 4, opacity: i === 1 ? 1 : 0.75, boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }" />
  </template>
  <button type="button" data-tree-fold-stack :data-box-id="head" :data-stack-of="keep" :data-stack-down="down || undefined" class="nodrag nopan pointer-events-auto absolute z-[5] flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-emerald-300/80 bg-[#0f1a16] px-2.5 text-[13px] font-bold leading-6 text-emerald-200 shadow-[0_2px_8px_rgba(0,0,0,0.6)] hover:bg-emerald-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-200"
    :style="{ left: `${x + BOX_W + STEP * Math.min(2, n)}px`, top: `${y - 6}px`, translate: '-50% 0', scale: String(inv), transformOrigin: 'center top' }"
    :title="down ? tr(`続く箱 ${n} つを重ねている。押すと下へ滑り出る`, `${n} following boxes are stacked here. Click to slide them down`) : tr(`同じ流れの兄弟の枠 ${n} つを重ねている。押すと右へ滑り出る`, `${n} sibling boxes with the same flow are stacked here. Click to slide them open`)" @click.stop="emit('toggle')">
    ×{{ n }}<b v-if="issues" data-tree-strip-issues class="text-rose-400">! {{ issues }}</b>
  </button>
</template>

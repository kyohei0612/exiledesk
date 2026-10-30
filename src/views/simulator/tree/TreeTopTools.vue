<!--
  TreeTopTools.vue — 木の枠の上の帯の右の道具のまとまり (1 つ戻す・やり直し・整列・まとめる・線・メモ・全画面・白紙)。SimTreePage から分けた (10-26 夜):
  オーナー「1 行で表示させてくれ」で、右下の倍率の道具 (TreeCanvasTools) と同じ平たいボタンの列にした (ゲームの絵の枠は 1 つ 58px あり 1 行に入らなかった)。
  帯が広ければ短い名前も出す (帯の @container の幅、切らない・… にしない)。全文はボタンの title
-->
<script setup lang="ts">
import Icon from "../../../components/ui/Icon.vue";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { simOp } from "../../../web/track";

/** armed = 白紙に戻すを 1 回押した (もう一度押すと戻す) */
defineProps<{ linesAll: boolean; memoOpen: boolean; full: boolean; note: boolean; armed: boolean }>();
const emit = defineEmits<{ lines: []; memo: []; full: []; clear: [] }>();
const t = useTree();
const BTN = "flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-1.5 @max-[899px]:min-w-7 @max-[899px]:px-1 text-[12px] text-[#d8ccb4] hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-35 aria-pressed:bg-amber-400/20 aria-pressed:text-amber-100";
/** 短い名前 (帯が 1300px 以上の時だけ) */
const LBL = "hidden @min-[1300px]:inline";
/** 再挑戦の線は乗せた時だけ (S-87c、スイッチ retryHover) */
/** 人が選ぶ「まとめる」は無い (S-52b、スイッチ pickOff) */
</script>

<template>
  <div data-tree-top-tools role="toolbar" :aria-label="tr('ツリーの道具', 'Tree tools')" class="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-[#15110c]/95 p-0.5">
    <template v-if="!t.needBase.value">
      <button type="button" data-tree-undo :class="BTN" :disabled="!t.canUndo.value" :title="tr('1 つ戻す (Ctrl+Z)', 'Undo (Ctrl+Z)')" :aria-label="tr('1 つ戻す', 'Undo')" @click="simOp('undo'); t.undo()"><Icon name="undo" class="size-4" /><span :class="LBL">{{ tr("戻す", "Undo") }}</span></button>
      <button type="button" data-tree-redo :class="BTN" :disabled="!t.canRedo.value" :title="tr('やり直し (Ctrl+Shift+Z / Ctrl+Y)', 'Redo (Ctrl+Shift+Z / Ctrl+Y)')" :aria-label="tr('やり直し', 'Redo')" @click="simOp('redo'); t.redo()"><Icon name="undo" class="size-4 -scale-x-100" /></button>
      <span class="mx-0.5 h-5 w-0.5 rounded bg-white/10 @max-[899px]:hidden" aria-hidden="true" />
      <button type="button" data-tree-lines-all :class="BTN" :aria-pressed="linesAll" :title="linesAll ? tr('合流の線を隠す (再挑戦の線はいつも乗せた箱だけ)', 'Hide merge lines (retry lines always show only for the hovered box)') : tr('合流の線を全部出す (再挑戦の線はいつも乗せた箱だけ)', 'Show all merge lines (retry lines always show only for the hovered box)')" :aria-label="tr('線を全部表示', 'Show all lines')" @click="emit('lines')"><Icon name="link" class="size-4" /><span :class="LBL">{{ tr("線", "Lines") }}</span></button>
    </template>
    <button type="button" data-tree-memo :class="BTN" :aria-pressed="memoOpen" :title="tr('欲しい MOD とメモの窓 (ツリーを押しても閉じない)', 'Wanted mods & notes window (stays open while you edit)')" :aria-label="tr('メモ', 'Notes')" @click="emit('memo')"><Icon name="pencil" class="size-4" /><span :class="LBL">{{ tr("メモ", "Notes") }}</span><span v-if="note" class="size-1.5 rounded-full bg-amber-400" /></button>
    <template v-if="!t.needBase.value">
      <button type="button" data-tree-full :class="BTN" :aria-pressed="full" :title="full ? tr('全画面を閉じる', 'Exit full screen') : tr('全画面に広げる', 'Full screen')" :aria-label="full ? tr('全画面を閉じる', 'Exit full screen') : tr('全画面に広げる', 'Full screen')" @click="emit('full')">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg><span :class="LBL">{{ tr("全画面", "Full") }}</span>
      </button>
      <span class="mx-0.5 h-5 w-0.5 rounded bg-white/10 @max-[899px]:hidden" aria-hidden="true" />
      <!-- 1 回目で赤く「もう一度押すと白紙に戻す」(押せる幅は文に合わせて広がる) -->
      <button type="button" data-tree-clear :class="[BTN, armed ? '!bg-rose-700 !text-white' : '']" :title="tr('白紙に戻す: 始まりの箱だけに戻す (1 つ戻すで戻せる)', 'Clear: back to just the start box (undo restores it)')" :aria-label="tr('白紙に戻す', 'Clear')" @click="emit('clear')">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>
        <span v-if="armed">{{ tr("もう一度押すと白紙に戻す", "Click again to clear") }}</span><span v-else :class="LBL">{{ tr("白紙", "Clear") }}</span>
      </button>
    </template>
  </div>
</template>

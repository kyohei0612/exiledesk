<!--
  TreeCanvasTools.vue — ツリーの右下に浮かぶ道具 (2026-10-22 見た目の作り直し、research/notes/2026-10-22-tree-ui-references.md の 6・7・16):
  ミニマップ (箱は結果の色、今見ている所の枠。押す / 引っ張るとそこへ送る) と、ComfyUI の並びのツールバー
  (選択 / 手 = 見るだけで画面を動かす・全体表示・− 倍率 ＋・ミニマップの切り替え)。ミニマップは既定で閉じ、開くと右の列の残りいっぱい (10-26 夜)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { BOX_H, BOX_W, type TreeBox } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { toCss } from "../../../utils/zoom";
import { gesture } from "./use-gesture";

/** view = 今見ている所 (ツリーの座標。Vue Flow の viewport から use-tree-flow.ts で出す) */
const props = defineProps<{ boxes: TreeBox[]; view: { x: number; y: number; w: number; h: number }; zoom: number }>();
const hand = defineModel<boolean>("hand", { default: false });
const emit = defineEmits<{ fit: []; zoomIn: []; zoomOut: []; reset: []; center: [x: number, y: number] }>();

const view = computed(() => props.view);
/** ミニマップは既定で閉じ、道具のボタンで出し入れ (10-26 夜オーナー「ミニマップいらんわ、デフォで閉じで必要な時出す形でおけ」)。開いたかはこのブラウザに覚える */
const MAP_KEY = "exiledesk.tree.minimap2";
const showMap = ref((() => { try { return localStorage.getItem(MAP_KEY) === "1"; } catch { return false; } })());
watch(showMap, (v) => { try { localStorage.setItem(MAP_KEY, v ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });

/**
 * ミニマップの広さ = 開いた時は右の列の残りいっぱい (10-26 夜オーナー「ここ使うなら」)。
 * 入れ物の大きさを測って合わせる (ページの zoom の前の CSS ピクセル)
 */
const mapBox = ref<HTMLElement | null>(null);
const MAP_W = ref(200), MAP_H = ref(128);
const MAP_PAD = 60;
const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
  const el = mapBox.value;
  if (el && el.clientWidth && el.clientHeight) { MAP_W.value = el.clientWidth; MAP_H.value = el.clientHeight; }
});
watch(mapBox, (el, old) => { if (old) ro?.unobserve(old); if (el) ro?.observe(el); }, { immediate: true });
onBeforeUnmount(() => ro?.disconnect());
const box = computed(() => {
  const bs = props.boxes, v = view.value, W = MAP_W.value, H = MAP_H.value;
  const x0 = Math.min(...bs.map((b) => b.x), v.x) - MAP_PAD, y0 = Math.min(...bs.map((b) => b.y), v.y) - MAP_PAD;
  const x1 = Math.max(...bs.map((b) => b.x + BOX_W), v.x + v.w) + MAP_PAD, y1 = Math.max(...bs.map((b) => b.y + BOX_H), v.y + v.h) + MAP_PAD;
  const k = Math.min(W / (x1 - x0), H / (y1 - y0));
  return { x0, y0, k, dx: (W - (x1 - x0) * k) / 2, dy: (H - (y1 - y0) * k) / 2 };
});
const mx = (x: number): number => (x - box.value.x0) * box.value.k + box.value.dx;
const my = (y: number): number => (y - box.value.y0) * box.value.k + box.value.dy;
const COLOR: Record<TreeBox["out"], string> = { start: "#5fb4e0", hit: "#e0b060", junk: "#e0707a", junkGone: "#9aa7b8", lost: "#a58be0", any: "#c8b896", pass: "#c8b896", branch: "#78c8be" };
const fill = (b: TreeBox): string => (b.done ? "#f2d27a" : COLOR[b.out]);

/** ミニマップを押す / 引っ張る = その点を真ん中に送る (判定・capture・座標の換算は use-gesture.ts) */
function go(e: PointerEvent): void {
  const svg = e.currentTarget as SVGSVGElement;
  const at = (clientX: number, clientY: number): void => {
    const r = svg.getBoundingClientRect();
    const px = toCss(clientX - r.left), py = toCss(clientY - r.top);
    emit("center", (px - box.value.dx) / box.value.k + box.value.x0, (py - box.value.dy) / box.value.k + box.value.y0);
  };
  at(e.clientX, e.clientY);
  gesture(e, { slop: 0, onMove: (p) => at(p.clientX, p.clientY) });
}
// 右の列 248px に 1 行で入る幅 (10-26 夜、列を 3 分の 1 細くした)
const btn = "flex h-8 min-w-7 items-center justify-center rounded-md px-1 text-[#d8ccb4] hover:bg-white/10 hover:text-white";
</script>

<template>
  <!-- 木の枠の外の右の列の下: ミニマップ (開いた時だけ、残りの高さいっぱい) と、一番下に倍率の道具 (10-26 夜オーナー「A でいい」「ここ使うなら」: 木の上に浮かせると寄った・引っ張った後に箱を隠した、モンキー 8 の 4) -->
  <div class="mt-auto flex min-h-0 min-w-0 flex-col items-end gap-2" :class="showMap ? 'flex-1' : ''" data-tree-tools>
    <div v-if="showMap" ref="mapBox" class="min-h-[96px] w-full flex-1 overflow-hidden rounded-lg border border-white/10 bg-[#0d0b08]">
    <svg data-tree-minimap class="pointer-events-auto block cursor-pointer" :width="MAP_W" :height="MAP_H" :aria-label="tr('ミニマップ (押すとそこへ)', 'Minimap (click to jump)')" @pointerdown="go">
      <rect v-for="b in boxes" :key="b.id" :x="mx(b.x)" :y="my(b.y)" :width="Math.max(3, BOX_W * box.k)" :height="Math.max(2, BOX_H * box.k)" rx="2" :fill="fill(b)" fill-opacity="0.75" />
      <rect :x="mx(view.x)" :y="my(view.y)" :width="view.w * box.k" :height="view.h * box.k" rx="3" fill="rgba(255,236,190,0.06)" stroke="rgba(255,220,150,0.7)" stroke-width="2" />
    </svg>
    </div>
    <!-- スマホ (768px 未満) は区切りを隠し % を細くして木の枠 (375 幅で 281px) に収める (帯が 286px で左の「選択」が枠の外に切れた、10-23 モンキー 5) -->
    <div class="pointer-events-auto flex max-w-full flex-wrap items-center justify-end gap-0.5 rounded-lg border border-white/10 bg-[#15110c]/95 p-1 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.6)]" role="toolbar" :aria-label="tr('見え方', 'View')">
      <button type="button" data-tree-tool-select :class="[btn, !hand ? 'bg-amber-400/20 text-amber-100' : '']" :aria-pressed="!hand" :title="tr('選択 (箱を組む)', 'Select (edit boxes)')" :aria-label="tr('選択', 'Select')" @click="hand = false">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 3l7 17 2.5-7.5L21 10z" /></svg>
      </button>
      <button type="button" data-tree-tool-hand :class="[btn, hand ? 'bg-amber-400/20 text-amber-100' : '']" :aria-pressed="hand" :title="tr('手 (見るだけ。どこを引いても画面が動く)', 'Hand (view only, drag anywhere to pan)')" :aria-label="tr('手', 'Hand')" @click="hand = true">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>
      </button>
      <span class="hidden" aria-hidden="true" /><!-- 区切りの線は出さない (右の列 248px に 1 行で入らなかった、10-26 夜) -->
      <button type="button" data-tree-fit :class="btn" :title="tr('全体を表示 (1)', 'Fit all (1)')" :aria-label="tr('全体を表示', 'Fit all')" @click="emit('fit')">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
      </button>
      <button type="button" data-tree-zoom-out :class="btn" :title="tr('縮める (ホイールでも)', 'Zoom out (also mouse wheel)')" :aria-label="tr('縮める', 'Zoom out')" @click="emit('zoomOut')">−</button>
      <button type="button" data-tree-zoom-reset :class="[btn, 'w-10 tabular-nums']" :title="tr('等倍に戻す', 'Reset to 100%')" @click="emit('reset')">{{ Math.round(zoom * 100) }}%</button>
      <button type="button" data-tree-zoom-in :class="btn" :title="tr('広げる (ホイールでも)', 'Zoom in (also mouse wheel)')" :aria-label="tr('広げる', 'Zoom in')" @click="emit('zoomIn')">＋</button>
      <span class="hidden" aria-hidden="true" /><!-- 区切りの線は出さない (右の列 248px に 1 行で入らなかった、10-26 夜) -->
      <button type="button" data-tree-tool-map :class="[btn, showMap ? 'bg-amber-400/20 text-amber-100' : '']" :aria-pressed="showMap" :title="tr('ミニマップ', 'Minimap')" :aria-label="tr('ミニマップ', 'Minimap')" @click="showMap = !showMap">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></svg>
      </button>
    </div>
  </div>
</template>

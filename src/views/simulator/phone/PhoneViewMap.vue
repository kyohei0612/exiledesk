<!--
  PhoneViewMap.vue — シミュのスマホの見るだけの全体図 (S-94・S-94c。オーナー 11-01「この画面に拡大したらPCのあの例のMOD群のこういうの拡大したら表示してあげたらもういうことなさそうだな」)。
  質問の形の PhoneMap は 1 版残すので (usePhoneQuiz の組む動きと戻り先選びが入っている)、見るだけの図はここに分けた。整理の版で PhoneMap が消える。
  縮めた時は色の札、倍率 CARD_K から見えている箱だけ PC の箱 TreeBox と線の途中の手の札 TreeHandChip (押せない層)。小さい箱を押すと窓を開かずその箱へ寄る (S-94c)。指の動きは use-map-touch.ts
  手の札はオーナー 11-01「PC版特有のこの枠にこの手を打ってから次の枠みたいな表示になってない。あと品質もかかれてないかな」。品質はカードの中の行 (StageItemCard の qualityRow)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BOX_H, BOX_W, type TreeBox as Box } from "../../../services/simulator/tree/tree-model";
import { EST_H, laneTexts, rowLayout } from "../../../services/simulator/tree/tree-row-tops";
import { laneBandW } from "../tree/tree-lane-band";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { foldOuts, stripFolds, stripHidden, toggleStripFold, stopToHead } from "../../../services/simulator/tree/tree-strip-fold";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import TreeBox from "../tree/TreeBox.vue";
import TreeHandChip from "../tree/TreeHandChip.vue";
import TreeLaneTags from "../tree/TreeLaneTags.vue";
import TreeRunLayer from "../tree/TreeRunLayer.vue";
import type { TreeRunWalk } from "../tree/use-tree-run";
import { LINE } from "../tree/use-tree-edges";
import { backLabelOf } from "../tree/tree-fail";
import { handIcon, handLabel, OUT_LOOK } from "../tree/tree-names";
import { bandAway, bandHead, bandMidX, headBands } from "../../../services/simulator/tree/tree-band";
import { useTree } from "../tree/use-tree";
import { simOp } from "../../../web/track";
import { tr } from "../../../i18n/lang";
import { useMapTouch, type MapBounds } from "./use-map-touch";

const props = defineProps<{ /** 回した結果 (PC と同じ層 TreeRunLayer で線・人数・止まりを重ねる) */ result?: TreeRunResult | null; /** 回す時の 1 人目 (PC と同じ use-tree-run の walk) */ walk?: TreeRunWalk | null }>();
const t = useTree();
const doc = t.doc;
/** 名前と手の絵を出す倍率 (箱の幅 56px) */
const NAME_K = 0.18;
/** PC の箱に替える倍率 (箱の幅 142px、S-94c) */
const CARD_K = 0.45;
/** 箱へ寄る時と「拡大」のボタンの倍率 = MOD が読めるぎりぎり (幅 174px。その箱・手の札・次の箱が 1 画面に入る) */
const NEAR_K = 0.55;
/** 寄った箱の上の辺を枠の上からここに置く (下に手の札と次の箱を見せる) */
const NEAR_TOP = 34;
/** 一度に描くカードの上限 (1 枚 約 20ms の読み) */
const CARD_MAX = 12;
/** 押した所から箱までの近さ (小さい箱でも指で押せるよう、PhoneMap と同じ) */
const TAP_PX = 28;
/** 段の間に足す高さ。ここでは箱の高さを測らず見込み EST_H で置くので、背の高いカードと手の札が当たらないよう全体図だけ広げる */
const ROW_EXTRA = 100;
/** 横の棒は子の箱の上の辺からこの高さ、手の札の真ん中はその上 */
const BUS_DY = 24, CHIP_DY = 56;
/** 手の札の幅の上限 (箱の間隔の中) と、一度に描く札の上限 */
const CHIP_ROOM = 320, CHIP_MAX = 16;

const wrap = ref<HTMLElement | null>(null);
const folds = computed(() => stripFolds(doc.value));
const hidden = computed(() => stripHidden(doc.value, folds.value));
const lastToHead = computed(() => stopToHead(folds.value));
/** 描く段 (PC の木と同じ数え = 畳んだ消去の続きの隠した箱は段を取らない。前は深さで数えて、畳みのある木で段の札が重なっていた、11-10 0.1.693 の猿の 3) */
const rows = computed(() => rowLayout(doc.value, () => EST_H).rows);
/** 全体図の中の箱の上の辺 */
const yOf = (b: Box): number => b.y + (rows.value.get(b.id) ?? 0) * ROW_EXTRA;
/** 描く箱 (PC の木と同じ: 品質だけの箱・まとめた箱・畳んだ箱は描かない) */
const boxes = computed(() => Object.values(doc.value.boxes).filter((b) => b.out !== "pass" && !mergedAway(doc.value, b) && !bandAway(doc.value, b) && !hidden.value.has(b.id)));
/** 削減の手前の枠の帯 (PC と同じ、S-65c ⑫): 帯の頭の箱に出す帯と、枠の箱から出る線の元 (帯の真下) */
const bandsView = (id: string) => headBands(doc.value, id).map(({ id: x, lv }) => { const h = doc.value.boxes[x]!.hand; return { id: x, lv, hand: h ? handLabel(h) : null, issue: null, selected: false }; });
const bandFrom = (b: Box): { x: number; y: number } | null => {
  const h = bandHead(doc.value, b.id), bs = headBands(doc.value, h), i = bs.findIndex((x) => x.id === b.id), hb = doc.value.boxes[h]!;
  return i < 0 ? null : { x: hb.x + bandMidX(BOX_W, i, bs.length), y: yOf(hb) + (cardIds.value.has(h) ? BOX_H : EST_H) };
};
const bounds = computed((): MapBounds => {
  const bs = boxes.value;
  if (!bs.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map(yOf));
  return { x, y, w: Math.max(...bs.map((b) => b.x + BOX_W)) - x, h: Math.max(...bs.map((b) => yOf(b) + EST_H)) - y };
});
/** 人が動かしたか (動かした後は、置き直しや窓の大きさで全体へ戻さない) */
let touched = false;
function tap(px: number, py: number): void {
  const wx = (px - m.tx.value) / m.k.value, wy = (py - m.ty.value) / m.k.value, reach = TAP_PX / m.k.value;
  let best: Box | null = null, bd = Infinity;
  for (const b of boxes.value) { const dd = Math.hypot(Math.max(0, b.x - wx, wx - b.x - BOX_W), Math.max(0, yOf(b) - wy, wy - yOf(b) - EST_H)); if (dd < bd) { bd = dd; best = b; } }
  if (!best || bd > reach) return;
  if (folds.value.has(best.id)) { toggleStripFold(best.id); return; }
  goTo(best.id);
}
const m = useMapTouch(wrap, tap, () => { if (!touched) simOp("view-zoom"); touched = true; });
/** その箱へ寄る (カードの倍率まで) */
function goTo(id: string): void {
  const b = doc.value.boxes[id];
  if (!b) return;
  touched = true;
  const z = Math.max(m.k.value, NEAR_K);
  m.glideTo(b.x + BOX_W / 2, yOf(b) + ((wrap.value?.clientHeight ?? 0) / 2 - NEAR_TOP) / z, z);
}
/** 1 人目が枠の外の箱へ進んだ時だけ、今の倍率のままその箱を真ん中へ (PC の use-tree-flow の reveal と同じ動き) */
function reveal(id: string): void {
  const b = doc.value.boxes[id], el = wrap.value;
  if (!b || !el) return;
  const z = m.k.value, sx = b.x * z + m.tx.value, sy = yOf(b) * z + m.ty.value, mg = 12;
  if (sx < mg || sy < mg || sx + BOX_W * z > el.clientWidth - mg || sy + EST_H * z > el.clientHeight - mg) m.glideTo(b.x + BOX_W / 2, yOf(b) + EST_H / 2, z);
}
defineExpose({ goTo, reveal, showAll: () => { touched = false; refit(); } });
/** ボタンは 2 つだけ: 全体が入る倍率と MOD が読めるぎりぎり。細かい調整は指でつまむ (オーナー 11-01「後拡大縮小ボタンでツリー全体表示と拡大でMODが見えるぎりぎりの大きさに調整で２つでいいよ調整は あとはピンチヒットは指でやるだろうしそこ」) */
function showAll(): void { simOp("view-zoom", "all"); touched = false; refit(); }
function showNear(): void {
  simOp("view-zoom", "near");
  const z = m.k.value, w = wrap.value?.clientWidth ?? 0, h = wrap.value?.clientHeight ?? 0;
  touched = true;
  m.glideTo((w / 2 - m.tx.value) / z, (h / 2 - m.ty.value) / z, NEAR_K);
}
/** 全体の時は段の札の帯の分だけ左を空ける (横に広い木で左端の箱が札の下に掛かっていた、11-10 朝の問い 7)。全体の倍率では札の字は最小なので、倍率 0 の幅で足りる */
function refit(): void { if (!touched && wrap.value?.clientWidth) m.fit(bounds.value, laneBandW(lanes.value.map((l) => l.text), 0)); }
let ro: ResizeObserver | null = null;
onMounted(() => { if (wrap.value) { ro = new ResizeObserver(refit); ro.observe(wrap.value); } });
onBeforeUnmount(() => ro?.disconnect());
watch(bounds, refit);
watch(t.opened, () => { touched = false; refit(); });

/** カードにしている箱の id (送っても顔ぶれが同じなら線・札を作り直さない) */
const cardKey = computed(() => cards.value.map((b) => b.id).join(" "));
const cardIds = computed(() => new Set(cardKey.value.split(" ")));
/** 線 (親 → 結果の箱。まとめた箱はまとめ先へ、畳んだ直線は札から)。カードの箱は高さが中身で替わるので、線はカードの裏から出す */
const paths = computed(() => {
  const d = doc.value;
  return Object.values(d.boxes).flatMap((b) => {
    const pid = lastToHead.value.get(b.id) ?? b.parent, p = pid ? d.boxes[pid] : null;
    const to = mergedAway(d, b) ? d.boxes[b.back!] : bandAway(d, b) ? d.boxes[bandHead(d, b.id)] : b;
    if (!p || !to || hidden.value.has(b.id) || hidden.value.has(p.id)) return [];
    const bf = bandFrom(p), x0 = bf?.x ?? p.x + BOX_W / 2, y0 = bf?.y ?? yOf(p) + (p.out === "pass" ? 0 : cardIds.value.has(p.id) ? BOX_H : EST_H), x1 = to.x + BOX_W / 2, y1 = yOf(to);
    return [{ id: b.id, d: `M${x0},${y0} V${y1 - BUS_DY} H${x1} V${y1}`, color: ["hit", "any", "pass", "branch"].includes(to.out) ? LINE.fwd : LINE.bad }];
  });
});
/** 回す時の重ねる層 (PC の TreeRunLayer) に渡す線: 親ごとに子への線 (幹は分けず、子の線が親から出る) */
const runEdges = computed(() => {
  const by = new Map<string, { id: string; d: string }[]>();
  for (const l of paths.value) { const pid = lastToHead.value.get(l.id) ?? doc.value.boxes[l.id]?.parent; if (pid) by.set(pid, [...(by.get(pid) ?? []), { id: l.id, d: l.d }]); }
  return [...by].map(([id, to]) => ({ id, stem: "", to }));
});
const runPos = (b: Box): { x: number; y: number } => ({ x: b.x, y: yOf(b) });
/** 沼った人が回っていた箱 (PC の木の青枠 = TreeBox の swamp と同じ、回した結果を出している間だけ) */
const swampOf = (id: string): boolean => !!props.result?.loopAt?.[id];
const NO_PATHS = new Map<string, string>();
const SHORT: Record<string, [string, string]> = { start: ["始め", "Start"], hit: ["当たり", "Hit"], junk: ["外れ", "Miss"], junkGone: ["外れ消", "Gone"], lost: ["消えた", "Lost"], any: ["打後", "After"], branch: ["分岐", "Split"], blocked: ["同じ MOD", "Same mod"] };
/** 見えている箱 (木の座標の範囲で見る)。送るたびに読むので、変わった時だけ一覧を替える */
const inView = computed(() => {
  const z = m.k.value, x0 = -m.tx.value / z, y0 = -m.ty.value / z, w = (wrap.value?.clientWidth ?? 0) / z, h = (wrap.value?.clientHeight ?? 0) / z;
  return boxes.value.filter((b) => b.x + BOX_W > x0 && b.x < x0 + w && yOf(b) + EST_H > y0 && yOf(b) < y0 + h);
});
/** カードにする箱 (真ん中に近い順に CARD_MAX まで) */
const cards = computed((): Box[] => {
  const z = m.k.value;
  if (z < CARD_K) return [];
  const cx = ((wrap.value?.clientWidth ?? 0) / 2 - m.tx.value) / z, cy = ((wrap.value?.clientHeight ?? 0) / 2 - m.ty.value) / z;
  return [...inView.value].sort((a, b) => Math.hypot(a.x - cx, yOf(a) - cy) - Math.hypot(b.x - cx, yOf(b) - cy)).slice(0, CARD_MAX);
});
/** 線の途中の手の札 (カードの倍率の時だけ。PC の札と同じ部品、通り抜け = 品質だけの手は通り抜けの所に) */
const chips = computed(() => {
  const z = m.k.value, d = doc.value;
  if (z < CARD_K) return [];
  const x0 = -m.tx.value / z, y0 = -m.ty.value / z, w = (wrap.value?.clientWidth ?? 0) / z, h = (wrap.value?.clientHeight ?? 0) / z;
  return Object.values(d.boxes).flatMap((b) => {
    if ((!b.hand && !b.split) || hidden.value.has(b.id) || bandFrom(b)) return []; // 帯の枠の手は帯の中 (札は出さない)
    const kids = foldOuts(d, b, folds.value, hidden.value).map((o) => (mergedAway(d, d.boxes[o]!) ? d.boxes[d.boxes[o]!.back!]! : d.boxes[o]!));
    if (!kids.length) return [];
    const x = b.x + BOX_W / 2, y = b.out === "pass" ? yOf(b) : Math.min(...kids.map(yOf)) - CHIP_DY;
    return x + CHIP_ROOM / 2 > x0 && x - CHIP_ROOM / 2 < x0 + w && y + CHIP_DY > y0 && y - CHIP_DY < y0 + h ? [{ id: b.id, hand: b.hand ?? null, split: b.split?.length, x, y }] : [];
  }).slice(0, CHIP_MAX);
});
/** 名前と手の絵 (カードの箱には出さない) */
const names = computed(() => (m.k.value < NAME_K ? [] : inView.value.filter((b) => !cardIds.value.has(b.id)).map((b) => {
  const s = SHORT[b.out], icon = b.hand ? handIcon(b.hand.currency) || null : null;
  return { id: b.id, x: (b.x + BOX_W / 2) * m.k.value + m.tx.value, y: (yOf(b) + EST_H / 2) * m.k.value + m.ty.value, text: s ? tr(s[0], s[1]) : "", icon };
})));
/** 色の札 (カードの裏には出さない。カードの高さは札と違うのではみ出す) */
const rects = computed(() => boxes.value.filter((b) => !cardIds.value.has(b.id)));
/** 段の番号の札 (S-147f): 描く段ごとに箱の真ん中の高さ。番号は PC の木と同じ laneTexts (「n 段目」、畳みで深さが混ざる段は「小〜大」) */
const lanes = computed(() => {
  const texts = laneTexts(doc.value, rows.value), by = new Map<number, number>();
  for (const b of boxes.value) { const r = rows.value.get(b.id) ?? 0; by.set(r, Math.min(by.get(r) ?? Infinity, yOf(b) + EST_H / 2)); }
  return [...by].filter(([r]) => texts[r]).map(([r, mid]) => ({ mid, text: texts[r]! }));
});
const rgbOf = (b: Box): string => (b.done === "fail" ? "224,112,122" : b.done ? "242,210,122" : OUT_LOOK[b.out].c);
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
    <div class="flex min-w-0 items-center gap-1.5">
      <p class="min-w-0 flex-1 break-words text-[11px] text-sim-dim">{{ tr("つまむと箱の中身 · 押すとその箱へ", "Pinch for details · tap a box to go there") }}</p>
      <button type="button" data-phone-view-all-map class="g-btn sm !min-h-9 shrink-0" @click="showAll">{{ tr("全体", "All") }}</button>
      <button type="button" data-phone-view-near class="g-btn sm !min-h-9 shrink-0" @click="showNear">{{ tr("拡大", "Zoom") }}</button>
    </div>
    <!-- 指はこの枠の中だけ全体図が受け取る (touch-action: none。枠の外はふつうに送れる) -->
    <div ref="wrap" data-phone-view-map class="relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-lg border border-white/10 bg-[#080706]" v-on="m.handlers" @wheel.prevent>
      <svg class="pointer-events-none absolute inset-0 size-full">
        <g :transform="`translate(${m.tx.value},${m.ty.value}) scale(${m.k.value})`">
          <path v-for="l in paths" :key="l.id" :d="l.d" fill="none" :stroke="l.color" stroke-opacity="0.7" stroke-width="2" vector-effect="non-scaling-stroke" />
          <rect v-for="b in rects" :key="b.id" :data-map-box="b.id" :data-tree-swamp="swampOf(b.id) ? '' : undefined" :x="b.x" :y="yOf(b)" :width="BOX_W" :height="EST_H" rx="20" :fill="`rgba(${rgbOf(b)},0.3)`" :stroke="swampOf(b.id) ? '#38bdf8' : `rgba(${rgbOf(b)},0.7)`" :stroke-width="swampOf(b.id) ? 3 : 1.5" vector-effect="non-scaling-stroke" :stroke-dasharray="folds.has(b.id) ? '4 3' : undefined" />
        </g>
      </svg>
      <span v-for="n in names" :key="n.id" data-map-name class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap text-[10px] text-white/90" :style="{ left: `${n.x}px`, top: `${n.y}px` }">{{ n.text }}<img v-if="n.icon" :src="n.icon" alt="" class="size-4" draggable="false" /></span>
      <!-- カードの層: 押す所が 27 か所ある箱なので層ごと押せなくする。木の座標のまま置いて、層に倍率を掛ける -->
      <div v-if="cards.length || chips.length" data-map-cards class="pointer-events-none absolute left-0 top-0 origin-top-left" :style="{ transform: `translate(${m.tx.value}px,${m.ty.value}px) scale(${m.k.value})` }">
        <TreeHandChip v-for="c in chips" :id="c.id" :key="c.id" :hand="c.hand" :split="c.split" :x="c.x" :y="c.y" :inv="1" off :room="CHIP_ROOM" />
        <template v-for="b in cards" :key="b.id">
          <TreeBox :box="b" :x="b.x" :y="yOf(b)" :removable="false" :picking="false" :selected="false" :back-label="backLabelOf(doc, b)" view-only :bands="bandsView(b.id)" :swamp="swampOf(b.id) ? Math.max(1, 1 / m.k.value) : 0" />
        </template>
      </div>
      <!-- 回す時: PC と同じ重ねる層 (1 人目の光・足跡・通った線・誰も来ない箱の暗さ・来た人数・回数・止まり)。線だけ画面の上の太さで描く (全体図の倍率は PC より小さい) -->
      <div v-if="props.walk || props.result" data-map-run-layer class="pointer-events-none absolute left-0 top-0 origin-top-left" :style="{ transform: `translate(${m.tx.value}px,${m.ty.value}px) scale(${m.k.value})` }">
        <TreeRunLayer :result="props.result ?? null" :walk="props.walk ?? null" :k="1 / m.k.value" :boxes="boxes" :pos-of="runPos" :edges="runEdges" :lines="[]" :paths="NO_PATHS" :box-h="EST_H" screen-lines @go="goTo" />
      </div>
      <TreeLaneTags :lanes="lanes" :ty="m.ty.value" :k="m.k.value" />
      <p class="pointer-events-none absolute bottom-1 right-2 rounded bg-black/75 px-1 text-[11px] text-amber-100/60">{{ tr("ツリーを作るのは PC で", "Build trees on a PC") }}</p>
    </div>
  </div>
</template>

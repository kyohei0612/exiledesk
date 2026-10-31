<!--
  PhoneViewMap.vue — シミュのスマホの見るだけの全体図 (S-94・S-94c、スイッチ phoneView。オーナー 11-01「この画面に拡大したらPCのあの例のMOD群のこういうの拡大したら表示してあげたらもういうことなさそうだな」)。
  質問の形の PhoneMap は 1 版残すので (usePhoneQuiz の組む動きと戻り先選びが入っている)、見るだけの図はここに分けた。整理の版で PhoneMap が消える。
  縮めた時は色の札、倍率 CARD_K から見えている箱だけ PC の箱 TreeBox (押せない層)。小さい箱を押すと窓を開かずその箱へ寄る (S-94c)。指の動きは use-map-touch.ts
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BOX_H, BOX_W, type TreeBox as Box } from "../../../services/simulator/tree/tree-model";
import { EST_H } from "../../../services/simulator/tree/tree-row-tops";
import { mergedAway } from "../../../services/simulator/tree/tree-merge-open";
import { stripFolds, stripHidden, toggleStripFold } from "../../../services/simulator/tree/tree-strip-fold";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import TreeBox from "../tree/TreeBox.vue";
import { backLabelOf, runText } from "../tree/tree-fail";
import { handIcon, OUT_LOOK } from "../tree/tree-names";
import { useTree } from "../tree/use-tree";
import { simOp } from "../../../web/track";
import { tr } from "../../../i18n/lang";
import { useMapTouch, type MapBounds } from "./use-map-touch";

const props = defineProps<{ /** 回した結果 (カードの箱に人数を添える) */ result?: TreeRunResult | null }>();
const t = useTree();
const doc = t.doc;
/** 名前と手の絵を出す倍率 (箱の幅 56px) */
const NAME_K = 0.18;
/** PC の箱に替える倍率 (箱の幅 142px、S-94c) */
const CARD_K = 0.45;
/** 箱へ寄る時の倍率 (幅 221px、MOD の字が約 9px) */
const NEAR_K = 0.7;
/** 一度に描くカードの上限 (1 枚 約 20ms の読み) */
const CARD_MAX = 12;
/** 押した所から箱までの近さ (小さい箱でも指で押せるよう、PhoneMap と同じ) */
const TAP_PX = 28;

const wrap = ref<HTMLElement | null>(null);
const folds = computed(() => stripFolds(doc.value));
const hidden = computed(() => stripHidden(doc.value, folds.value));
const lastToHead = computed(() => new Map([...folds.value.values()].map((f) => [f.last, f.head])));
/** 描く箱 (PC の木と同じ: 品質だけの箱・まとめた箱・畳んだ箱は描かない) */
const boxes = computed(() => Object.values(doc.value.boxes).filter((b) => b.out !== "pass" && !mergedAway(doc.value, b) && !hidden.value.has(b.id)));
const bounds = computed((): MapBounds => {
  const bs = boxes.value;
  if (!bs.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + BOX_W)) - x, h: Math.max(...bs.map((b) => b.y + EST_H)) - y };
});
/** 人が動かしたか (動かした後は、置き直しや窓の大きさで全体へ戻さない) */
let touched = false;
function tap(px: number, py: number): void {
  const wx = (px - m.tx.value) / m.k.value, wy = (py - m.ty.value) / m.k.value, reach = TAP_PX / m.k.value;
  let best: Box | null = null, bd = Infinity;
  for (const b of boxes.value) { const dd = Math.hypot(Math.max(0, b.x - wx, wx - b.x - BOX_W), Math.max(0, b.y - wy, wy - b.y - EST_H)); if (dd < bd) { bd = dd; best = b; } }
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
  m.glideTo(b.x + BOX_W / 2, b.y + EST_H / 2, Math.max(m.k.value, NEAR_K));
}
defineExpose({ goTo });
function refit(): void { if (!touched && wrap.value?.clientWidth) m.fit(bounds.value); }
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
    const to = mergedAway(d, b) ? d.boxes[b.back!] : b;
    if (!p || !to || hidden.value.has(b.id) || hidden.value.has(p.id)) return [];
    const x0 = p.x + BOX_W / 2, y0 = p.y + (p.out === "pass" ? 0 : cardIds.value.has(p.id) ? BOX_H : EST_H), x1 = to.x + BOX_W / 2, y1 = to.y;
    return [{ id: b.id, d: `M${x0},${y0} V${(y0 + y1) / 2} H${x1} V${y1}` }];
  });
});
const SHORT: Record<string, [string, string]> = { start: ["始め", "Start"], hit: ["当たり", "Hit"], junk: ["外れ", "Miss"], junkGone: ["外れ消", "Gone"], lost: ["消えた", "Lost"], any: ["打後", "After"], branch: ["分岐", "Split"] };
/** 見えている箱 (木の座標の範囲で見る)。送るたびに読むので、変わった時だけ一覧を替える */
const inView = computed(() => {
  const z = m.k.value, x0 = -m.tx.value / z, y0 = -m.ty.value / z, w = (wrap.value?.clientWidth ?? 0) / z, h = (wrap.value?.clientHeight ?? 0) / z;
  return boxes.value.filter((b) => b.x + BOX_W > x0 && b.x < x0 + w && b.y + EST_H > y0 && b.y < y0 + h);
});
/** カードにする箱 (真ん中に近い順に CARD_MAX まで) */
const cards = computed((): Box[] => {
  const z = m.k.value;
  if (z < CARD_K) return [];
  const cx = ((wrap.value?.clientWidth ?? 0) / 2 - m.tx.value) / z, cy = ((wrap.value?.clientHeight ?? 0) / 2 - m.ty.value) / z;
  return [...inView.value].sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, CARD_MAX);
});
/** 名前と手の絵 (カードの箱には出さない) */
const names = computed(() => (m.k.value < NAME_K ? [] : inView.value.filter((b) => !cardIds.value.has(b.id)).map((b) => {
  const s = SHORT[b.out], icon = b.hand ? handIcon(b.hand.currency) || null : null;
  return { id: b.id, x: (b.x + BOX_W / 2) * m.k.value + m.tx.value, y: (b.y + EST_H / 2) * m.k.value + m.ty.value, text: s ? tr(s[0], s[1]) : "", icon };
})));
/** 色の札 (カードの裏には出さない。カードの高さは札と違うのではみ出す) */
const rects = computed(() => boxes.value.filter((b) => !cardIds.value.has(b.id)));
const rgbOf = (b: Box): string => (b.done === "fail" ? "224,112,122" : b.done ? "242,210,122" : OUT_LOOK[b.out].c);
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
    <p class="text-[11px] text-sim-dim">{{ tr("全体図 · つまむと箱の中身 · 押すとその箱へ", "Map · pinch for box details · tap a box to go there") }}</p>
    <!-- 指はこの枠の中だけ全体図が受け取る (touch-action: none。枠の外はふつうに送れる) -->
    <div ref="wrap" data-phone-view-map class="relative min-h-0 flex-1 touch-none select-none overflow-hidden rounded-lg border border-white/10 bg-[#080706]" v-on="m.handlers" @wheel.prevent>
      <svg class="pointer-events-none absolute inset-0 size-full">
        <g :transform="`translate(${m.tx.value},${m.ty.value}) scale(${m.k.value})`">
          <path v-for="l in paths" :key="l.id" :d="l.d" fill="none" stroke="rgba(216,204,180,0.4)" stroke-width="2" vector-effect="non-scaling-stroke" />
          <rect v-for="b in rects" :key="b.id" :data-map-box="b.id" :x="b.x" :y="b.y" :width="BOX_W" :height="EST_H" rx="20" :fill="`rgba(${rgbOf(b)},0.3)`" :stroke="`rgba(${rgbOf(b)},0.7)`" stroke-width="1.5" vector-effect="non-scaling-stroke" :stroke-dasharray="folds.has(b.id) ? '4 3' : undefined" />
        </g>
      </svg>
      <span v-for="n in names" :key="n.id" data-map-name class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap text-[10px] text-white/90" :style="{ left: `${n.x}px`, top: `${n.y}px` }">{{ n.text }}<img v-if="n.icon" :src="n.icon" alt="" class="size-4" draggable="false" /></span>
      <!-- カードの層: 押す所が 27 か所ある箱なので層ごと押せなくする。木の座標のまま置いて、層に倍率を掛ける -->
      <div v-if="cards.length" data-map-cards class="pointer-events-none absolute left-0 top-0 origin-top-left" :style="{ transform: `translate(${m.tx.value}px,${m.ty.value}px) scale(${m.k.value})` }">
        <template v-for="b in cards" :key="b.id">
          <TreeBox :box="b" :x="b.x" :y="b.y" :removable="false" :picking="false" :selected="false" :back-label="backLabelOf(doc, b)" view-only />
          <p v-if="runText(props.result, b.id)" data-map-run class="absolute text-center text-[13px] font-bold text-amber-100 [text-shadow:0_1px_3px_#000]" :style="{ left: `${b.x}px`, top: `${b.y - 34}px`, width: `${BOX_W}px` }">{{ runText(props.result, b.id) }}</p>
        </template>
      </div>
      <p class="pointer-events-none absolute bottom-1 right-2 text-[11px] text-amber-100/60">{{ tr("ツリーを作るのは PC で", "Build trees on a PC") }}</p>
    </div>
  </div>
</template>

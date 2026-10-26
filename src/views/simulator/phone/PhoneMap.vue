<!--
  PhoneMap.vue — スマホ版の下に常に出すツリーの全体図 (2026-10-26 オーナー「スマホ版が死ぬほど使いづらい」の ①・④)。
  箱の置き場は PC と同じ TreeBox の x・y を縮めて描くだけ (形は PC の木と同じ)。線は親 → 結果の箱 (手の矢印)。戻りの線は今の質問の分だけ水色で。
  今の質問の箱が光る (① = その箱、② = 手の箱と結果の箱)。押すとその箱の質問へ (go)。
  ④ 戻り先を選んでいる時 (mapPick): 戻れる箱だけ明るく、押すとそこへ戻す。図は大きく開く。⤢ で大きさを切り替え
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BOX_H, BOX_W, boundsOf } from "../../../services/simulator/tree/tree-model";
import { backTargetsOf } from "../tree/tree-merge";
import { OUT_LOOK } from "../tree/tree-names";
import { mapPick, usePhoneQuiz } from "./use-phone-quiz";
import { tr } from "../../../i18n/lang";

const emit = defineEmits<{ go: [id: string] }>();
const q = usePhoneQuiz();
const wrap = ref<HTMLElement | null>(null);
const cw = ref(360);
/** 大きく開いている (⤢、戻り先を選ぶ間はいつも) */
const big = ref(false);
const tall = computed(() => big.value || !!mapPick.value);
const ch = computed(() => (tall.value ? Math.round(Math.min(window.innerHeight * 0.45, 420)) : 112));
let ro: ResizeObserver | null = null;
onMounted(() => { if (wrap.value) { ro = new ResizeObserver(() => { cw.value = wrap.value?.clientWidth ?? 360; }); ro.observe(wrap.value); } });
onBeforeUnmount(() => ro?.disconnect());

const PAD = 10;
/** 箱の画面の位置 (中心と描く大きさ)。小さくなりすぎないよう描く大きさだけ下限を持つ */
const view = computed(() => {
  const d = q.doc.value, bs = Object.values(d.boxes);
  if (!bs.length) return null;
  const bd = boundsOf(d);
  const s = Math.min((cw.value - PAD * 2) / Math.max(1, bd.w), (ch.value - PAD * 2) / Math.max(1, bd.h));
  const ox = (cw.value - bd.w * s) / 2 - bd.x * s, oy = (ch.value - bd.h * s) / 2 - bd.y * s;
  const w = Math.max(10, BOX_W * s), h = Math.max(7, BOX_H * s);
  const at = new Map(bs.map((b) => [b.id, { x: b.x * s + ox + (BOX_W * s) / 2, y: b.y * s + oy + (BOX_H * s) / 2 }]));
  return { at, w, h, boxes: bs };
});
/** 今の質問の箱 (光る) と、その結果の箱 */
const cur = computed(() => q.current.value?.id ?? null);
const curOuts = computed(() => (q.current.value?.kind === "outs" ? q.outsOf(q.current.value.id) : []));
/** 今の質問の結果の箱の戻り先 (水色の線)。戻り先を選んでいる間は、その結果の箱の今の戻り先だけ */
const backs = computed(() => {
  const d = q.doc.value, from = mapPick.value ? [mapPick.value.from] : curOuts.value;
  return from.flatMap((id) => (d.boxes[id]?.back ? backTargetsOf(d, id).slice(0, 1).map((to) => ({ from: id, to })) : []));
});
const pickable = computed(() => new Set(mapPick.value?.ids ?? []));
/** 箱の見た目 (光る・選べる・暗くする) */
function look(id: string): { fill: string; stroke: string; sw: number; op: number } {
  const b = q.doc.value.boxes[id]!, c = OUT_LOOK[b.out].c;
  if (mapPick.value) {
    const on = pickable.value.has(id), now = backs.value.some((x) => x.to === id);
    const from = id === mapPick.value.from;
    return { fill: `rgba(${c},${on || from ? 0.55 : 0.12})`, stroke: from ? "rgb(255,255,255)" : now ? "rgb(103,232,249)" : on ? "rgb(253,230,138)" : `rgba(${c},0.3)`, sw: from || now || on ? 2.5 : 1.5, op: on || now || from ? 1 : 0.45 };
  }
  const me = id === cur.value, out = curOuts.value.includes(id), back = backs.value.some((x) => x.to === id);
  return { fill: `rgba(${c},${me ? 0.85 : out ? 0.55 : 0.3})`, stroke: me ? "rgb(253,230,138)" : back ? "rgb(103,232,249)" : out ? `rgb(${c})` : `rgba(${c},0.55)`, sw: me || back || out ? 2.5 : 1.5, op: 1 };
}
/** 箱の短い名前 (図が大きく箱が 28px 以上の時だけ箱の中に出す) */
const SHORT: Record<string, [string, string]> = { start: ["始め", "Start"], hit: ["当たり", "Hit"], junk: ["外れ", "Miss"], junkGone: ["外れ消", "Gone"], lost: ["消えた", "Lost"], any: ["打後", "After"], pass: ["品質", "Qual"], branch: ["分岐", "Split"] };
const shortOf = (id: string): string => { const s = SHORT[q.doc.value.boxes[id]?.out ?? ""]; return s ? tr(s[0], s[1]) : ""; };
/** 線 (親 → 結果の箱) */
const lines = computed(() => {
  const v = view.value;
  if (!v) return [];
  return v.boxes.flatMap((b) => (b.parent && v.at.get(b.parent) ? [{ id: b.id, a: v.at.get(b.parent)!, b: v.at.get(b.id)! }] : []));
});
/** 押した所に一番近い箱 (小さい箱でも指で押せるよう、28px まで) */
function tap(e: MouseEvent): void {
  const v = view.value, el = wrap.value;
  if (!v || !el) return;
  const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  const pool = mapPick.value ? v.boxes.filter((b) => pickable.value.has(b.id)) : v.boxes;
  let best: string | null = null, bd = Infinity;
  for (const b of pool) { const p = v.at.get(b.id)!; const dd = Math.hypot(Math.max(0, Math.abs(p.x - px) - v.w / 2), Math.max(0, Math.abs(p.y - py) - v.h / 2)); if (dd < bd) { bd = dd; best = b.id; } }
  if (!best || bd > 28) return;
  const pk = mapPick.value;
  if (pk) { mapPick.value = null; q.setReturn(pk.from, best); return; }
  emit("go", best);
}
// 木を開き直した・箱が消えた時は選ぶのをやめる
watch(() => q.doc.value, (d) => { const pk = mapPick.value; if (pk && !d.boxes[pk.from]) mapPick.value = null; });
</script>

<template>
  <div data-phone-map class="flex min-w-0 flex-col gap-1">
    <div class="flex min-w-0 items-center gap-2 text-[11px]">
      <span v-if="mapPick" data-phone-map-pick class="min-w-0 flex-1 truncate font-bold text-amber-200">{{ tr("戻り先の箱を押す (明るい箱に戻れる)", "Tap the box to return to (bright boxes)") }}</span>
      <span v-else class="min-w-0 flex-1 truncate text-[#9a8a70]">{{ tr("全体図 · 押すとその箱へ", "Overview · tap a box to go there") }}</span>
      <button v-if="mapPick" type="button" data-phone-map-cancel class="g-btn sm shrink-0" @click="mapPick = null">{{ tr("やめる", "Cancel") }}</button>
      <button v-else type="button" data-phone-map-size class="g-btn sm shrink-0" :aria-pressed="big" :aria-label="tr('全体図の大きさ', 'Overview size')" @click="big = !big">{{ big ? "⤡" : "⤢" }}</button>
    </div>
    <div ref="wrap" data-phone-map-view class="relative w-full overflow-hidden rounded-lg border border-white/10 bg-[#080706]" :style="{ height: `${ch}px` }" @click="tap">
      <svg v-if="view" :width="cw" :height="ch" class="pointer-events-none absolute inset-0">
        <path v-for="l in lines" :key="`l-${l.id}`" :d="`M${l.a.x},${l.a.y + view.h / 2} V${(l.a.y + l.b.y) / 2} H${l.b.x} V${l.b.y - view.h / 2}`" fill="none" stroke="rgba(216,204,180,0.35)" stroke-width="2" />
        <path v-for="x in backs" :key="`b-${x.from}`" :d="`M${view.at.get(x.from)!.x},${view.at.get(x.from)!.y} L${view.at.get(x.to)!.x},${view.at.get(x.to)!.y}`" fill="none" stroke="rgba(103,232,249,0.8)" stroke-width="2" />
        <rect v-for="b in view.boxes" :key="b.id" :data-map-box="b.id" :x="view.at.get(b.id)!.x - view.w / 2" :y="view.at.get(b.id)!.y - view.h / 2" :width="view.w" :height="view.h" rx="3" v-bind="{ fill: look(b.id).fill, stroke: look(b.id).stroke, 'stroke-width': look(b.id).sw, opacity: look(b.id).op }" :class="b.id === cur && !mapPick ? 'phone-map-now' : ''" />
        <template v-if="view.w >= 28">
          <text v-for="b in view.boxes" :key="`t-${b.id}`" :x="view.at.get(b.id)!.x" :y="view.at.get(b.id)!.y + 3.5" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.9)" :opacity="look(b.id).op">{{ shortOf(b.id) }}</text>
        </template>
      </svg>
    </div>
  </div>
</template>

<style scoped>
/* 今の箱はゆっくり明るさが揺れる (チカチカさせない、2 秒) */
.phone-map-now { animation: phone-map-glow 2s ease-in-out infinite; }
@keyframes phone-map-glow { 50% { filter: drop-shadow(0 0 4px rgb(253 230 138)); } }
</style>

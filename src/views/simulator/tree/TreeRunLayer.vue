<!--
  TreeRunLayer.vue — 「100 人回す」の結果を木の上に重ねる層 (2026-10-22 オーナー「回すボタンもやろ？」「オーバーレイでいい、修正しやすい」)。
  組む画面 (箱・線・欄) には手を入れず、Vue Flow の zoom-pane の中に重ねる: 通った線は回数で太く明るく (実線だけ、点線・1px は使わない)、
  箱の右上に来た人数「n 人」、線の先に通った回数「n 回」、戻りの弧は箱の下に「↩ n 回」、誰も来ない箱は暗く、止まった箱に赤い札。
  数字は前の値から 0.3 秒で数え上げる (回している間に 2 人ごとに増える)。
  回す前の 1 人目が進む間は result が無く、今いる箱 (walk) を光らせるだけ (光は次の箱へ滑って動く)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { BOX_H, BOX_W, type TreeBox } from "../../../services/simulator/tree/tree-model";
import type { TreeRunResult } from "../../../services/simulator/tree/tree-run";
import type { MergeLine } from "./tree-merge";
import { tr } from "../../../i18n/lang";

interface Edge { id: string; stem: string; to: { id: string; d: string }[] }
const props = defineProps<{
  result: TreeRunResult | null; walk?: string | null; boxes: readonly TreeBox[]; posOf: (b: TreeBox) => { x: number; y: number };
  edges: readonly Edge[]; lines: readonly MergeLine[]; paths: ReadonlyMap<string, string>;
}>();
const emit = defineEmits<{ go: [id: string] }>();

const ON = { fwd: "#f3c26b", back: "#6fe0ee" } as const;

/** 数える物 (箱 = "b:<id>" の来た人数、線 = "e:<元>><先>" の回数、止まり = "s:<id>") */
const target = computed(() => {
  const r = props.result, t: Record<string, number> = {};
  if (!r) return t;
  for (const [id, b] of Object.entries(r.boxes)) if (b.reach) t[`b:${id}`] = b.reach;
  for (const [k, n] of Object.entries(r.edges)) t[`e:${k}`] = n;
  for (const [id, n] of Object.entries(r.stuckAt)) t[`s:${id}`] = n;
  return t;
});
// 数え上げ (前の値 → 今の値を 0.3 秒、ease-out)
const disp = ref<Record<string, number>>({});
let raf = 0;
watch(target, (to) => {
  cancelAnimationFrame(raf);
  const from = { ...disp.value }, t0 = performance.now(), MS = 300;
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0) / MS), e = 1 - (1 - k) ** 3, next: Record<string, number> = {};
    for (const key of Object.keys(to)) next[key] = (from[key] ?? 0) + (to[key]! - (from[key] ?? 0)) * e;
    disp.value = next;
    if (k < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}, { immediate: true });
onBeforeUnmount(() => cancelAnimationFrame(raf));
const v = (key: string): number => disp.value[key] ?? 0;
const int = (key: string): number => Math.round(v(key));

/** 一番多く通った線 (太さ・明るさの基準) */
const top = computed(() => Math.max(1, ...Object.values(props.result?.edges ?? {})));
// 回数に比例 (平方根だと多くの線が 8px 近くに揃って差が見えなかった、10-22 開発版の靴)
const width = (n: number): number => 2 + 6 * Math.min(1, n / top.value);
const alpha = (n: number): number => 0.3 + 0.7 * Math.min(1, n / top.value);

/** 1 人目が今いる箱の位置 */
const lit = computed(() => { const b = props.walk ? props.boxes.find((x) => x.id === props.walk) : null; return b ? props.posOf(b) : null; });
/** 進む線 (親 → 子)。親の幹は子へ行った回数の合計 */
const fwd = computed(() => !props.result ? [] : props.edges.flatMap((e) => {
  const kids = e.to.map((o) => ({ ...o, key: `e:${e.id}>${o.id}` }));
  return [{ key: `stem:${e.id}`, d: e.stem, n: kids.reduce((a, o) => a + v(o.key), 0) }, ...kids.map((o) => ({ key: o.key, d: o.d, n: v(o.key) }))];
}).filter((x) => x.n > 0.5));
/** 戻りの弧 (戻りの矢印の箱 → 行き先) */
const back = computed(() => props.lines.map((l) => ({ key: `e:${l.from}>${l.to}`, d: props.paths.get(l.id) ?? "", n: v(`e:${l.from}>${l.to}`) })).filter((x) => x.n > 0.5 && x.d));
/** 箱ごとの札 (来た人数・入ってきた回数・戻りの回数・止まり) */
const marks = computed(() => !props.result ? [] : props.boxes.map((b) => {
  const p = props.posOf(b), inKey = b.parent ? `e:${b.parent}>${b.id}` : null;
  const outBack = b.back ? Object.keys(target.value).filter((k) => k.startsWith(`e:${b.id}>`)).reduce((a, k) => a + int(k), 0) : 0;
  const st = props.result!.boxes[b.id];
  return { b, x: p.x, y: p.y, reach: int(`b:${b.id}`), inN: inKey ? int(inKey) : 0, outBack, stuck: int(`s:${b.id}`), costIn: st?.costIn ?? 0, remain: st?.remain ?? 0 };
}));
const div = (x: number): string => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
</script>

<template>
  <!-- 通った線 (箱の後ろ、組む画面の線の上に重ねる) -->
  <svg data-tree-run-lines class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style="z-index: -1">
    <path v-for="l in fwd" :key="l.key" :d="l.d" :stroke="ON.fwd" :stroke-opacity="alpha(l.n)" :stroke-width="width(l.n)" stroke-linecap="round" stroke-linejoin="round" fill="none" />
    <path v-for="l in back" :key="l.key" :d="l.d" :stroke="ON.back" :stroke-opacity="alpha(l.n)" :stroke-width="width(l.n)" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
  <!-- 1 人目が今いる箱 (光る枠。次の箱へ滑る) -->
  <div v-if="lit" data-tree-run-walk :data-box-id="walk" class="pointer-events-none absolute z-[9] rounded-xl border-[3px] border-amber-300 shadow-[0_0_18px_6px_rgba(243,194,107,0.75)] transition-[left,top] duration-150 ease-out"
    :style="{ left: `${lit.x - 4}px`, top: `${lit.y - 4}px`, width: `${BOX_W + 8}px`, height: `${BOX_H + 8}px` }" />
  <template v-for="m in marks" :key="m.b.id">
    <!-- 誰も来ない箱は暗く -->
    <div v-if="!m.reach" data-tree-run-veil class="pointer-events-none absolute z-[8] rounded-xl bg-black/55" :style="{ left: `${m.x}px`, top: `${m.y}px`, width: `${BOX_W}px`, height: `${BOX_H}px` }" />
    <span v-if="m.reach" data-tree-run-reach :data-box-id="m.b.id" class="pointer-events-auto absolute z-20 -translate-y-1/2 translate-x-[-100%] whitespace-nowrap rounded-full border border-amber-300/50 bg-[#1d160c]/95 px-2 text-[11px] tabular-nums text-amber-100 shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      :style="{ left: `${m.x + BOX_W - 6}px`, top: `${m.y}px` }"
      :title="tr(`来た人 ${m.reach} 人 · 着くまで平均 ${div(m.costIn)} 神 · ここから完成まで平均 ${div(m.remain)} 神`, `${m.reach} runs reached · avg ${div(m.costIn)} div to get here · avg ${div(m.remain)} div from here to done`)">{{ tr(`${m.reach} 人`, `${m.reach} runs`) }}</span>
    <span v-if="m.inN" data-tree-run-in class="pointer-events-none absolute z-20 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/70 px-1.5 text-[11px] tabular-nums text-amber-200/90"
      :style="{ left: `${m.x + 6}px`, top: `${m.y}px` }">{{ tr(`${m.inN} 回`, `${m.inN}×`) }}</span>
    <span v-if="m.outBack" data-tree-run-back class="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-1.5 text-[11px] tabular-nums text-cyan-200/90"
      :style="{ left: `${m.x + BOX_W / 2}px`, top: `${m.y + BOX_H + 4}px` }">↩ {{ tr(`${m.outBack} 回`, `${m.outBack}×`) }}</span>
    <button v-if="m.stuck" type="button" data-tree-run-stuck class="nodrag nopan pointer-events-auto absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-rose-400/70 bg-rose-700/90 px-2 text-[11px] font-bold tabular-nums text-white shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
      :style="{ left: `${m.x + BOX_W / 2}px`, top: `${m.y + BOX_H - 10}px` }" :title="result?.stuckWhy[m.b.id]?.reason" @click="emit('go', m.b.id)">{{ tr(`止まり ${m.stuck} 人`, `${m.stuck} stuck`) }}</button>
  </template>
</template>

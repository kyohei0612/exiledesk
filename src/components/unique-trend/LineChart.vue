<!--
  LineChart.vue — 価格履歴の折れ線 (ユニーク装備価格推移の詳細用、2026-09-26)

  オーナー指示「グラフかなんかで分かりやすくトレースして欲しい」。依存は増やさず素の SVG。
  ホバーはマウス座標を使わず、縦に割った透明の帯ごとに mouseenter で拾う
  (App.vue の zoom で座標がずれる問題を避けるため)。ツールチップは点の位置を % で置く。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { HistoryPoint } from "../../api/poe2scout";

const props = defineProps<{ points: HistoryPoint[]; format: (exalted: number) => string }>();

const W = 1000;
const H = 200;
const PAD = 8;
/** ホバー帯の最大本数 (点が多い時は間引いて一番近い点を出す) */
const MAX_BANDS = 240;

const hover = ref<number | null>(null);

const range = computed(() => {
  const p = props.points;
  if (p.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const x of p) {
    min = Math.min(min, x.price);
    max = Math.max(max, x.price);
  }
  const t0 = p[0].t;
  const t1 = p[p.length - 1].t;
  return { min, max, span: max - min || max || 1, t0, tspan: t1 - t0 || 1 };
});

function xOf(p: HistoryPoint): number {
  const r = range.value!;
  return ((p.t - r.t0) / r.tspan) * W;
}
function yOf(p: HistoryPoint): number {
  const r = range.value!;
  return H - PAD - ((p.price - r.min) / r.span) * (H - PAD * 2);
}

const line = computed(() => (range.value ? props.points.map((p) => `${xOf(p).toFixed(1)},${yOf(p).toFixed(1)}`).join(" ") : ""));
const area = computed(() => (line.value ? `0,${H} ${line.value} ${W},${H}` : ""));
const up = computed(() => {
  const p = props.points;
  return p.length >= 2 && p[p.length - 1].price >= p[0].price;
});
const color = computed(() => (up.value ? "var(--exile-color-signal-success)" : "var(--exile-color-signal-error)"));

/** ホバー帯: 横幅を等分し、帯の中心に一番近い点の番号を持たせる */
const bands = computed(() => {
  const p = props.points;
  if (!range.value) return [];
  const n = Math.min(MAX_BANDS, p.length);
  const out: { x: number; w: number; idx: number }[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const cx = ((i + 0.5) / n) * W;
    while (j < p.length - 1 && Math.abs(xOf(p[j + 1]) - cx) <= Math.abs(xOf(p[j]) - cx)) j++;
    out.push({ x: (i / n) * W, w: W / n, idx: j });
  }
  return out;
});

const hoverPt = computed(() => (hover.value != null ? props.points[hover.value] ?? null : null));
const hoverPos = computed(() => {
  const p = hoverPt.value;
  if (!p || !range.value) return null;
  return { left: (xOf(p) / W) * 100, top: (yOf(p) / H) * 100 };
});

function fmtDate(t: number, withTime = true): string {
  return new Date(t).toLocaleString("ja-JP", withTime ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } : { month: "numeric", day: "numeric" });
}
</script>

<template>
  <div v-if="range" class="select-none">
    <div class="flex">
      <!-- 縦軸 (上 = 最高 / 下 = 最安) -->
      <div class="w-24 shrink-0 flex flex-col justify-between text-[11px] text-right pr-2 tabular-nums text-[var(--exile-color-text-tertiary)]" :style="{ height: `${H}px` }">
        <span>{{ format(range.max) }}</span>
        <span>{{ format(range.min) }}</span>
      </div>
      <div class="relative flex-1" :style="{ height: `${H}px` }" @mouseleave="hover = null">
        <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="absolute inset-0 w-full h-full overflow-visible">
          <line v-for="g in 3" :key="g" x1="0" :x2="W" :y1="(H / 4) * g" :y2="(H / 4) * g" stroke="var(--exile-color-border-subtle)" stroke-dasharray="4 6" vector-effect="non-scaling-stroke" />
          <polygon :points="area" :fill="color" fill-opacity="0.08" />
          <polyline :points="line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          <line
            v-if="hoverPos"
            :x1="(hoverPos.left / 100) * W"
            :x2="(hoverPos.left / 100) * W"
            y1="0"
            :y2="H"
            stroke="var(--exile-color-text-tertiary)"
            vector-effect="non-scaling-stroke"
          />
          <rect v-for="b in bands" :key="b.x" :x="b.x" y="0" :width="b.w" :height="H" fill="transparent" @mouseenter="hover = b.idx" />
        </svg>
        <template v-if="hoverPos && hoverPt">
          <span
            class="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none border-2 border-[var(--exile-color-bg-canvas)]"
            :style="{ left: `${hoverPos.left}%`, top: `${hoverPos.top}%`, background: color }"
          />
          <div
            class="absolute -top-2 -translate-y-full pointer-events-none px-2 py-1 rounded text-xs whitespace-nowrap bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-subtle)] shadow"
            :class="hoverPos.left > 70 ? '-translate-x-full' : hoverPos.left < 30 ? '' : '-translate-x-1/2'"
            :style="{ left: `${hoverPos.left}%` }"
          >
            <span class="text-[var(--exile-color-text-secondary)]">{{ fmtDate(hoverPt.t) }}</span>
            <span class="ml-2 tabular-nums text-[var(--exile-color-accent-focus)]">{{ format(hoverPt.price) }}</span>
            <span v-if="hoverPt.qty" class="ml-2 text-[var(--exile-color-text-tertiary)]">出品 {{ hoverPt.qty }}</span>
          </div>
        </template>
      </div>
    </div>
    <div class="flex justify-between pl-24 mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
      <span>{{ fmtDate(points[0].t, false) }}</span>
      <span>{{ fmtDate(points[points.length - 1].t, false) }}</span>
    </div>
  </div>
  <div v-else class="py-10 text-center text-sm text-[var(--exile-color-text-tertiary)]">履歴がまだありません</div>
</template>

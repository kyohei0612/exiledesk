<!--
  VideoArmour.vue — 動画用の「アーマーのグラフ」(2026-09-30、POE2Tube 要望 ㉒-B2)

  URL: ?video=1&layout=clip&view=armour&ar=500,3000[&labels=アクトの胴,エンドの胴][&max=2000][&hit=300]
  横軸 = 一撃の大きさ、縦軸 = 軽減率。軽減率 = アーマー ÷ (アーマー + 10 × 一撃)、上限 90% (PoB と同じ、既定は物理だけ)。
    - 目印: 各アーマーの「一撃がアーマーの 1/10 → 50%」の点と、上限 90% の線
    - &hit=N: その一撃の縦線と、各アーマーの軽減率の数字
    - &play=1: 線が左から伸びる (2 秒)。&hl=0: 数字を出さない
  撮影の準備の目印: 見出しの「アーマーの軽減率」の文字。下 15% は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import { armourReduction, DEF } from "../../services/craft-stage/defence";
import { easeOut, useAnim } from "./use-anim";

const props = defineProps<{ ar: number[]; labels: string[]; max: number | null; hit: number | null }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const COLORS = ["#f2c14e", "#6fc3ff", "#ff7a45", "#9be08a"];
const W = 1060;
const H = 440;
const maxHit = computed(() => props.max ?? Math.max(100, Math.max(...props.ar) / 10 * 4));
const x = (h: number) => (h / maxHit.value) * W;
const y = (pct: number) => H - (pct / 100) * H;
const anim = useAnim(2000);
const reach = computed(() => (anim.play ? easeOut(anim.t.value) : 1));
const lines = computed(() =>
  props.ar.map((a, i) => {
    const pts: string[] = [];
    for (let k = 1; k <= 200; k++) {
      const h = (maxHit.value * k) / 200;
      if (k / 200 > reach.value) break;
      pts.push(`${x(h).toFixed(1)},${y(armourReduction(a, h)).toFixed(1)}`);
    }
    return { a, label: props.labels[i] ?? `アーマー ${a}`, color: COLORS[i % COLORS.length]!, d: pts.join(" "), half: a / DEF.constants.armourRatio };
  }),
);
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxHit.value * f)));
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-5 text-white">
    <div class="mb-2 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">アーマーの軽減率</p>
      <div class="flex gap-5 text-[20px]">
        <span v-for="l in lines" :key="l.a" class="flex items-center gap-2"><i class="inline-block h-1.5 w-7 rounded" :style="{ background: l.color }" />{{ l.label }} <b class="tabular-nums">{{ l.a }}</b></span>
      </div>
    </div>
    <svg :viewBox="`-70 -10 ${W + 110} ${H + 70}`" class="h-[520px] w-full">
      <!-- 目盛り -->
      <g class="text-white/40" fill="currentColor" font-size="18">
        <template v-for="v in [0, 25, 50, 75, 90]" :key="v">
          <line :x1="0" :x2="W" :y1="y(v)" :y2="y(v)" :stroke="v === 90 ? '#ff8a8a' : 'rgba(255,255,255,0.12)'" :stroke-dasharray="v === 90 ? '8 6' : ''" />
          <text x="-12" :y="y(v) + 6" text-anchor="end">{{ v }}%</text>
        </template>
        <text :x="W - 4" :y="y(90) - 8" text-anchor="end" fill="#ff9a9a" font-size="18">上限 {{ DEF.constants.armourCap }}%</text>
        <text v-for="t in ticks" :key="t" :x="x(t)" :y="H + 28" text-anchor="middle">{{ t }}</text>
        <text :x="W / 2" :y="H + 58" text-anchor="middle" font-size="20" fill="rgba(255,255,255,0.7)">一撃の大きさ (物理)</text>
      </g>
      <line x1="0" :x2="W" :y1="H" :y2="H" stroke="rgba(255,255,255,0.4)" />
      <line x1="0" x2="0" y1="0" :y2="H" stroke="rgba(255,255,255,0.4)" />
      <!-- 線 -->
      <polyline v-for="l in lines" :key="'l' + l.a" :points="l.d" fill="none" :stroke="l.color" stroke-width="5" stroke-linejoin="round" />
      <!-- 50% の点 (一撃 = アーマーの 1/10) -->
      <template v-for="l in lines" :key="'h' + l.a">
        <g v-if="l.half <= maxHit && x(l.half) / W <= reach">
          <circle :cx="x(l.half)" :cy="y(50)" r="8" :fill="l.color" stroke="#000" stroke-width="2" />
          <text v-if="hl" :x="x(l.half) + 12" :y="y(50) - 12" :fill="l.color" font-size="20" font-weight="bold">一撃 {{ Math.round(l.half) }} で 50%</text>
        </g>
      </template>
      <!-- 指定の一撃 -->
      <g v-if="hit != null && hit <= maxHit">
        <line :x1="x(hit)" :x2="x(hit)" y1="0" :y2="H" stroke="#fff" stroke-width="2" stroke-dasharray="6 5" />
        <text :x="x(hit) + 8" :y="H - 10" font-size="18" fill="#fff">一撃 {{ hit }}</text>
        <template v-for="l in lines" :key="'p' + l.a">
          <g v-if="x(hit) / W <= reach">
            <circle :cx="x(hit)" :cy="y(armourReduction(l.a, hit))" r="7" fill="#fff" :stroke="l.color" stroke-width="3" />
            <text v-if="hl" :x="x(hit) - 12" :y="y(armourReduction(l.a, hit)) + 7" text-anchor="end" font-size="22" font-weight="bold" :fill="l.color">{{ armourReduction(l.a, hit).toFixed(0) }}%</text>
          </g>
        </template>
      </g>
    </svg>
  </div>
</template>

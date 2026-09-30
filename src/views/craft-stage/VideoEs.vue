<!--
  VideoEs.vue — 動画用の「ES とライフ」(2026-09-30、POE2Tube 要望 ㉒-B4)

  URL: ?video=1&layout=clip&view=es&life=1000&es=600&dmg=250[&hits=0.8,1.6,2.4 (既定。満タンを少し見せてから)][&kind=phys|chaos|bleed][&until=12]
  時間の横軸でダメージを受けて ES → ライフの順に減り、最後に ES が減ってから 4 秒後に最大の 12.5% / 秒で戻る (ゲームの説明文)。
    - kind=chaos: 混沌は ES を 2 倍削る。kind=bleed: 出血・毒は ES を素通りしてライフへ (ES は減らないので戻りも始まらない)
    - ライフは戻さない (自然回復は入れない)
    - &play=1: 時間が左から進む (until 秒を 4 秒で)。&hl=0: 数字を出さない
  撮影の準備の目印: 見出しの「ES とライフ」の文字。下 15% は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import { DEF, esTimeline } from "../../services/craft-stage/defence";
import { useAnim } from "./use-anim";

const props = defineProps<{ life: number; es: number; dmg: number; hits: number[]; kind: "phys" | "chaos" | "bleed"; until: number }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const KIND = { phys: { ja: "普通の一撃", color: "#e8e0d0" }, chaos: { ja: "混沌の一撃 (ES を 2 倍削る)", color: "#c77dff" }, bleed: { ja: "出血・毒 (ES を素通り)", color: "#ff5a5a" } } as const;
const pts = computed(() => esTimeline(props.life, props.es, props.dmg, props.hits, props.kind, props.until));
const W = 1080;
const H = 380;
const top = computed(() => props.life + props.es);
const x = (t: number) => (t / props.until) * W;
const y = (v: number) => H - (v / top.value) * H;
const anim = useAnim(4000);
const now = computed(() => anim.t.value * props.until);
const shown = computed(() => pts.value.filter((p) => p.t <= now.value + 1e-9));
const cur = computed(() => shown.value[shown.value.length - 1] ?? pts.value[0]!);
/** 積み上げ: 下がライフ、上に ES */
const area = (key: "life" | "es") => {
  const s = shown.value;
  if (!s.length) return "";
  const upper = s.map((p) => `${x(p.t).toFixed(1)},${y(key === "life" ? p.life : p.life + p.es).toFixed(1)}`);
  const lower = key === "life" ? [`${x(s[s.length - 1]!.t).toFixed(1)},${H}`, `0,${H}`] : [...s].reverse().map((p) => `${x(p.t).toFixed(1)},${y(p.life).toFixed(1)}`);
  return [...upper, ...lower].join(" ");
};
/** 戻り始め = 最後に ES が減った時刻 + 4 秒 (ES が 0 の時に当たっても ES は減らないので、遅れは延びない) */
const rechargeAt = computed(() => {
  const p = pts.value;
  let last = -1;
  for (let i = 1; i < p.length; i++) if (p[i]!.es < p[i - 1]!.es - 1e-9) last = p[i]!.t;
  if (p[0] && p[0].es < props.es) last = Math.max(last, 0);
  return last < 0 ? null : last + DEF.constants.esDelay;
});
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-5 text-white">
    <div class="mb-2 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">ES とライフ</p>
      <p class="text-[20px]" :style="{ color: KIND[kind].color }">{{ KIND[kind].ja }} <b v-if="hl">{{ dmg }}</b> × {{ hits.length }} 回</p>
    </div>
    <div class="mb-2 flex gap-8 text-[24px] font-bold tabular-nums">
      <span class="text-sky-300">ES {{ Math.round(cur.es) }} / {{ es }}</span>
      <span class="text-red-400">ライフ {{ Math.round(cur.life) }} / {{ life }}</span>
    </div>
    <svg :viewBox="`-20 -10 ${W + 40} ${H + 60}`" class="h-[470px] w-full">
      <polygon :points="area('life')" fill="#b83232" opacity="0.85" />
      <polygon :points="area('es')" fill="#3d8bd4" opacity="0.85" />
      <line x1="0" :x2="W" :y1="H" :y2="H" stroke="rgba(255,255,255,0.4)" />
      <!-- 当たった時刻 -->
      <g v-for="h in hits" :key="h">
        <line v-if="h <= now" :x1="x(h)" :x2="x(h)" y1="0" :y2="H" :stroke="KIND[kind].color" stroke-width="2" stroke-dasharray="5 5" opacity="0.8" />
      </g>
      <!-- 戻り始め (最後に ES が減ってから 4 秒) -->
      <g v-if="rechargeAt != null && rechargeAt <= until && now >= rechargeAt">
        <line :x1="x(rechargeAt)" :x2="x(rechargeAt)" y1="0" :y2="H" stroke="#7fd3ff" stroke-width="2" />
        <text :x="x(rechargeAt) + 8" y="24" fill="#9fdcff" font-size="20" font-weight="bold">最後に減ってから {{ DEF.constants.esDelay }} 秒 → 毎秒 {{ DEF.constants.esRatePct }}% 戻る</text>
      </g>
      <text v-if="kind === 'bleed'" :x="W - 8" y="24" text-anchor="end" fill="#ff9a9a" font-size="20" font-weight="bold">ES は減らない → ライフだけ減る</text>
      <g fill="rgba(255,255,255,0.5)" font-size="18">
        <text v-for="t in Math.floor(until) + 1" :key="t" :x="x(t - 1)" :y="H + 26" text-anchor="middle">{{ t - 1 }}</text>
        <text :x="W / 2" :y="H + 52" text-anchor="middle">秒</text>
      </g>
      <line v-if="anim.play" :x1="x(now)" :x2="x(now)" y1="0" :y2="H" stroke="#fff" stroke-width="2" opacity="0.6" />
    </svg>
  </div>
</template>

<!--
  VideoEvasion.vue — 動画用の「回避と受け流し」(2026-09-30、POE2Tube 要望 ㉒-B3)

  URL: ?video=1&layout=clip&view=evasion&ev=1500[&deflect=800][&lvl=敵のレベル | &acc=命中力][&n=10][&red=0]
  敵の命中力と回避力から当たる率 (PoB と同じ式、公式 0.3.1)。攻撃を n 回並べて 避ける / 受け流す (40% 減) / 当たる を見せる。
    - 並びは確率の通りの回数を散らした「例」(回避は確率。エントロピー = 周期で当たる、はゲームのデータで確かめられない、要望 ㉒ A-4)
    - 下の段は赤い技 (回避できない、受け流しは効く)。&red=0 で出さない
    - &play=1: 攻撃が 1 つずつ来る (0.25 秒ずつ)。&hl=0: 率の数字を出さない
  撮影の準備の目印: 見出しの「回避と受け流し」の文字。下 15% は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import { attackRow, DEF, deflectChance, evadeChance } from "../../services/craft-stage/defence";
import { seg, useAnim } from "./use-anim";

const props = defineProps<{ ev: number; deflect: number; acc: number; lvl: number | null; n: number; red: boolean }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const evPct = computed(() => evadeChance(props.ev, props.acc));
const dfPct = computed(() => deflectChance(props.deflect, props.acc));
const rows = computed(() => [
  { label: "普通の攻撃", row: attackRow(props.n, evPct.value, dfPct.value, false) },
  ...(props.red ? [{ label: "赤い技", row: attackRow(props.n, evPct.value, dfPct.value, true) }] : []),
]);
const anim = useAnim(props.n * 250 + 600);
const seen = (i: number) => (anim.play ? seg(anim.t.value, i / (props.n + 2), (i + 1) / (props.n + 2)) : 1);
const LOOK = {
  evade: { ja: "避けた", cls: "border-emerald-300/70 bg-emerald-500/25 text-emerald-200" },
  deflect: { ja: `−${DEF.constants.deflectPct}%`, cls: "border-amber-300/70 bg-amber-500/25 text-amber-100" },
  hit: { ja: "当たる", cls: "border-rose-300/70 bg-rose-600/35 text-rose-100" },
} as const;
const count = (row: string[], k: string) => row.filter((x) => x === k).length;
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-5 text-white">
    <div class="mb-4 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">回避と受け流し</p>
      <p class="text-[18px] text-white/60">敵<template v-if="lvl"> Lv{{ lvl }}</template> の命中力 <b class="text-[22px] text-white">{{ acc }}</b></p>
    </div>
    <div class="mb-5 grid grid-cols-2 gap-6">
      <div class="rounded-2xl border border-emerald-300/30 bg-black/55 px-6 py-3">
        <p class="text-[20px] text-white/70">回避力 <b class="text-white">{{ ev }}</b></p>
        <p class="text-[40px] font-bold text-emerald-300">回避率 <span v-if="hl">{{ evPct }}%</span><span v-else>?</span></p>
        <p class="text-[16px] text-white/50">当たる率 = 1 − 0.95 × 回避力 ÷ (回避力 + 4 × 命中力)</p>
      </div>
      <div class="rounded-2xl border border-amber-300/30 bg-black/55 px-6 py-3">
        <p class="text-[20px] text-white/70">受け流し力 <b class="text-white">{{ deflect }}</b></p>
        <p class="text-[40px] font-bold text-amber-200">受け流す率 <span v-if="hl">{{ dfPct }}%</span><span v-else>?</span></p>
        <p class="text-[16px] text-white/50">受け流すとダメージの {{ DEF.constants.deflectPct }}% を防ぐ (当たった攻撃のうち)</p>
      </div>
    </div>
    <div v-for="r in rows" :key="r.label" class="mb-4">
      <p class="mb-2 text-[22px] font-bold" :class="r.label === '赤い技' ? 'text-red-400' : 'text-white/85'">
        {{ r.label }} {{ n }} 回<span v-if="r.label === '赤い技'" class="ml-3 text-[18px] font-normal text-white/60">回避できない・受け流しは効く</span>
        <span v-if="hl" class="ml-4 text-[18px] font-normal text-white/60">避けた {{ count(r.row, "evade") }} / 受け流した {{ count(r.row, "deflect") }} / 当たる {{ count(r.row, "hit") }}</span>
      </p>
      <div class="grid gap-2" :style="{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }">
        <div
          v-for="(a, i) in r.row"
          :key="i"
          class="grid h-[64px] place-items-center rounded-xl border-2 text-[20px] font-bold transition-all"
          :class="[LOOK[a].cls, r.label === '赤い技' ? 'shadow-[0_0_14px_rgba(255,60,60,0.45)]' : '']"
          :style="{ opacity: seen(i), transform: `translateY(${(1 - seen(i)) * -20}px)` }"
        >{{ LOOK[a].ja }}</div>
      </div>
    </div>
    <p class="text-[15px] text-white/45">並びは確率の通りの回数を並べた例</p>
  </div>
</template>

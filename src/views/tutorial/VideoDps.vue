<!--
  VideoDps.vue — 動画用の DPS の内訳 (2026-09-29、POE2Tube 要望 ⑰-5)

  URL: ?video=1&layout=clip&view=dps&pob=<結果 JSON の pob>&step=N[&play=1][&hl=0]
  1 つの手の DPS を 2 本の積み上げの棒で:
    - 何で増えたか: 素のベース (MOD もルーンも無し) / MOD で増えた分 / ルーンで増えた分。同じキャラ・同じスキルで PoB を 3 回回した値 (pob.steps[N].layers)
    - 種類: 物理 / 火 / 冷気 / 雷 / 混沌 (PoB の武器の 1 発の種類ごとの平均の割合で DPS を分けた物、pob.steps[N].breakdown)
    - &play=1: 左から順に伸びる (2.4 秒)。&hl=0: 数字を出さない
  撮影の準備の目印: 見出しの「DPS の内訳」の文字。下 15% (612px より下) は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { PobBlock } from "../../services/craft-stage/stage-pob";
import { dpsText } from "../../services/craft-stage/stage-pob";
import { skillIcon } from "../../services/craft-stage/skill-art";
import { easeOut, seg, useAnim } from "./use-anim";

const props = defineProps<{ pob: PobBlock; step: number }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const s = computed(() => props.pob.steps?.[Math.min(props.step, (props.pob.steps?.length ?? 1) - 1)] ?? null);
const anim = useAnim(2400);
const total = computed(() => s.value?.dps ?? 0);
/** 何で増えたか */
const layers = computed(() => {
  const l = s.value?.layers;
  if (!l) return [];
  return [
    { label: "素のベース", v: l.base, color: "#9a8f80" },
    { label: "MOD で増えた分", v: Math.max(0, l.mods - l.base), color: "#8888ff" },
    { label: "ルーンで増えた分", v: Math.max(0, l.full - l.mods), color: "#8fa8ff" },
  ].filter((x) => x.v > 0.05);
});
const TYPES = [
  { key: "physical", label: "物理", color: "#c8c8c8" },
  { key: "fire", label: "火", color: "#ff7a45" },
  { key: "cold", label: "冷気", color: "#6fc3ff" },
  { key: "lightning", label: "雷", color: "#ffe066" },
  { key: "chaos", label: "混沌", color: "#c77dff" },
] as const;
const types = computed(() => TYPES.map((t) => ({ ...t, v: s.value?.breakdown?.[t.key] ?? 0 })).filter((x) => x.v > 0.05));
/** 棒の i 番目の区切りの伸び (順に伸びる) */
function part(i: number, n: number, row: number): number {
  if (!anim.play) return 1;
  const a = row * 0.45 + (i / n) * 0.4;
  return easeOut(seg(anim.t.value, a, a + 0.4 / n + 0.05));
}
const icon = computed(() => skillIcon(props.pob.character.skill));
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-6 text-white">
    <div class="mb-4 flex items-end justify-between">
      <div class="flex items-center gap-4">
        <img v-if="icon" :src="icon" alt="" class="h-16 w-16 rounded-lg border border-white/20 bg-black/60 object-contain" />
        <div>
          <p class="text-[40px] font-bold leading-tight text-amber-100">DPS の内訳</p>
          <p class="text-[18px] text-white/60">{{ pob.character.skill_ja ?? pob.character.skill }} Lv{{ pob.character.gem_level }} · {{ pob.config_ja }}</p>
        </div>
      </div>
      <p v-if="hl" class="text-[48px] font-bold tabular-nums text-amber-100">{{ dpsText(total) }}</p>
    </div>
    <div v-for="(row, r) in [{ title: '何で増えたか', list: layers }, { title: '種類', list: types }]" :key="r" class="mb-8">
      <p class="mb-2 text-[22px] font-bold text-white/80">{{ row.title }}</p>
      <div v-if="row.list.length" class="flex h-16 overflow-hidden rounded-xl border border-white/15 bg-black/50">
        <div
          v-for="(x, i) in row.list"
          :key="x.label"
          class="grid place-items-center overflow-hidden whitespace-nowrap text-[18px] font-bold text-black/80"
          :style="{ width: `${total ? (x.v / total) * 100 * part(i, row.list.length, r) : 0}%`, background: x.color }"
        >
          <span v-if="hl && part(i, row.list.length, r) >= 1 && x.v / total > 0.08">{{ dpsText(x.v) }}</span>
        </div>
      </div>
      <p v-else class="text-[18px] text-white/40">この手には無い (武器でない / PoB で計算していない)</p>
      <div class="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[18px]">
        <span v-for="x in row.list" :key="x.label" class="inline-flex items-center gap-2"><span class="h-4 w-4 rounded" :style="{ background: x.color }" />{{ x.label }}<b v-if="hl" class="tabular-nums">{{ dpsText(x.v) }}</b></span>
      </div>
    </div>
  </div>
</template>

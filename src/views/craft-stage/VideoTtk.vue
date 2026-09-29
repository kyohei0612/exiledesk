<!--
  VideoTtk.vue — 動画用の「倒すまでの時間」(2026-09-29、POE2Tube 要望 ⑰-15、火力の回の主役)

  URL: ?video=1&layout=clip&view=ttk&a_pob=<結果 JSON の pob>&a_step=N&a_label=白[&b_pob=…&b_step=M&b_label=レア][&play=1][&hl=0]
  敵の人形 (ライフの棒) を今の武器で殴り続けて、ライフが 0 になるまでの秒数。DPS の数字より初心者に伝わる。
    - 敵のライフ = PoB の表 (pob.enemy: Data/Misc.lua の monsterLifeTable[敵のレベル]、普通の敵)。DPS = その手の PoB の DPS。秒数 = ライフ ÷ DPS
    - 2 本並べると左右の人形が同時に削れる競争 (「白 4.2 秒 → 黄 2.1 秒」)。人形からダメージの数字 (1 発の平均) が飛ぶ
    - &play=1: 実際の秒数で削る (長い方が 4 秒を超える時は両方を同じ割合で縮めて 4 秒に。比は変えない)。止め絵は削り切った後
    - &hl=0: 秒数を出さない (「何秒で倒せると思う？」の質問の行)
  撮影の準備の目印: 見出しの「倒すまでの時間」の文字。下 15% (612px より下) は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { PobBlock } from "../../services/craft-stage/stage-pob";
import { dpsText } from "../../services/craft-stage/stage-pob";
import { useAnim } from "./use-anim";

const props = defineProps<{ a: PobBlock; aStep: number; aLabel: string; b: PobBlock | null; bStep: number; bLabel: string }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const at = (p: PobBlock, step: number) => p.steps?.[Math.min(step, (p.steps?.length ?? 1) - 1)] ?? null;
const sides = computed(() =>
  [
    { p: props.a, step: props.aStep, label: props.aLabel },
    ...(props.b ? [{ p: props.b, step: props.bStep, label: props.bLabel }] : []),
  ].map((x) => {
    const s = at(x.p, x.step);
    const life = x.p.enemy?.life ?? 0;
    const dps = s?.dps ?? 0;
    return { label: x.label, life, dps, hit: s?.hit ?? 0, aps: s?.aps ?? 0, secs: dps > 0 ? life / dps : Infinity, enemy: x.p.enemy };
  }),
);
/** 実時間で削る (長い方が 4 秒を超える時は同じ割合で縮める) */
const longest = computed(() => Math.max(...sides.value.map((s) => (Number.isFinite(s.secs) ? s.secs : 0)), 0.1));
const squeeze = computed(() => Math.min(1, 4 / longest.value));
const TAIL = 900;
const anim = useAnim(Math.round(Math.min(4, longest.value) * 1000) + TAIL, { revealAt: 0.9 });
/** 経った秒数 (実際の秒数の単位。縮めた分を戻す) */
const elapsed = computed(() => (anim.t.value * (Math.min(4, longest.value) * 1000 + TAIL)) / 1000 / squeeze.value);
const lifeLeft = (s: { life: number; dps: number }): number => Math.max(0, s.life - s.dps * elapsed.value);
/** 飛んでいるダメージの数字 (直近の 3 発) */
function floats(s: { aps: number; hit: number; secs: number }): Array<{ n: number; x: number }> {
  if (!anim.playing.value || !s.aps) return [];
  const hits = Math.floor(Math.min(elapsed.value, s.secs) * s.aps);
  return [hits - 2, hits - 1, hits].filter((n) => n > 0).map((n) => ({ n, x: ((n * 37) % 60) - 30 }));
}
const secText = (v: number): string => (Number.isFinite(v) ? `${v.toFixed(1)} 秒` : "倒せない");
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-6 text-white">
    <div class="mb-3 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">倒すまでの時間</p>
      <p v-if="sides[0]?.enemy" class="text-[18px] text-white/60">{{ sides[0].enemy.ja }} (PoB の表)</p>
    </div>
    <div class="grid gap-8" :class="sides.length > 1 ? 'grid-cols-2' : 'mx-auto w-[640px] grid-cols-1'">
      <div v-for="(s, i) in sides" :key="i" class="rounded-2xl border border-white/15 bg-black/55 p-5 text-center">
        <p class="text-[28px] font-bold text-white/90">{{ s.label }}</p>
        <p class="text-[18px] tabular-nums text-amber-200/80">DPS {{ dpsText(s.dps) }}</p>
        <!-- 敵の人形 -->
        <div class="relative mx-auto my-3 h-[200px] w-[160px]">
          <svg viewBox="0 0 100 130" class="h-full w-full transition-opacity duration-300" :class="lifeLeft(s) <= 0 ? 'opacity-25' : ''">
            <circle cx="50" cy="22" r="16" fill="#6b5a45" stroke="#2a2118" stroke-width="3" />
            <rect x="28" y="40" width="44" height="52" rx="10" fill="#7a6650" stroke="#2a2118" stroke-width="3" />
            <rect x="12" y="44" width="16" height="36" rx="7" fill="#6b5a45" stroke="#2a2118" stroke-width="3" />
            <rect x="72" y="44" width="16" height="36" rx="7" fill="#6b5a45" stroke="#2a2118" stroke-width="3" />
            <rect x="46" y="92" width="8" height="34" fill="#4a3b2c" />
          </svg>
          <span v-for="f in floats(s)" :key="f.n" class="stage-dmg absolute left-1/2 top-8 text-[26px] font-bold tabular-nums text-amber-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]" :style="{ marginLeft: `${f.x}px` }">{{ Math.round(s.hit) }}</span>
        </div>
        <!-- ライフの棒 -->
        <div class="h-6 overflow-hidden rounded-full border border-white/20 bg-black/60">
          <div class="h-full bg-gradient-to-r from-red-700 to-red-500" :style="{ width: `${s.life ? (lifeLeft(s) / s.life) * 100 : 0}%` }" />
        </div>
        <p class="mt-1 text-[16px] tabular-nums text-white/60">ライフ {{ Math.ceil(lifeLeft(s)) }} / {{ s.life }}</p>
        <p v-if="hl && (anim.shown.value || !anim.play)" :key="'s' + (lifeLeft(s) <= 0)" class="mt-2 text-[44px] font-bold tabular-nums" :class="lifeLeft(s) <= 0 ? 'stage-pop text-emerald-300' : 'text-white/80'">
          {{ lifeLeft(s) <= 0 ? secText(s.secs) : `${Math.min(elapsed, s.secs).toFixed(1)} 秒` }}
        </p>
      </div>
    </div>
  </div>
</template>

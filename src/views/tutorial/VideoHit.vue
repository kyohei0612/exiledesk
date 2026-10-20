<!--
  VideoHit.vue — 動画用の「受けるダメージ」(2026-09-29、POE2Tube 要望 ⑰-16、防御の回の主役)

  URL: ?video=1&layout=clip&view=hit&pob=<結果 JSON の pob>&step=N&elem=fire&res=50,75[&dmg=1000][&play=1][&hl=0]
  キャラのライフの棒に敵の元素の一撃が当たって削れる。耐性の違う物を左右に並べて、削れる長さの違いを動きで見せる。
    - キャラのライフ = その手の PoB の Life (素のキャラ + 装備)
    - 一撃 = &dmg の指定、無ければ PoB の既定 (pob.enemy.hit: monsterDamageTable[敵のレベル] × 1.5 × 敵の種類の倍率。PoB の設定の既定値と同じ式)。
      &dmg を指定した時は「仮の一撃」と画面に出す
    - 受けるダメージ = 一撃 × (1 − 耐性)。耐性は res の値 (左右)。上限 75%
    - &play=1: 一撃が飛んできて当たり、棒が削れる (2 秒)。&hl=0: 受けたダメージの数字を出さない
  撮影の準備の目印: 見出しの「受けるダメージ」の文字。下 15% (612px より下) は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { PobBlock } from "../../services/craft-stage/stage-pob";
import { easeOut, seg, useAnim } from "./use-anim";

const props = defineProps<{ pob: PobBlock; step: number; elem: string; res: number[]; dmg: number | null }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const ELEM: Record<string, { ja: string; color: string }> = {
  fire: { ja: "火", color: "#ff7a45" },
  cold: { ja: "冷気", color: "#6fc3ff" },
  lightning: { ja: "雷", color: "#ffe066" },
  chaos: { ja: "混沌", color: "#c77dff" },
};
const e = computed(() => ELEM[props.elem] ?? ELEM.fire!);
const s = computed(() => props.pob.steps?.[Math.min(props.step, (props.pob.steps?.length ?? 1) - 1)] ?? null);
const life = computed(() => Math.round(s.value?.life ?? 0));
const hit = computed(() => props.dmg ?? props.pob.enemy?.hit ?? 0);
const cols = computed(() => props.res.map((r) => { const rr = Math.min(75, r); return { res: r, taken: Math.round(hit.value * (1 - rr / 100)) }; }));
const anim = useAnim(2000, { revealAt: 0.55 });
/** 一撃が飛ぶ (0〜0.45)、当たって削れる (0.45〜0.8) */
const fly = computed(() => (anim.play ? easeOut(seg(anim.t.value, 0, 0.45)) : 1));
const cut = computed(() => (anim.play ? easeOut(seg(anim.t.value, 0.45, 0.8)) : 1));
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-6 text-white">
    <div class="mb-3 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">受けるダメージ</p>
      <p class="text-[18px] text-white/60">
        敵の{{ e.ja }}の一撃 <b class="text-[24px]" :style="{ color: e.color }">{{ hit }}</b>
        <template v-if="dmg != null"> (仮の一撃)</template>
        <template v-else-if="pob.enemy"> (PoB の既定・敵 Lv{{ pob.enemy.level }})</template>
      </p>
    </div>
    <div class="grid gap-8" :class="cols.length > 1 ? 'grid-cols-2' : 'mx-auto w-[640px] grid-cols-1'">
      <div v-for="(c, i) in cols" :key="i" class="relative rounded-2xl border border-white/15 bg-black/55 p-5 text-center">
        <p class="text-[30px] font-bold" :style="{ color: e.color }">{{ e.ja }}耐性 {{ c.res }}%</p>
        <!-- 飛んでくる一撃 -->
        <div class="relative h-[150px]">
          <span
            v-if="anim.play && fly < 1"
            class="absolute top-1/2 h-10 w-10 -translate-y-1/2 rounded-full"
            :style="{ left: `${fly * 80}%`, background: `radial-gradient(circle, #fff 0%, ${e.color} 45%, transparent 70%)`, boxShadow: `0 0 30px 10px ${e.color}` }"
          />
          <svg viewBox="0 0 100 130" class="absolute right-6 top-2 h-[140px]">
            <circle cx="50" cy="22" r="16" fill="#c9b8a0" stroke="#2a2118" stroke-width="3" />
            <rect x="28" y="40" width="44" height="52" rx="10" fill="#8a7a64" stroke="#2a2118" stroke-width="3" />
            <rect x="46" y="92" width="8" height="34" fill="#5a4b3c" />
          </svg>
          <span v-if="hl && cut > 0 && anim.shown.value" :key="'d' + i" class="stage-pop absolute right-44 top-2 text-[40px] font-bold tabular-nums text-rose-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">−{{ c.taken }}</span>
        </div>
        <!-- ライフの棒 (削れた分は薄い赤で残す) -->
        <div class="relative h-8 overflow-hidden rounded-full border border-white/20 bg-black/60">
          <div class="absolute inset-y-0 left-0 bg-rose-900/60" :style="{ width: '100%' }" />
          <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-red-700 to-red-500" :style="{ width: `${life ? (Math.max(0, life - c.taken * cut) / life) * 100 : 0}%` }" />
        </div>
        <p class="mt-2 text-[22px] tabular-nums text-white/80">ライフ {{ Math.max(0, Math.round(life - c.taken * cut)) }} / {{ life }}</p>
        <p v-if="hl && (anim.shown.value || !anim.play)" class="mt-1 text-[18px] text-white/60">{{ hit }} × (1 − {{ Math.min(75, c.res) }}%) = <b class="text-rose-200">{{ c.taken }}</b></p>
      </div>
    </div>
  </div>
</template>

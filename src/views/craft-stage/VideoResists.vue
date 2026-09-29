<!--
  VideoResists.vue — 動画用の耐性の画面 (2026-09-29、POE2Tube 要望 ⑰-4「防御の章」)

  URL: ?video=1&layout=clip&view=resists&r=<craft-stage-run.mjs --resists の結果>&act=-20[&penalty=0]
  火 / 冷気 / 雷 / 混沌の 4 本の棒で「装備の合計 → ペナルティ後 (実際の値) → 上限 75%」。数値は PoB の計算 (自前で足さない)。
    - 装備の合計 = 装備だけの耐性 (アイテム無しとの差、r.equip)、実際の値 = act のペナルティでの PoB の値 (素のキャラの分・上限込み)
    - 上限 (75%) を超えた分は薄く、足りない (マイナス) 所は赤
    - &penalty=0 でペナルティ後を出さない (質問の行用、&hl=0 と同じ考え)
  撮影の準備の目印: 画面の見出しに「耐性」の文字。下 15% (612px より下) は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { ResistsBlock } from "../../state/craft-stage";

const props = defineProps<{ r: ResistsBlock; act: number | null; penalty: boolean }>();
const CAP = 75;
const ELEMS = [
  { key: "fire", ja: "火耐性", color: "#ff7a45" },
  { key: "cold", ja: "冷気耐性", color: "#6fc3ff" },
  { key: "lightning", ja: "雷耐性", color: "#ffe066" },
  { key: "chaos", ja: "混沌耐性", color: "#c77dff" },
] as const;
const base = computed(() => props.r.rows?.find((x) => x.penalty === 0) ?? props.r.rows?.[0] ?? null);
const row = computed(() => (props.act != null ? props.r.rows?.find((x) => x.penalty === props.act) : null) ?? props.r.rows?.[props.r.rows.length - 1] ?? null);
/** 棒の目盛り: -60% 〜 +100% を横幅に */
const MIN = -60;
const MAX = 100;
const x = (v: number): number => ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * 100;
const bars = computed(() =>
  ELEMS.map((e) => {
    const total = props.r.equip?.[e.key] ?? base.value?.resists[e.key].total ?? 0;
    const value = row.value?.resists[e.key].value ?? 0;
    const after = row.value?.resists[e.key].total ?? 0;
    return { ...e, total, value, after, over: Math.max(0, after - CAP) };
  }),
);
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-6 text-white">
    <div class="mb-4 flex items-end justify-between">
      <div>
        <p class="text-[40px] font-bold leading-tight text-amber-100">耐性</p>
        <p class="text-[18px] text-white/60">{{ r.items?.map((i) => i.name).join("・") }}</p>
      </div>
      <p v-if="penalty && row" class="rounded-xl border border-rose-300/40 bg-rose-500/15 px-4 py-2 text-[24px] font-bold text-rose-100">{{ row.label }}</p>
    </div>
    <div class="space-y-5">
      <div v-for="b in bars" :key="b.key" class="grid grid-cols-[150px_1fr_260px] items-center gap-5">
        <span class="text-[26px] font-bold" :style="{ color: b.color }">{{ b.ja }}</span>
        <!-- 棒: 0 の線・上限 75% の線・装備の合計 (枠)・実際の値 (塗り)。上限を超えた分は薄く、マイナスは赤 -->
        <div class="relative h-12 rounded-lg bg-white/10">
          <span class="absolute inset-y-0 w-[2px] bg-white/50" :style="{ left: `${x(0)}%` }" />
          <span class="absolute -top-6 -translate-x-1/2 text-[15px] font-bold text-amber-200" :style="{ left: `${x(CAP)}%` }">上限 75%</span>
          <span class="absolute inset-y-[-4px] w-[3px] bg-amber-300" :style="{ left: `${x(CAP)}%` }" />
          <!-- 装備の合計 (ペナルティ前) -->
          <span class="absolute inset-y-1 rounded border-2 border-dashed border-white/60" :style="{ left: `${x(Math.min(0, b.total))}%`, width: `${Math.abs(x(b.total) - x(0))}%` }" />
          <!-- 実際の値 (ペナルティ後・上限後) -->
          <template v-if="penalty">
            <span
              class="absolute inset-y-2 rounded transition-all duration-700"
              :class="b.value < 0 ? 'bg-rose-500/80' : ''"
              :style="{ left: `${x(Math.min(0, b.value))}%`, width: `${Math.abs(x(b.value) - x(0))}%`, ...(b.value >= 0 ? { background: b.color } : {}) }"
            />
            <span v-if="b.over" class="absolute inset-y-2 rounded opacity-30" :style="{ left: `${x(CAP)}%`, width: `${x(b.after) - x(CAP)}%`, background: b.color }" />
          </template>
        </div>
        <span class="text-right text-[24px] tabular-nums">
          <span class="text-white/60">装備 {{ b.total > 0 ? "+" : "" }}{{ Math.round(b.total) }}%</span>
          <template v-if="penalty"> → <b :class="b.value < 0 ? 'text-rose-300' : 'text-white'">{{ Math.round(b.value) }}%</b></template>
        </span>
      </div>
    </div>
    <p class="mt-6 text-[15px] text-white/50">
      点線 = 装備の合計 (ペナルティ前)<template v-if="penalty">、塗り = ペナルティ後の実際の値 (上限 75% を超えた分は薄く、マイナスは赤)</template>。数値は Path of Building {{ r.version }} の計算
    </p>
  </div>
</template>

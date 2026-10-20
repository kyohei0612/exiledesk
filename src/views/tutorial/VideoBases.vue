<!--
  VideoBases.vue — 動画用の「防具のベースの比べ」(2026-09-30、POE2Tube 要望 ㉒-B5)

  URL: ?video=1&layout=clip&view=bases[&slot=body|helmet|gloves|boots|shield][&early=1][&late=80]
  アーマー / 回避力 / ES / ハイブリッドのベースごとに、アクト序盤 (必要レベル early 以下で一番高い物) とエンド (late 以下で一番高い物) の素の値を並べて、何倍違うか。
  値はゲームのデータ (ArmourTypes、日本語名は BaseItemTypes)。品質・MOD 無しの素の値。ルーンフォージ等の別の見た目の物は除く。
    - &play=1: 棒が伸びる (1.6 秒)。&hl=0: 倍率を出さない
  撮影の準備の目印: 見出しの「防具のベース」の文字。下 15% は空ける。
-->
<script setup lang="ts">
import { computed } from "vue";
import { DEF } from "../../services/craft-stage/defence";
import { easeOut, useAnim } from "./use-anim";

const props = defineProps<{ slot: string; early: number; late: number }>();
const hl = new URLSearchParams(location.search).get("hl") !== "0";
const SLOT_JA: Record<string, string> = { body: "胴", helmet: "兜", gloves: "手袋", boots: "靴", shield: "盾" };
type B = (typeof DEF.bases)[number];
const TYPES: Array<{ ja: string; test: (b: B) => boolean; stats: Array<"ar" | "ev" | "es"> }> = [
  { ja: "アーマー", test: (b) => b.ar > 0 && !b.ev && !b.es, stats: ["ar"] },
  { ja: "回避力", test: (b) => b.ev > 0 && !b.ar && !b.es, stats: ["ev"] },
  { ja: "ES", test: (b) => b.es > 0 && !b.ar && !b.ev, stats: ["es"] },
  { ja: "アーマー + 回避", test: (b) => b.ar > 0 && b.ev > 0 && !b.es, stats: ["ar", "ev"] },
  { ja: "アーマー + ES", test: (b) => b.ar > 0 && b.es > 0 && !b.ev, stats: ["ar", "es"] },
  { ja: "回避 + ES", test: (b) => b.ev > 0 && b.es > 0 && !b.ar, stats: ["ev", "es"] },
];
const STAT = { ar: { ja: "アーマー", color: "#e0a060" }, ev: { ja: "回避力", color: "#7fd67f" }, es: { ja: "ES", color: "#6fb8ff" } } as const;
const pool = computed(() => DEF.bases.filter((b) => b.slot === props.slot && !/^Rune(forged|mastered)/.test(b.en)));
const best = (list: B[], lvl: number) => list.filter((b) => b.lvl <= lvl).sort((a, b) => b.lvl - a.lvl || total(b) - total(a))[0] ?? null;
const total = (b: B) => b.ar + b.ev + b.es;
const rows = computed(() =>
  TYPES.map((t) => {
    const list = pool.value.filter(t.test);
    return { ...t, a: best(list, props.early), b: best(list, props.late) };
  }).filter((r) => r.a && r.b),
);
const maxVal = computed(() => Math.max(1, ...rows.value.flatMap((r) => r.stats.map((s) => r.b![s]))));
const anim = useAnim(1600);
const grow = computed(() => (anim.play ? easeOut(anim.t.value) : 1));
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-10 pt-5 text-white">
    <div class="mb-3 flex items-end justify-between">
      <p class="text-[40px] font-bold leading-tight text-amber-100">防具のベース ({{ SLOT_JA[slot] ?? slot }})</p>
      <p class="text-[18px] text-white/60">素の値 (品質・MOD 無し)・必要レベル {{ early }} まで → {{ late }} まで</p>
    </div>
    <div class="space-y-2.5">
      <div v-for="r in rows" :key="r.ja" class="grid grid-cols-[190px_1fr_120px] items-center gap-4 rounded-xl border border-white/15 bg-black/55 px-4 py-2">
        <p class="text-[24px] font-bold text-amber-50">{{ r.ja }}</p>
        <div class="space-y-1">
          <div v-for="(it, k) in [r.a!, r.b!]" :key="k" class="flex items-center gap-3">
            <span class="w-[250px] truncate text-[17px]" :class="k ? 'text-white' : 'text-white/60'">{{ it.ja }} <span class="text-white/40">Lv{{ it.lvl }}</span></span>
            <div class="flex h-5 flex-1 gap-0.5">
              <div v-for="s in r.stats" :key="s" class="h-full rounded" :style="{ width: `${(it[s] / maxVal) * 100 * grow / r.stats.length}%`, background: STAT[s].color, opacity: k ? 1 : 0.55 }" />
            </div>
            <span class="w-[150px] text-right text-[17px] tabular-nums">
              <template v-for="(s, j) in r.stats" :key="s"><template v-if="j"> / </template><span :style="{ color: STAT[s].color }">{{ it[s] }}</span></template>
            </span>
          </div>
        </div>
        <p v-if="hl" class="text-right text-[30px] font-bold tabular-nums text-amber-200">×{{ (total(r.b!) / Math.max(1, total(r.a!))).toFixed(1) }}</p>
      </div>
    </div>
  </div>
</template>

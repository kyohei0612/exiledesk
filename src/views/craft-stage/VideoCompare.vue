<!--
  VideoCompare.vue — 動画用の 2 つ並べて比べる画面 (POE2Tube 要望 ⑪-3、2026-09-29)

  URL: ?video=1&layout=clip&view=compare&a=<手順 JSON>&b=<手順 JSON>[&a_step=N&b_step=N]
  手順を (step まで) 打ったアイテム 2 つを左右に並べ、真ん中に違い (B − A) を色で出す (増えた = 緑、減った = 赤)。
  「装備を入れ替えるかの見方」の回用。下 15% (612px より下) は空ける。画面に「アイテムレベル」の文字が出る (アイテム枠)。
-->
<script setup lang="ts">
import { computed } from "vue";
import StageItemCard from "./StageItemCard.vue";
import { craftStage } from "../../state/craft-stage";
import { playPlan } from "../../services/craft-stage/run-plan";
import { diffItems } from "../../services/craft-stage/compare";
import type { CraftStagePlan } from "../../services/craft-stage/contract";

const props = defineProps<{ a: CraftStagePlan; b: CraftStagePlan; aStep: number; bStep: number }>();

const view = computed(() => {
  const data = craftStage.data.value;
  if (!data) return null;
  try {
    const a = playPlan(data, props.a, {}, props.aStep).final;
    const b = playPlan(data, props.b, {}, props.bStep).final;
    return { a, b, diff: diffItems(a, b) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});
const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, ""));
const signed = (v: number): string => (v > 0 ? `+${num(v)}` : num(v));
/** 違いを文面に入れる (「回避力 +#」→「回避力 +169」)。数値が 2 つある文面は 1 つ目に差、残りは省く */
function withDelta(text: string, d: number): string {
  let used = false;
  const out = text.replace(/([+-]?)#/g, () => {
    if (used) return "…";
    used = true;
    return d === 0 ? "±0" : signed(d);
  });
  return used ? out : `${text} ${signed(d)}`;
}
/**
 * 並べ方 (要望 ⑫「3 列を横幅いっぱいに。差の行は特に大きく」、⑬「左右のアイテムを縦にも大きく。MOD の文字は 1080p で 28px 以上。
 * 差の列は少し細くしてよい」): 差の列 360px・文字 22px (1080p で約 33px)。左右のカードは残りの幅を 2 枚で分け、CSS の zoom で
 * ZOOM 倍 (MOD の文字 13px × 1.44 ≒ 19px = 1080p で約 28px)。幅が足りない分は元の幅を狭めて MOD を折り返す
 */
const DIFF_W = 360;
const COL_W = (1280 - 24 - DIFF_W - 24) / 2;
const ZOOM = 1.44;
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-3 pt-3 text-white">
    <p v-if="!view" class="mt-40 text-center text-2xl opacity-60">データを読んでいます…</p>
    <p v-else-if="'error' in view" class="mt-40 text-center text-2xl text-rose-300">{{ view.error }}</p>
    <div v-else class="flex h-full items-start justify-center gap-3">
      <div class="shrink-0" :style="{ width: `${COL_W}px` }">
        <p class="mb-1 text-center text-[24px] font-bold text-white/80">A (今の装備)</p>
        <div :style="{ zoom: ZOOM }">
          <StageItemCard :item="view.a" :added="[]" :removed="[]" :holding="false" :flash-key="0" compact :width="COL_W / ZOOM" />
        </div>
      </div>
      <!-- 違い (B − A) -->
      <div class="shrink-0 space-y-1.5 rounded-2xl border border-white/15 bg-black/70 p-3" :style="{ width: `${DIFF_W}px` }">
        <p class="text-center text-[24px] font-bold text-amber-100">入れ替えると</p>
        <p v-if="!view.diff.length" class="text-center text-[24px] opacity-60">MOD の違いは無い</p>
        <p
          v-for="(d, i) in view.diff.slice(0, 10)"
          :key="i"
          class="truncate rounded-lg px-2.5 py-1 text-[22px] font-bold leading-snug"
          :class="d.delta > 0 ? 'bg-emerald-500/15 text-emerald-200' : d.delta < 0 ? 'bg-rose-500/15 text-rose-200' : 'bg-white/5 text-white/50'"
        >{{ withDelta(d.text, d.delta) }}</p>
      </div>
      <div class="shrink-0" :style="{ width: `${COL_W}px` }">
        <p class="mb-1 text-center text-[24px] font-bold text-white/80">B (入れ替える物)</p>
        <div :style="{ zoom: ZOOM }">
          <StageItemCard :item="view.b" :added="[]" :removed="[]" :holding="false" :flash-key="0" compact :width="COL_W / ZOOM" />
        </div>
      </div>
    </div>
  </div>
</template>

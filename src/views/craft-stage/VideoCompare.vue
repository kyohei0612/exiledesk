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
/** カードの倍率 (左右 2 枚 + 真ん中 300px が 1280 に収まる) */
const CARD = 1.22;
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-4 pt-4 text-white">
    <p v-if="!view" class="mt-40 text-center text-2xl opacity-60">データを読んでいます…</p>
    <p v-else-if="'error' in view" class="mt-40 text-center text-2xl text-rose-300">{{ view.error }}</p>
    <div v-else class="flex h-full items-start justify-center gap-4">
      <div class="shrink-0" :style="{ width: `${380 * CARD}px` }">
        <p class="mb-1 text-center text-[20px] font-bold text-white/75">A (今の装備)</p>
        <div :style="{ transform: `scale(${CARD})`, transformOrigin: '0 0' }">
          <StageItemCard :item="view.a" :added="[]" :removed="[]" :holding="false" :flash-key="0" compact />
        </div>
      </div>
      <!-- 違い (B − A) -->
      <div class="mt-10 w-[300px] shrink-0 space-y-1.5 rounded-2xl border border-white/15 bg-black/65 p-3">
        <p class="text-center text-[20px] font-bold text-amber-100">入れ替えると</p>
        <p v-if="!view.diff.length" class="text-center text-[17px] opacity-60">MOD の違いは無い</p>
        <p
          v-for="(d, i) in view.diff.slice(0, 11)"
          :key="i"
          class="truncate rounded-lg px-2.5 py-1 text-[17px] font-bold"
          :class="d.delta > 0 ? 'bg-emerald-500/15 text-emerald-200' : d.delta < 0 ? 'bg-rose-500/15 text-rose-200' : 'bg-white/5 text-white/50'"
        >{{ withDelta(d.text, d.delta) }}</p>
      </div>
      <div class="shrink-0" :style="{ width: `${380 * CARD}px` }">
        <p class="mb-1 text-center text-[20px] font-bold text-white/75">B (入れ替える物)</p>
        <div :style="{ transform: `scale(${CARD})`, transformOrigin: '0 0' }">
          <StageItemCard :item="view.b" :added="[]" :removed="[]" :holding="false" :flash-key="0" compact />
        </div>
      </div>
    </div>
  </div>
</template>

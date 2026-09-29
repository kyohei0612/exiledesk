<!--
  VideoPob.vue — 動画モードの PoB の欄 (2026-09-29、POE2Tube 要望 ⑰-3 / ⑰-6 / ⑰-18)

  kyohei「スキルの DPS やダメージ表記がないと分かりづらい、複雑な計算だから PoB の計算機で」「スキルの画像もいる」。
  URL の stage-pob=<結果 JSON の pob> (craft-stage-run.mjs が同梱の PoB で計算した値) を出すだけ (ブラウザで開くので画面から PoB は呼べない)。
    - 前提の札: スキルの絵・名前・ジェムのレベル、キャラ (クラス・レベル)、PoB の設定 (「普通の敵・アクト 3 のペナルティ」)
    - スキル DPS: 今の手の値を大きく、直前の手から変わった時は「8.9 → 21.3 (+139%)」(増 = 緑・減 = 赤)
      手が進んだ瞬間に数字をカウントアップ (0.7 秒)、増減の札が弾む (要望 ⑰-18)。`&dps=0` で札を隠す (質問の行用。前提の札は出す)
    - 防具 (DPS が 0) は防御 (アーマー・回避力・ES) を出す
  撮影用 (layout=clip) はアイテムの左に縦に置く (倍率は塊の横幅でも決まるので、はみ出さない)。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { PobBlock } from "../../services/craft-stage/stage-pob";
import { dpsText } from "../../services/craft-stage/stage-pob";
import { skillIcon } from "../../services/craft-stage/skill-art";

const props = defineProps<{ pob: PobBlock; idx: number }>();
const hideDps = typeof location !== "undefined" && new URLSearchParams(location.search).get("dps") === "0";
const CLASS_JA: Record<string, string> = { Ranger: "レンジャー", Warrior: "ウォリアー", Sorceress: "ソーサレス", Witch: "ウィッチ", Monk: "モンク", Mercenary: "マーセナリー", Huntress: "ハントレス", Druid: "ドルイド" };
const now = computed(() => props.pob.steps[Math.min(props.idx, props.pob.steps.length - 1)] ?? null);
const prev = computed(() => (props.idx > 0 ? props.pob.steps[props.idx - 1] ?? null : null));
const icon = computed(() => skillIcon(props.pob.character.skill));
const skillName = computed(() => props.pob.character.skill_ja ?? props.pob.character.skill);
/** 直前の手からの DPS の変化 (変わっていなければ null) */
const delta = computed(() => {
  const a = prev.value?.dps ?? null;
  const b = now.value?.dps ?? null;
  if (a == null || b == null || Math.abs(a - b) < 0.05) return null;
  return { from: a, to: b, pct: a > 0 ? Math.round(((b - a) / a) * 100) : null };
});
const isDefence = computed(() => (now.value?.dps ?? 0) <= 0);

/** 出している DPS の数字 (手が進んだ時は前の値から数え上げる) */
const shown = ref(now.value?.dps ?? 0);
let raf = 0;
watch(
  () => props.idx,
  (i, old) => {
    cancelAnimationFrame(raf);
    const to = now.value?.dps ?? 0;
    const from = old != null && i === old + 1 ? (prev.value?.dps ?? to) : to;
    if (from === to) { shown.value = to; return; }
    const t0 = performance.now();
    const tick = (t: number): void => {
      const p = Math.min(1, (t - t0) / 700);
      shown.value = from + (to - from) * (1 - (1 - p) ** 3);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  },
);
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
  <div class="w-[260px] shrink-0 space-y-3 self-center">
    <!-- 前提の札 -->
    <div class="rounded-xl border border-white/15 bg-black/70 p-3">
      <div class="flex items-center gap-3">
        <img v-if="icon" :src="icon" alt="" class="h-14 w-14 rounded-lg border border-white/20 bg-black/60 object-contain" draggable="false" />
        <div class="min-w-0">
          <p class="truncate text-[19px] font-bold leading-tight text-sky-100">{{ skillName }}</p>
          <p class="text-[13px] text-white/60">ジェム Lv {{ pob.character.gem_level }}</p>
        </div>
      </div>
      <p class="mt-2 text-[13px] text-white/70">{{ CLASS_JA[pob.character.class] ?? pob.character.class }} Lv {{ pob.character.level }}・パッシブ無し</p>
      <p class="text-[12px] text-white/50">{{ pob.config_ja }}</p>
    </div>
    <!-- スキル DPS / 防御 (&dps=0 で隠す) -->
    <template v-if="!hideDps">
      <div v-if="now && !isDefence" class="rounded-xl border border-amber-300/40 bg-black/75 p-3 text-center">
        <p class="text-[13px] tracking-wider text-amber-200/80">スキル DPS</p>
        <p class="text-[40px] font-bold leading-tight tabular-nums text-amber-100">{{ dpsText(shown) }}</p>
        <p v-if="delta" :key="'d' + idx" class="stage-pop text-[16px] font-bold tabular-nums" :class="delta.to > delta.from ? 'text-emerald-300' : 'text-rose-300'">
          {{ dpsText(delta.from) }} → {{ dpsText(delta.to) }}<template v-if="delta.pct != null"> ({{ delta.pct > 0 ? "+" : "" }}{{ delta.pct }}%)</template>
        </p>
        <p class="mt-1 text-[12px] tabular-nums text-white/50">1 発 {{ dpsText(now.hit) }} · {{ now.aps.toFixed(2) }} 回/秒</p>
      </div>
      <div v-else-if="now" :key="'a' + idx" class="stage-row-in space-y-0.5 rounded-xl border border-sky-300/40 bg-black/75 p-3 text-[15px] tabular-nums">
        <p class="mb-1 text-center text-[13px] tracking-wider text-sky-200/80">防御 (PoB)</p>
        <p v-if="now.armour">アーマー <b class="float-right">{{ Math.round(now.armour) }}</b></p>
        <p v-if="now.evasion">回避力 <b class="float-right">{{ Math.round(now.evasion) }}</b></p>
        <p v-if="now.es">エナジーシールド <b class="float-right">{{ Math.round(now.es) }}</b></p>
      </div>
    </template>
  </div>
</template>

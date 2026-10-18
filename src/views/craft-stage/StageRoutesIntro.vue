<!--
  StageRoutesIntro.vue — スパムシミュレーターの最初の画面 (狙いを選ぶ前。2026-10-19 オーナー「最初の画面はこれでおｋ、こっちのがかわいい」
  「もっと情報多くていい、大きくしていいし文字もアイコンも」「AI の UI みたい。PoE2 の雰囲気出した UI で」)。
  ゲームの部品だけで組む: 今のアイテムはアイテムの額 (.g-item)、3 つの道はカレンシーの説明のカード (styles/poe-card.css) で、
  上にカレンシーの絵を棚の枠 (.g-slot) に入れて、始めの状態 = 性能の行、打ち方 = MOD の青い行、等級 = 棚の枠。使い方も同じカード。嵌めるルーンは StageRouteRunes
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s, iconOf } from "../../state/craft-stage";
import { baseArt } from "../../services/craft-stage/base-art";
import { tr } from "../../i18n/lang";
import StageRouteRunes from "./StageRouteRunes.vue";

type Route = { route: string; ja: string; en: string; main: string; grades: string[]; start: [string, string]; steps: Array<{ ja: string; en: string }> };
defineProps<{ routes: Route[]; runs: number; picked: readonly string[]; required: readonly string[] }>();
const emit = defineEmits<{ pick: []; runes: [ids: string[]] }>();
const GRADE: Record<string, [string, string, string]> = { base: ["無印", "Regular", ""], greater: ["上級", "Greater", "_greater"], perfect: ["完全", "Perfect", "_perfect"] };
const art = computed(() => (s.item.value ? baseArt(s.item.value.base) : null));
const ilvl = computed(() => s.item.value?.itemLevel ?? s.itemLevel.value);
</script>

<template>
  <div data-routes-intro class="g-panel px-6 py-6 max-md:px-3">
    <!-- 今のアイテム (アイテムの額) -->
    <div class="flex flex-wrap items-center justify-center gap-5">
      <div v-if="art" class="g-item grid size-28 place-items-center bg-black/60"><img :src="art" alt="" class="max-h-full max-w-full object-contain" draggable="false" /></div>
      <div class="text-center">
        <p class="g-antique text-[12px] tracking-[0.3em] text-[var(--exile-color-text-tertiary)]">{{ tr("このアイテムで比べる", "Comparing on") }}</p>
        <p class="g-brush text-[28px] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000] max-md:text-[21px]">{{ s.item.value?.baseJa ?? s.base.value }}</p>
        <p class="g-antique text-[14px] text-[var(--exile-color-text-secondary)]">{{ tr("アイテムレベル", "Item level") }}: <span class="text-white">{{ ilvl }}</span></p>
      </div>
    </div>

    <!-- 3 つの道 (カレンシーの説明のカード) -->
    <div class="mt-6 grid gap-4 lg:grid-cols-3">
      <div v-for="r in routes" :key="r.route" class="flex flex-col items-center">
        <span class="g-slot z-10 -mb-5 grid size-[88px] place-items-center"><img :src="iconOf(r.main)" alt="" class="size-[72px] object-contain" /></span>
        <article class="poe-card w-full flex-1 pt-4">
          <div class="poe-card-head"><p class="poe-card-name">{{ tr(r.ja, r.en) }}</p></div>
          <div class="poe-card-body">
            <p class="poe-prop">{{ tr("始めの状態", "Start") }}: <b>{{ tr(...r.start) }}</b></p>
            <div class="poe-sep" />
            <p v-for="(st, i) in r.steps" :key="i" class="poe-mod text-[13px] leading-snug [&+&]:mt-1">{{ tr(st.ja, st.en) }}</p>
            <div class="poe-sep" />
            <p class="poe-prop mb-1">{{ tr("比べる等級", "Grades compared") }}</p>
            <div class="flex justify-center gap-2">
              <span v-for="g in r.grades" :key="g" class="flex flex-col items-center gap-0.5">
                <span class="g-slot grid size-12 place-items-center"><img :src="iconOf(`${r.main}${GRADE[g]![2]}`)" alt="" class="size-10 object-contain" /></span>
                <span class="poe-desc text-[12px]">{{ tr(GRADE[g]![0], GRADE[g]![1]) }}</span>
              </span>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- 使い方 (同じカード) と、嵌めるルーン・選ぶ -->
    <div class="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <article class="poe-card">
        <div class="poe-card-head"><p class="poe-card-name">{{ tr("スパムシミュレーター", "Spam simulator") }}</p></div>
        <div class="poe-card-body">
          <p class="poe-desc">{{ tr("狙う MOD を 1 つ選ぶと、増強・カオス・高貴のスパムを", "Pick one target mod, and augment, chaos and exalt spam") }}</p>
          <p class="poe-desc">{{ tr(`それぞれ 3 つの等級で ${runs} 人ずつ打って比べる`, `are each run ${runs} times at 3 grades and compared`) }}</p>
          <div class="poe-sep" />
          <p class="poe-mod">{{ tr("一番安い道と、平均・半分の人・運が悪い 10 人に 1 人の費用", "The cheapest route, with average / half / unluckiest 1 in 10 costs") }}</p>
          <p class="poe-mod">{{ tr("運試しで自分も打って、100 人の中の順位を X でシェア", "Luck test: spam it yourself, see your rank among 100, share on X") }}</p>
          <div class="poe-sep" />
          <p class="poe-prop">{{ tr("値段は今の相場。ベース代と始めの状態を作る費用は入れない。冒涜スパムは入れない", "Current prices. Base and start-state costs not included. No desecration spam") }}</p>
          <p class="poe-flavour mt-2">{{ tr("エミュレーターと同じ決まりで、同じ乱数は二度と使わない", "Same rules as the Emulator, never the same dice twice") }}</p>
        </div>
      </article>
      <div class="flex flex-col items-center gap-5 pt-2">
        <StageRouteRunes :picked="picked" :required="required" @change="emit('runes', $event)" />
        <button type="button" data-routes-pick class="g-btn-red min-h-14 w-full max-w-[22rem] text-[17px]" @click="emit('pick')">{{ tr("狙う MOD を選ぶ", "Pick a target mod") }}</button>
      </div>
    </div>
  </div>
</template>

<style src="../../styles/poe-card.css"></style>

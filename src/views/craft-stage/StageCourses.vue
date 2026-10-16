<!--
  StageCourses.vue — クラフトのコースの一覧 (2026-10-17、[[craft-courses.ts]])。難しさごとに並べる (どれからでも始められる)。
  押すとそのベースの白からエミュレーターで始まり、横に案内 ([[StageCourseGuide.vue]]) が出る
-->
<script setup lang="ts">
import { craftStage as s } from "../../state/craft-stage";
import { startCourse } from "../../state/craft-course";
import { CRAFT_COURSES, courseSlots } from "../../services/craft-stage/craft-courses";
import { baseNameOf, tr } from "../../i18n/lang";
import { jaTypeName } from "../../services/trade2/localize";
import type { JaEn } from "../../services/craft-stage/quiz-tutorials";

const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVELS: Array<{ n: 1 | 2 | 3 | 4; label: JaEn; note: JaEn; chip: string; ring: string }> = [
  { n: 1, label: ["入門", "Intro"], note: ["はじめての人はここから", "Start here"], chip: "bg-emerald-500/25 text-emerald-100", ring: "border-emerald-400/50 hover:border-emerald-300" },
  { n: 2, label: ["初級", "Easy"], note: ["エッセンス・冒涜・お告げ", "Essences, desecration, omens"], chip: "bg-sky-500/25 text-sky-100", ring: "border-sky-400/50 hover:border-sky-300" },
  { n: 3, label: ["中級", "Medium"], note: ["パーフェクトエッセンス・合金・アストリッド・結晶化", "Perfect essences, alloys, Astrid, crystallisation"], chip: "bg-amber-500/25 text-amber-100", ring: "border-amber-400/50 hover:border-amber-300" },
  { n: 4, label: ["上級", "Hard"], note: ["フラクチャーの作り直し・アストリッド・結晶化", "Fracture retries, Astrid, crystallisation"], chip: "bg-rose-500/25 text-rose-100", ring: "border-rose-400/50 hover:border-rose-300" },
];
const baseName = (b: string): string => baseNameOf({ base: b, baseJa: jaTypeName(b) });
</script>

<template>
  <section data-courses class="flex flex-col gap-4">
    <div class="rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-500/[0.10] to-transparent px-4 py-3">
      <p class="text-[16px] font-bold text-amber-100">{{ tr("クラフトのコース", "Crafting courses") }}</p>
      <p class="mt-1 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr("動画のクラフトを、動画と同じ始めの状態から自分で作ります。付ける順番と、今の状況でのおすすめの手だけ案内します (作り方は自由)。", "Recreate a video's craft yourself from the same starting item. Only the order and a suggested move for the current state are shown (craft however you like).") }}</p>
    </div>
    <template v-for="lv in LEVELS" :key="lv.n">
      <div v-if="CRAFT_COURSES.some((c) => c.level === lv.n)" class="flex flex-col gap-2">
        <p class="flex items-center gap-2"><span class="rounded px-2 py-0.5 text-[12px] font-bold" :class="lv.chip">{{ t2(lv.label) }}</span><span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ t2(lv.note) }}</span></p>
        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <button v-for="c in CRAFT_COURSES.filter((x) => x.level === lv.n)" :key="c.id" type="button" data-course-card class="g-plain flex min-w-0 flex-col items-start gap-1.5 rounded-xl border-2 bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06]" :class="lv.ring" :disabled="!s.data.value" @click="startCourse(c)">
            <span class="flex w-full items-center gap-2">
              <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="lv.chip">{{ t2(c.part) }}</span>
              <b class="min-w-0 truncate text-[15px] text-[var(--exile-color-text-title)]">{{ baseName(c.recipe.base) }}</b>
              <span class="ml-auto shrink-0 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`MOD ${courseSlots(c).length} つ`, `${courseSlots(c).length} mods`) }}</span>
            </span>
            <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("覚えること", "You learn") }}: {{ t2(c.learn) }}</span>
            <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("元の動画", "From") }}: {{ t2(c.video.title) }}</span>
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

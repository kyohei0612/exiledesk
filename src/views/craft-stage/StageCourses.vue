<!--
  StageCourses.vue — クラフトのコースの一覧 (2026-10-17)。
  入門〜中級は「動作を学ぶコース」([[topic-courses.ts]]、タイトルは学べる動作)、その下に「実践」として動画のクラフトを作るコース ([[craft-courses.ts]])。
  どれからでも始められる。押すとエミュレーターで始まり、横に案内が出る
-->
<script setup lang="ts">
import { craftStage as s } from "../../state/craft-stage";
import { endCourse, startCourse } from "../../state/craft-course";
import { startTopic } from "../../state/craft-topic";
import { CRAFT_COURSES, courseSlots } from "../../services/craft-stage/craft-courses";
import { TOPIC_COURSES } from "../../services/craft-stage/topic-courses";
import { baseNameOf, tr } from "../../i18n/lang";
import { jaTypeName } from "../../services/trade2/localize";
import type { JaEn } from "../../services/craft-stage/quiz-tutorials";

const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVELS: Array<{ n: 1 | 2 | 3; label: JaEn; note: JaEn; chip: string; ring: string }> = [
  { n: 1, label: ["入門", "Intro"], note: ["はじめての人はここから", "Start here"], chip: "bg-emerald-500/25 text-emerald-100", ring: "border-emerald-400/50 hover:border-emerald-300" },
  { n: 2, label: ["初級", "Easy"], note: ["冒涜とお告げ", "Desecration and omens"], chip: "bg-sky-500/25 text-sky-100", ring: "border-sky-400/50 hover:border-sky-300" },
  { n: 3, label: ["中級", "Medium"], note: ["カタリストと液化した感情", "Catalysts and liquid emotions"], chip: "bg-amber-500/25 text-amber-100", ring: "border-amber-400/50 hover:border-amber-300" },
];
const baseName = (b: string): string => baseNameOf({ base: b, baseJa: jaTypeName(b) });
</script>

<template>
  <section data-courses class="flex flex-col gap-4">
    <div class="rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-500/[0.10] to-transparent px-4 py-3">
      <p class="text-[16px] font-bold text-amber-100">{{ tr("クラフトのコース", "Crafting courses") }}</p>
      <p class="mt-1 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr("入門〜中級は、その仲間のカレンシーとお告げを全部、1 つずつ実際に使って覚えます。実践は動画のクラフトを自分で作ります。", "Intro to medium: try every currency and omen of a kind, one by one. Practice: recreate a video's craft yourself.") }}</p>
    </div>
    <template v-for="lv in LEVELS" :key="lv.n">
      <div v-if="TOPIC_COURSES.some((c) => c.level === lv.n)" class="flex flex-col gap-2">
        <p class="flex items-center gap-2"><span class="rounded px-2 py-0.5 text-[12px] font-bold" :class="lv.chip">{{ t2(lv.label) }}</span><span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ t2(lv.note) }}</span></p>
        <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <button v-for="c in TOPIC_COURSES.filter((x) => x.level === lv.n)" :key="c.id" type="button" data-topic-card class="g-plain flex min-w-0 flex-col items-start gap-1.5 rounded-xl border-2 bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06]" :class="lv.ring" :disabled="!s.data.value" @click="startTopic(c, endCourse)">
            <span class="flex w-full items-center gap-2">
              <b class="min-w-0 truncate text-[16px] text-[var(--exile-color-text-title)]">{{ t2(c.title) }}</b>
              <span class="ml-auto shrink-0 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`${c.steps.length} 手`, `${c.steps.length} steps`) }}</span>
            </span>
            <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ t2(c.learn) }}</span>
            <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("使うベース", "Base") }}: {{ baseName(c.base) }}</span>
          </button>
        </div>
      </div>
    </template>
    <div class="flex flex-col gap-2">
      <p class="flex items-center gap-2"><span class="rounded px-2 py-0.5 text-[12px] font-bold bg-violet-500/25 text-violet-100">{{ tr("実践", "Practice") }}</span><span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("動画のクラフトを、必ず付く手だけで作る", "Recreate video crafts with sure moves only") }}</span></p>
      <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <button v-for="c in CRAFT_COURSES" :key="c.id" type="button" data-course-card class="g-plain flex min-w-0 flex-col items-start gap-1.5 rounded-xl border-2 border-violet-400/40 bg-white/[0.03] px-4 py-3 text-left transition hover:border-violet-300 hover:bg-white/[0.06]" :disabled="!s.data.value" @click="startCourse(c)">
          <span class="flex w-full items-center gap-2">
            <span class="rounded bg-violet-500/25 px-2 py-0.5 text-[11px] font-bold text-violet-100">{{ t2(c.part) }}</span>
            <b class="min-w-0 truncate text-[15px] text-[var(--exile-color-text-title)]">{{ baseName(c.recipe.base) }}</b>
            <span class="ml-auto shrink-0 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`MOD ${courseSlots(c).length} つ`, `${courseSlots(c).length} mods`) }}</span>
          </span>
          <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("覚えること", "You learn") }}: {{ t2(c.learn) }}</span>
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("元の動画", "From") }}: {{ t2(c.video.title) }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<!--
  StageCourseGuide.vue — クラフトのコースの案内 (2026-10-17、[[craft-courses.ts]] / [[craft-course.ts]])。
  エミュレーターの横に「付ける順番」(✓ 済み / ▶ 今 / ○ まだ) と、今の段の「これで狙う」を出す。
  アイコンを押すとその物を持ち、お告げも掛かる。打つのはいつものエミュレーター (作り方は自由。オーナー「付ける順番だけ教えて作り方は自由」)
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { course, courseDone, courseSteps, endCourse } from "../../state/craft-course";
import { aimLabel } from "../../services/craft-stage/mod-list";
import { tr } from "../../i18n/lang";
import { displayCurrency } from "../../state/display-currency";
import Icon from "../../components/ui/Icon.vue";
import type { CourseUse } from "../../services/craft-stage/craft-courses";
import type { JaEn } from "../../services/craft-stage/quiz-tutorials";
import type { QuizSlot } from "../../services/craft-stage/quiz-recipe";

const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVEL: Record<number, { label: JaEn; chip: string }> = {
  1: { label: ["入門", "Intro"], chip: "bg-emerald-500/25 text-emerald-100" },
  2: { label: ["初級", "Easy"], chip: "bg-sky-500/25 text-sky-100" },
  3: { label: ["中級", "Medium"], chip: "bg-amber-500/25 text-amber-100" },
  4: { label: ["上級", "Hard"], chip: "bg-rose-500/25 text-rose-100" },
};
const SIDE: Record<QuizSlot["side"], JaEn> = { prefix: ["プレフィックス", "Prefix"], suffix: ["サフィックス", "Suffix"] };
/** 段の見出し (MOD の名前。何でも良い札は「何でも」) */
function stepTitle(i: number): string {
  const x = courseSteps.value[i]!.step;
  if (x.title) return t2(x.title);
  return (x.slots ?? []).map((sl) => (sl.mods.length ? aimLabel(s.data.value, { ...sl.mods[0]!, label: sl.mods[0]!.modId }).replace(/ \((T\d+ 以上|T\d+\+)\)$/, "") : tr("何でも", "Anything"))).join(" / ");
}
const sideOf = (i: number): string => { const sl = courseSteps.value[i]!.step.slots?.[0]; return sl && sl.mods.length ? t2(SIDE[sl.side]) : ""; };
/** 押すと持つ (お告げも掛ける)。発現は棚に無いので押せない */
function holdUse(u: CourseUse): void {
  if (u.key === "reveal") return;
  s.hold(u.key);
  for (const o of u.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
const nameOfUse = (u: CourseUse): string => (u.key === "reveal" ? tr("発現で選ぶ", "Pick on reveal") : [nameOf(u.key), ...(u.omens ?? []).map(nameOf)].join(" + "));
/** 打った数と費用 (エミュレーターの工程の累計) */
const steps = computed(() => s.log.value.length);
const cost = computed(() => s.log.value[s.log.value.length - 1]?.out.cost.cumulative ?? 0);
</script>

<template>
  <section v-if="course" data-course-guide class="g-panel p-3 text-[12px]">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="LEVEL[course.level]!.chip">{{ t2(LEVEL[course.level]!.label) }}</span>
      <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("付ける順番", "Order to add") }}</b>
      <a :href="`https://www.youtube.com/watch?v=${course.video.id}`" target="_blank" rel="noopener" class="text-[11px] text-[var(--exile-color-text-tertiary)] underline-offset-2 hover:underline">{{ t2(course.video.title) }}</a>
      <button type="button" class="g-btn sm ml-auto" @click="endCourse">{{ tr("コースをやめる", "Quit course") }}</button>
    </header>
    <p class="mt-1 text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("作り方は自由。順番とおすすめの狙い方だけ案内します。アイコンを押すとその物を持ちます", "Craft however you like. This only shows the order and a suggested way; click an icon to hold it") }}</p>

    <ol class="mt-2 flex flex-col gap-1.5">
      <li v-for="(x, i) in courseSteps" :key="i" class="rounded-lg border px-2.5 py-2" :class="x.done ? 'border-emerald-400/40 bg-emerald-500/[0.08]' : x.current ? 'border-amber-300/70 bg-amber-500/[0.10]' : 'border-white/10 bg-black/10 opacity-70'">
        <p class="flex min-w-0 items-center gap-2">
          <span class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" :class="x.done ? 'bg-emerald-400 text-black' : x.current ? 'bg-amber-400 text-black' : 'border border-white/30 text-white/60'">{{ x.done ? "✓" : i + 1 }}</span>
          <span v-if="sideOf(i)" class="shrink-0 rounded px-1 text-[10px] text-[var(--exile-color-text-tertiary)] ring-1 ring-white/15">{{ sideOf(i) }}</span>
          <span class="min-w-0 flex-1 text-[13px]" :class="x.done ? 'text-emerald-100' : 'text-[var(--exile-color-text-primary)]'">{{ stepTitle(i) }}</span>
          <span v-if="x.step.slots?.[0]?.kind === 'desecrated'" class="shrink-0 rounded bg-rose-500/20 px-1 text-[10px] text-rose-200">{{ tr("冒涜", "Desecrated") }}</span>
          <span v-else-if="x.step.slots?.[0]?.kind === 'essence'" class="shrink-0 rounded bg-violet-500/20 px-1 text-[10px] text-violet-200">{{ tr("エッセンス", "Essence") }}</span>
        </p>
        <!-- 今の段: これで狙う -->
        <div v-if="x.current" class="mt-2">
          <p class="text-[11px] font-bold text-amber-200">{{ tr("これで狙う", "Aim with") }}</p>
          <div class="mt-1 flex flex-wrap gap-1.5">
            <button v-for="(u, k) in x.step.how" :key="k" type="button" data-course-use class="g-plain flex items-center gap-1 rounded-md border border-amber-300/40 bg-black/30 px-2 py-1 text-left hover:bg-amber-500/15" :class="u.key === 'reveal' ? 'cursor-default' : ''" :title="u.key === 'reveal' ? '' : tr('押すと持つ (お告げも掛ける)', 'Click to hold (omens applied too)')" @click="holdUse(u)">
              <span v-if="k > 0" class="text-[11px] text-[var(--exile-color-text-tertiary)]">→</span>
              <img v-if="u.key !== 'reveal' && iconOf(u.key)" :src="iconOf(u.key)" alt="" class="size-6 shrink-0 object-contain" />
              <Icon v-else name="sparkles" class="size-5 shrink-0 text-violet-200" />
              <img v-for="o in u.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="size-5 shrink-0 object-contain" />
              <span class="text-[12px] text-[var(--exile-color-text-primary)]">{{ nameOfUse(u) }}</span>
            </button>
          </div>
          <p class="mt-1.5 text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ t2(x.step.why) }}</p>
          <div v-if="x.step.miss" class="mt-1.5 rounded-md bg-rose-500/[0.08] px-2 py-1.5">
            <p class="text-[11px] font-bold text-rose-200">{{ tr("外れたら", "On a miss") }}</p>
            <p class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ x.step.miss.how.map(nameOfUse).join(" → ") }} · {{ t2(x.step.miss.why) }}</p>
          </div>
        </div>
      </li>
    </ol>

    <div v-if="courseDone" data-course-done class="mt-3 rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-3">
      <p class="text-[18px] font-black text-amber-100">{{ tr("完成! おめでとう", "Done! Well crafted") }}</p>
      <p class="mt-0.5 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr(`${steps} 手 · ${displayCurrency.money(cost)} で完成`, `Finished in ${steps} steps for ${displayCurrency.money(cost)}`) }}</p>
    </div>
    <ul v-if="course.assumed?.length" class="mt-2 list-disc pl-4 text-[11px] text-amber-200/70">
      <li v-for="(a, i) in course.assumed" :key="i">{{ t2(a) }}</li>
    </ul>
  </section>
</template>

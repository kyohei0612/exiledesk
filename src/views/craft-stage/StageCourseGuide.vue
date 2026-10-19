<!--
  StageCourseGuide.vue — クラフトのコースの案内 (2026-10-17、[[craft-courses.ts]] / [[craft-course.ts]])。
  エミュレーターの横に「付ける順番」(✓ 済み / 今 / まだ) と「今やる手」(今の状況に当たるレシピの手) を出す。
  アイコンを押すとその物を持ち、お告げも掛かる。打つのはいつものエミュレーター (作り方は自由。オーナー「付ける順番だけ教えて作り方は自由」)
-->
<script setup lang="ts">
import { computed } from "vue";
// 一番外が 2 つ (トピックの案内・コースの案内) なので、呼ぶ側の class は受け取らない (今まで付いていなかった物。Vue の警告だけ消す。2026-10-19 モンキーテスト)
defineOptions({ inheritAttrs: false });
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { course, courseBases, courseView, restartCourse } from "../../state/craft-course";
import { aimLabel } from "../../services/craft-stage/mod-list";
import { tr } from "../../i18n/lang";
import { displayCurrency } from "../../state/display-currency";
import Icon from "../../components/ui/Icon.vue";
import StageTopicGuide from "./StageTopicGuide.vue";
import { quitLesson } from "../../state/craft-lesson";
import { topic } from "../../state/craft-topic";
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
const KIND: Partial<Record<QuizSlot["kind"], { label: JaEn; cls: string }>> = {
  fractured: { label: ["固定", "Fractured"], cls: "bg-sky-500/20 text-sky-200" },
  desecrated: { label: ["冒涜", "Desecrated"], cls: "bg-rose-500/20 text-rose-200" },
  essence: { label: ["エッセンス", "Essence"], cls: "bg-violet-500/20 text-violet-200" },
  crafted: { label: ["作った", "Crafted"], cls: "bg-violet-500/20 text-violet-200" },
};
const modName = (m: QuizSlot["mods"][number]): string => (m.minTierIndex === 0 ? aimLabel(s.data.value, { ...m, label: m.modId }).replace(/ \((T\d+ 以上|T\d+\+)\)$/, "") : aimLabel(s.data.value, { ...m, label: m.modId }));
const slotName = (sl: QuizSlot): string => (!sl.mods.length ? tr("何でも", "Anything") : sl.mods.length > 1 ? tr("次のどれか", "Any of these") : modName(sl.mods[0]!));

/** 付ける順番の行: 同じ側の「何でも」はまとめて 1 行 (× N、付いた数) */
const rows = computed(() => {
  const v = courseView.value;
  if (!v) return [];
  const out: Array<{ sl: QuizSlot; n: number; okN: number; current: boolean }> = [];
  for (const x of v.slots) {
    const prev = out[out.length - 1];
    if (prev && !x.sl.mods.length && !prev.sl.mods.length && prev.sl.side === x.sl.side) { prev.n++; if (x.done) prev.okN++; prev.current ||= x.current; continue; }
    out.push({ sl: x.sl, n: 1, okN: x.done ? 1 : 0, current: x.current });
  }
  return out.map((r) => ({ ...r, done: r.okN === r.n }));
});
const move = computed(() => courseView.value?.move ?? null);
const action = computed(() => move.value?.action ?? null);
const why = computed(() => { const m = move.value, c = course.value; return m && c ? c.why[m.index] ?? null : null; });
/** 今やる手で使う物 (カレンシー + お告げ) */
const keys = computed(() => { const a = action.value; return a && "use" in a ? [a.use, ...(a.omens ?? [])] : []; });
/** 押すと持つ (お告げも掛ける) */
function holdIt(): void {
  const a = action.value;
  if (!a || !("use" in a)) return;
  s.hold(a.use);
  for (const o of a.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
/** 発現の前に反響のお告げを掛ける */
function echoes(): void { if (!s.omens.value.includes("OmenofAbyssalEchoes")) s.toggleOmen("OmenofAbyssalEchoes"); }
const steps = computed(() => s.log.value.length);
const cost = computed(() => s.log.value[s.log.value.length - 1]?.out.cost.cumulative ?? 0);
</script>

<template>
  <StageTopicGuide v-if="topic" />
  <section v-if="course && courseView" data-course-guide class="g-panel p-3 text-[12px]">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="LEVEL[course.level]!.chip">{{ t2(LEVEL[course.level]!.label) }}</span>
      <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ tr("付ける順番", "Order to add") }}</b>
      <a v-if="course.video.id" :href="`https://www.youtube.com/watch?v=${course.video.id}`" target="_blank" rel="noopener" class="text-[11px] text-[var(--exile-color-text-tertiary)] underline-offset-2 hover:underline">{{ t2(course.video.title) }}</a>
      <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ t2(course.video.title) }}</span>
      <button type="button" class="g-btn sm ml-auto" :title="tr('このベースに付く MOD (Tab でも開く)', 'Mods for this base (Tab also opens it)')" @click="s.modOverlay.value = true">{{ tr("MOD 一覧", "Mod list") }}</button>
      <button type="button" class="g-btn sm" @click="quitLesson">{{ tr("コースをやめる", "Quit course") }}</button>
    </header>
    <p class="mt-1 text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("作り方は自由。順番と、今の状況でのおすすめの手だけ案内します。アイコンを押すとその物を持ちます", "Craft however you like. This shows the order and a suggested move for the current state; click an icon to hold it") }}</p>

    <ol class="mt-2 flex flex-col gap-1">
      <li v-for="(x, i) in rows" :key="x.sl.id" class="flex min-w-0 flex-col gap-0.5 rounded-lg border px-2.5 py-1.5" :class="x.done ? 'border-emerald-400/40 bg-emerald-500/[0.08]' : x.current ? 'border-amber-300/70 bg-amber-500/[0.10]' : 'border-white/10 bg-black/10 opacity-75'">
        <p class="flex min-w-0 items-center gap-2">
          <span class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" :class="x.done ? 'bg-emerald-400 text-black' : x.current ? 'bg-amber-400 text-black' : 'border border-white/30 text-white/60'">{{ x.done ? "✓" : i + 1 }}</span>
          <span class="shrink-0 rounded px-1 text-[10px] text-[var(--exile-color-text-tertiary)] ring-1 ring-white/15">{{ t2(SIDE[x.sl.side]) }}</span>
          <span class="min-w-0 flex-1 truncate text-[13px]" :class="x.done ? 'text-emerald-100' : 'text-[var(--exile-color-text-primary)]'" :title="slotName(x.sl)">{{ slotName(x.sl) }}<template v-if="x.n > 1"> × {{ x.n }} <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">({{ x.okN }}/{{ x.n }})</span></template></span>
          <span v-if="KIND[x.sl.kind]" class="shrink-0 rounded px-1 text-[10px]" :class="KIND[x.sl.kind]!.cls">{{ t2(KIND[x.sl.kind]!.label) }}</span>
        </p>
        <ul v-if="x.sl.mods.length > 1" class="ml-7 text-[11px] text-[var(--exile-color-text-secondary)]">
          <li v-for="m in x.sl.mods" :key="m.modId" class="truncate">・{{ modName(m) }}</li>
        </ul>
      </li>
    </ol>

    <!-- 今やる手 -->
    <div v-if="action" data-course-move class="mt-3 rounded-lg border-2 border-amber-300/50 bg-amber-500/[0.08] px-3 py-2">
      <p class="text-[11px] font-bold text-amber-200">{{ tr("今やる手", "Next move") }}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <button v-if="'use' in action" type="button" data-course-hold class="g-plain flex items-center gap-1 rounded-md border border-amber-300/50 bg-black/30 px-2 py-1 hover:bg-amber-500/15" :title="tr('押すと持つ (お告げも掛ける)', 'Click to hold (omens applied too)')" @click="holdIt">
          <img v-for="k in keys" :key="k" :src="iconOf(k)" alt="" class="size-6 shrink-0 object-contain" />
          <span class="text-[13px] text-[var(--exile-color-text-primary)]">{{ keys.map(nameOf).join(" + ") }}</span>
        </button>
        <template v-else-if="'reveal' in action">
          <span class="flex items-center gap-1 text-[13px] text-[var(--exile-color-text-primary)]"><Icon name="sparkles" class="size-5 text-violet-200" />{{ tr("発現して、完成の形にある MOD を選ぶ", "Reveal and pick the mod in the order list") }}</span>
          <button v-if="action.reveal.echoes" type="button" class="g-btn sm" @click="echoes">{{ tr("先にアビスの反響のお告げを掛ける", "Apply Omen of Abyssal Echoes first") }}</button>
        </template>
        <button v-else type="button" data-course-restart class="g-btn sm" @click="restartCourse">{{ tr("次のベースを買って作り直す", "Buy the next base and start over") }}</button>
      </div>
      <p v-if="why" class="mt-1.5 text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ t2(why) }}</p>
    </div>
    <p v-else-if="!courseView.done" class="mt-3 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("この状況のおすすめの手はありません。1 手戻すか、作り直してください", "No suggested move for this state. Undo a step or start over") }}</p>

    <div v-if="courseView.done" data-course-done class="mt-3 rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-3">
      <p class="text-[18px] font-black text-amber-100">{{ tr("完成! おめでとう", "Done! Well crafted") }}</p>
      <p class="mt-0.5 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr(`${steps} 手 · ${displayCurrency.money(cost)} · ベース ${courseBases} 個で完成`, `Finished in ${steps} steps for ${displayCurrency.money(cost)} with ${courseBases} base${courseBases === 1 ? "" : "s"}`) }}</p>
    </div>
    <ul v-if="course.assumed.length" class="mt-2 list-disc pl-4 text-[11px] text-amber-200/70">
      <li v-for="(a, i) in course.assumed" :key="i">{{ t2(a) }}</li>
    </ul>
  </section>
</template>

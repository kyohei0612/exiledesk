<!--
  StageCourses.vue — クラフトのコースの一覧 (2026-10-17)。
  入門〜中級は「動作を学ぶコース」([[topic-courses.ts]]、タイトルは学べる動作)、その下に「実践」として動画のクラフトを作るコース ([[craft-courses.ts]])。
  どれからでも始められる。押すとエミュレーターで始まり、横に案内が出る
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { startCourse } from "../../state/tutorial/craft-course";
import { cleared, startTopicAt } from "../../state/tutorial/craft-lesson";
import { iconOf, nameOf } from "../../state/craft-stage";
import { freshItem } from "../../services/craft-stage/engine";
import { CRAFT_COURSES, courseSlots } from "../../services/tutorial/craft-courses";
import { TOPIC_COURSES, topicKey, type TopicCourse, type TopicStep } from "../../services/tutorial/topic-courses";
import { baseNameOf, tr } from "../../i18n/lang";
import { jaTypeName } from "../../services/trade2/localize";
import Icon from "../../components/ui/Icon.vue";
import type { JaEn } from "../../services/tutorial/quiz-tutorials";
import { courseShown as shown } from "../../services/tutorial/course-release";
import { flag } from "../../web/release-flags";
const PRACTICE_OPEN = false;

const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVELS: Array<{ n: 1 | 2 | 3 | 4 | 5; label: JaEn; note: JaEn; chip: string; bar: string; band: string; num: string; text: string }> = [
  { n: 1, label: ["入門", "Intro"], note: ["はじめての人はここから", "Start here"], chip: "bg-emerald-500/25 text-emerald-100", bar: "bg-emerald-400/70", band: "bg-gradient-to-r from-emerald-500/25 via-emerald-500/10 to-transparent", num: "bg-emerald-400 text-black", text: "text-emerald-100" },
  { n: 2, label: ["初級", "Easy"], note: ["冒涜とお告げ", "Desecration and omens"], chip: "bg-sky-500/25 text-sky-100", bar: "bg-sky-400/70", band: "bg-gradient-to-r from-sky-500/25 via-sky-500/10 to-transparent", num: "bg-sky-400 text-black", text: "text-sky-100" },
  { n: 3, label: ["中級", "Medium"], note: ["カタリストと液化した感情", "Catalysts and liquid emotions"], chip: "bg-amber-500/25 text-amber-100", bar: "bg-amber-400/70", band: "bg-gradient-to-r from-amber-500/25 via-amber-500/10 to-transparent", num: "bg-amber-400 text-black", text: "text-amber-100" },
  { n: 4, label: ["上級", "Advanced"], note: ["損をせずに確率を上げる小技", "Tricks to raise your odds without wasting currency"], chip: "bg-rose-500/25 text-rose-100", bar: "bg-rose-400/70", band: "bg-gradient-to-r from-rose-500/25 via-rose-500/10 to-transparent", num: "bg-rose-400 text-black", text: "text-rose-100" },
  // クラフト手順: 完成品までを 1 手ずつ (2026-10-20 要望 93d00e7c。topic-courses-guide.ts)
  { n: 5, label: ["クラフト手順", "Crafting guides"], note: ["完成品までの手順を 1 手ずつ", "Step by step to a finished item"], chip: "bg-violet-500/25 text-violet-100", bar: "bg-violet-400/70", band: "bg-gradient-to-r from-violet-500/25 via-violet-500/10 to-transparent", num: "bg-violet-400 text-black", text: "text-violet-100" },
];
const baseName = (b: string): string => baseNameOf({ base: b, baseJa: jaTypeName(b) });
/** 出すコース (段の順のまま) と、そのうちクリアした数 (上の進み具合) */
const shownCourses = computed(() => TOPIC_COURSES.filter(shown));
const clearedCount = computed(() => shownCourses.value.filter((c) => cleared.value.has(`topic:${c.id}`)).length);
/** カードのアイコン: 1 手目のカレンシー (エッセンスはそのベースの棚の物) */
function courseIcon(c: TopicCourse): string {
  if (c.icon) return iconOf(c.icon);
  const st = c.steps[0], d = s.data.value;
  if (!st || !d) return "";
  const key = st.use.startsWith("ess:") ? topicKey(st, d, freshItem(d, st.base ?? c.base, c.itemLevel)) : st.use;
  return key ? iconOf(key) : "";
}
/** 手の一覧を開いているコース (既定は閉じる。押すと開く。2026-10-17 オーナー「全部出したらバカでしょ、コース一覧を見るで見れるように」) */
/** 開けるのは 1 つだけ。そのカードの外を押したら閉じる (オーナー「他の動作したら閉じる、開きっぱなしは品が無い」) */
const openSteps = ref<string | null>(null);
/** 説明 (learn) を開いているコース (既定は閉じる。題と手数だけ。2026-10-20 UI 点検 13) */
const openLearn = ref<Set<string>>(new Set());
/** 説明を閉じる形 (d1c97969)。本番の作りでは前の形 (スイッチ tutorialUi) */
const learnFold = flag("tutorialUi");
function toggleLearn(id: string): void { const n = new Set(openLearn.value); if (!n.delete(id)) n.add(id); openLearn.value = n; }
function toggleSteps(id: string): void { openSteps.value = openSteps.value === id ? null : id; }
function closeOutside(e: PointerEvent): void {
  if (!openSteps.value) return;
  const box = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-topic-card-box]");
  if (box?.dataset.course !== openSteps.value) openSteps.value = null;
}
onMounted(() => document.addEventListener("pointerdown", closeOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeOutside));
/** カードの手の一覧の名前 (エッセンスはそのコースのベースの棚から引く) */
function stepLabel(c: TopicCourse, st: TopicStep): string {
  if (st.use === "reset") return tr("白に戻す", "Reset to white");
  if (st.use === "reveal") return tr("発現", "Reveal");
  const d = s.data.value;
  const key = st.use.startsWith("ess:") ? (d ? topicKey(st, d, freshItem(d, st.base ?? c.base, c.itemLevel)) : null) : st.use;
  return [key ? nameOf(key) : st.use.split(":")[1] ?? st.use, ...[...(st.omens ?? []), ...(st.chain ?? []).flatMap((c) => c.omens ?? [])].map(nameOf)].join(" + "); // 続きの手のお告げも (骨 + 反響)
}
</script>

<template>
  <section data-courses class="flex flex-col gap-5">
    <!-- 上: 一言と進み具合 (前は説明だけの大きな箱だった。2026-10-18 オーナー「UI が全体的にブス、枠の大きさとか」) -->
    <header class="flex flex-wrap items-end gap-x-6 gap-y-2 px-1">
      <div class="min-w-0">
        <p class="font-display text-[18px] tracking-wider text-[var(--exile-color-text-title)]">{{ tr("クラフトのコース", "Crafting courses") }}</p>
        <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("どのコースからでも始められます。", "Start with any course.") }}<!-- 上の題の下の文と同じ事を書いていたので短く (2026-10-18) --></p>
      </div>
      <div class="ml-auto flex w-56 shrink-0 flex-col gap-1 max-md:ml-0 max-md:w-full" data-courses-progress>
        <p class="flex items-baseline justify-between text-[11px] text-[var(--exile-color-text-tertiary)]"><span>{{ tr("クリア", "Cleared") }}</span><span class="tabular-nums text-[13px] font-bold text-amber-200">{{ clearedCount }} / {{ shownCourses.length }}</span></p>
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-500" :style="{ width: `${shownCourses.length ? (clearedCount / shownCourses.length) * 100 : 0}%` }" /></div>
      </div>
    </header>
    <!-- 段ごとに 1 行: 左に段の札、右にカード (同じ高さにそろえる) -->
    <template v-for="lv in LEVELS.filter((x) => shownCourses.some((c) => c.level === x.n))" :key="lv.n">
      <div class="flex flex-col gap-2.5">
        <!-- 段の見出しは横いっぱいの帯 (左の小さな札だと、どれが入門か分からなかった。2026-10-18 オーナー「どれが入門かもわからん」) -->
        <div class="flex items-center gap-3 rounded-md px-3 py-2" :class="lv.band">
          <span class="grid size-7 shrink-0 place-items-center rounded-full font-display text-[15px] font-bold" :class="lv.num">{{ lv.n }}</span>
          <span class="font-display text-[18px] font-bold tracking-wider" :class="lv.text">{{ t2(lv.label) }}</span>
          <span class="min-w-0 truncate text-[12px] text-[var(--exile-color-text-secondary)]">{{ t2(lv.note) }}</span>
        </div>
        <div class="grid grid-cols-2 items-stretch gap-3 max-lg:grid-cols-1">
          <!-- カード: 進めるのは「始める」と「手の一覧」の 2 つだけ (2026-10-17 オーナー「基本その 2 ボタンで進行」) -->
          <div v-for="c in shownCourses.filter((x) => x.level === lv.n)" :key="c.id" data-topic-card-box :data-course="c.id"
            class="relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-black/30 transition"
            :class="cleared.has(`topic:${c.id}`) ? 'border-amber-400/45' : 'border-white/10 hover:border-white/20'">
            <!-- 左端の細い帯が段の色 (縁全体を色にすると派手すぎた) -->
            <span class="absolute inset-y-0 left-0 w-1" :class="lv.bar" aria-hidden="true" />
            <div data-topic-card class="flex min-w-0 flex-1 gap-3 py-3 pl-5 pr-4">
              <!-- コースのカレンシーのアイコン (1 手目の物) -->
              <span class="grid size-14 shrink-0 place-items-center rounded-md border border-white/10 bg-black/40">
                <img v-if="courseIcon(c)" :src="courseIcon(c)" alt="" class="size-11 object-contain" draggable="false" />
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="flex min-w-0 items-center gap-2">
                  <b class="min-w-0 truncate font-display text-[16px] tracking-wide text-[var(--exile-color-text-title)]">{{ t2(c.title) }}</b>
                  <span class="shrink-0 rounded px-1.5 py-px text-[10px] font-bold" :class="lv.chip">{{ t2(lv.label) }}</span>
                  <span v-if="cleared.has(`topic:${c.id}`)" data-cleared class="shrink-0 rounded bg-amber-400 px-1.5 py-px text-[10px] font-black text-black">{{ tr("クリア", "Cleared") }}</span>
                </span>
                <!-- 本番の作り (スイッチ tutorialUi が切れている) は前の形: 説明 2 行 + 下の帯に手数 -->
                <span v-if="!learnFold" class="line-clamp-2 text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]" :title="t2(c.learn)">{{ t2(c.learn) }}</span>
                <span v-if="learnFold" class="flex min-w-0 items-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`${c.steps.length} 手`, `${c.steps.length} steps`) }}
                  <button type="button" data-topic-learn-toggle class="g-plain inline-flex items-center gap-0.5 rounded px-1 hover:bg-white/5" :aria-expanded="openLearn.has(c.id)" @click="toggleLearn(c.id)"><Icon :name="openLearn.has(c.id) ? 'chevron-up' : 'chevron-down'" class="size-3.5" />{{ tr("説明", "About") }}</button></span>
                <span v-if="learnFold && openLearn.has(c.id)" data-topic-learn class="text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ t2(c.learn) }}</span>
              </div>
            </div>
            <div class="mt-auto flex flex-wrap items-center gap-2 bg-black/25 py-2 pl-5 pr-3">
              <span class="min-w-0 truncate max-md:w-full text-[11px] text-[var(--exile-color-text-tertiary)]"><template v-if="!learnFold">{{ tr(`${c.steps.length} 手`, `${c.steps.length} steps`) }} · </template>{{ baseName(c.base) }}</span>
              <span class="ml-auto flex shrink-0 items-center gap-2">
                <button type="button" data-topic-card-toggle class="g-btn sm inline-flex items-center gap-1" :aria-expanded="openSteps === c.id" @click="toggleSteps(c.id)"><Icon :name="openSteps === c.id ? 'chevron-up' : 'chevron-down'" class="size-3.5" />{{ tr("手の一覧", "Steps") }}</button>
                <button type="button" data-topic-start class="g-btn-red sm" :disabled="!s.data.value" @click="startTopicAt(c, 0)">{{ tr("始める", "Start") }}</button>
              </span>
            </div>
            <div v-if="openSteps === c.id" class="bg-black/25 px-3 pb-2">
              <p class="px-1.5 pb-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("押すとその手から始める", "Click a step to start there") }}</p>
              <ol data-topic-card-steps class="columns-2 gap-x-2">
                <li v-for="(st, i) in c.steps" :key="i" class="mb-0.5 break-inside-avoid">
                  <button type="button" class="g-plain flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-white/5" :disabled="!s.data.value" :title="tr('この手から始める', 'Start from this step')" @click="startTopicAt(c, i)">
                    <span class="w-5 shrink-0 text-right text-[10px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ i + 1 }}</span>
                    <span class="min-w-0 flex-1 truncate text-[12px] text-[var(--exile-color-text-secondary)] max-md:whitespace-normal max-md:text-[11px] max-md:leading-tight">{{ stepLabel(c, st) }}</span>
                  </button>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-if="PRACTICE_OPEN" class="flex flex-col gap-2">
      <p class="flex items-center gap-2"><span class="rounded px-2 py-0.5 text-[12px] font-bold bg-violet-500/25 text-violet-100">{{ tr("実践", "Practice") }}</span><span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("動画のクラフトを、必ず付く手だけで作る", "Recreate video crafts with sure moves only") }}</span></p>
      <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <button v-for="c in CRAFT_COURSES" :key="c.id" type="button" data-course-card class="g-plain flex min-w-0 flex-col items-start gap-1.5 rounded-xl border-2 border-violet-400/40 bg-white/[0.03] px-4 py-3 text-left transition hover:border-violet-300 hover:bg-white/[0.06]" :disabled="!s.data.value" @click="startCourse(c)">
          <span class="flex w-full items-center gap-2">
            <span class="rounded bg-violet-500/25 px-2 py-0.5 text-[11px] font-bold text-violet-100">{{ t2(c.part) }}</span>
            <b class="min-w-0 truncate text-[15px] text-[var(--exile-color-text-title)]">{{ baseName(c.recipe.base) }}</b>
            <span v-if="cleared.has(`course:${c.id}`)" data-cleared class="shrink-0 rounded bg-amber-400 px-2 py-0.5 text-[11px] font-black text-black">{{ tr("クリア", "Cleared") }}</span>
            <span class="ml-auto shrink-0 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`MOD ${courseSlots(c).length} つ`, `${courseSlots(c).length} mods`) }}</span>
          </span>
          <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("覚えること", "You learn") }}: {{ t2(c.learn) }}</span>
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("元の動画", "From") }}: {{ t2(c.video.title) }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

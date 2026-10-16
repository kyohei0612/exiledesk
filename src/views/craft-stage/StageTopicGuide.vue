<!--
  StageTopicGuide.vue — 動作を学ぶコースの案内 (2026-10-17、[[topic-courses.ts]] / [[craft-topic.ts]])。
  並べた手を 1 つずつ。今の手のアイコンを押すと持つ (お告げも掛ける)。説明は手の一言 + エミュレーターのカードの「このステージでの動き」、
  前の手で何が起きたか (付いた / 消えた MOD) も出す。名前・説明はエミュレーターの物 (nameOf / stageHelp)
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { endTopic, goTopic, topic, topicAt, topicDone, topicReset, topicStep } from "../../state/craft-topic";
import { stageHelp } from "../../state/craft-stage-help";
import { modText, tr } from "../../i18n/lang";
import Icon from "../../components/ui/Icon.vue";
import type { JaEn } from "../../services/craft-stage/quiz-tutorials";
import type { TopicStep } from "../../services/craft-stage/topic-courses";

const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVEL: Record<number, { label: JaEn; chip: string }> = {
  1: { label: ["入門", "Intro"], chip: "bg-emerald-500/25 text-emerald-100" },
  2: { label: ["初級", "Easy"], chip: "bg-sky-500/25 text-sky-100" },
  3: { label: ["中級", "Medium"], chip: "bg-amber-500/25 text-amber-100" },
};
/** 手の名前 (エミュレーターの名前。白に戻す・発現は言葉で) */
function stepName(st: TopicStep): string {
  const main = st.use === "reset" ? tr("白に戻す", "Reset to white") : st.use === "reveal" ? tr("発現", "Reveal") : st.use.startsWith("ess:") ? (s.item.value && topicStep.value?.step === st && topicStep.value.key ? nameOf(topicStep.value.key) : st.use.split(":")[1]!) : nameOf(st.use);
  return [main, ...(st.omens ?? []).map(nameOf)].join(" + ");
}
const iconOfStep = (st: TopicStep): string => (st.use === "reset" || st.use === "reveal" ? "" : st.use.startsWith("ess:") ? (topicStep.value?.step === st && topicStep.value.key ? iconOf(topicStep.value.key) : "") : iconOf(st.use));
/** 今の手のカレンシーとお告げのカードの「このステージでの動き」 */
const help = computed(() => {
  const cur = topicStep.value;
  if (!cur) return [];
  const keys = [...(cur.key && cur.step.use !== "reveal" ? [cur.key] : []), ...(cur.step.omens ?? [])];
  return keys.map((k) => ({ k, lines: stageHelp(k, s.data.value, s.item.value) })).filter((x) => x.lines.length);
});
const parts = (line: string): Array<{ t: string; b: boolean }> => line.split("**").map((t, i) => ({ t, b: i % 2 === 1 }));
/** 押すと持つ (お告げも掛ける)。発現の反響は掛けるだけ */
function holdIt(): void {
  const cur = topicStep.value;
  if (!cur) return;
  if (cur.step.use !== "reveal" && cur.key) s.hold(cur.key);
  for (const o of cur.step.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
const last = computed(() => s.log.value[s.log.value.length - 1] ?? null);
</script>

<template>
  <section v-if="topic" data-topic-guide class="g-panel p-3 text-[12px]">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="LEVEL[topic.level]!.chip">{{ t2(LEVEL[topic.level]!.label) }}</span>
      <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ t2(topic.title) }}</b>
      <span class="tabular-nums text-[11px] text-[var(--exile-color-text-tertiary)]">{{ Math.min(topicAt, topic.steps.length) }} / {{ topic.steps.length }}</span>
      <button type="button" class="g-btn sm ml-auto" @click="endTopic">{{ tr("コースをやめる", "Quit course") }}</button>
    </header>
    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-500" :style="{ width: `${(topicAt / topic.steps.length) * 100}%` }" /></div>

    <!-- 今の手 -->
    <div v-if="topicStep" data-topic-now class="mt-3 rounded-lg border-2 border-amber-300/50 bg-amber-500/[0.08] px-3 py-2">
      <p class="text-[11px] font-bold text-amber-200">{{ tr(`${topicAt + 1} 手目: これを使ってみる`, `Step ${topicAt + 1}: try this`) }}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <button v-if="topicStep.step.use === 'reset'" type="button" data-topic-reset class="g-btn sm" @click="topicReset">{{ tr("白に戻す", "Reset to white") }}</button>
        <button v-else type="button" data-topic-hold class="g-plain flex items-center gap-1 rounded-md border border-amber-300/50 bg-black/30 px-2 py-1 hover:bg-amber-500/15" :title="tr('押すと持つ (お告げも掛ける)', 'Click to hold (omens applied too)')" @click="holdIt">
          <img v-if="iconOfStep(topicStep.step)" :src="iconOfStep(topicStep.step)" alt="" class="size-7 shrink-0 object-contain" />
          <Icon v-else name="sparkles" class="size-6 shrink-0 text-violet-200" />
          <img v-for="o in topicStep.step.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="size-6 shrink-0 object-contain" />
          <span class="text-[13px] text-[var(--exile-color-text-primary)]">{{ stepName(topicStep.step) }}</span>
        </button>
        <span v-if="topicStep.step.use === 'reveal'" class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("アイテムの下の候補から 1 つ選ぶ", "Pick one of the options under the item") }}</span>
      </div>
      <p class="mt-1.5 text-[13px] leading-relaxed text-[var(--exile-color-text-primary)]">{{ t2(topicStep.step.note) }}</p>
      <div v-for="h in help" :key="h.k" class="mt-1.5 rounded-md bg-black/25 px-2.5 py-1.5">
        <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ nameOf(h.k) }}</p>
        <p v-for="(l, i) in h.lines" :key="i" class="flex gap-1.5 text-[12px] text-[#cfc6ae]"><span class="text-amber-300/60">・</span><span><template v-for="(p, j) in parts(l)" :key="j"><b v-if="p.b" class="text-white">{{ p.t }}</b><template v-else>{{ p.t }}</template></template></span></p>
      </div>
    </div>
    <div v-else-if="topicDone" data-topic-done class="mt-3 rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-3">
      <p class="text-[18px] font-black text-amber-100">{{ tr("全部使ってみた! おつかれさま", "You tried them all!") }}</p>
      <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("気になった手は、下の一覧から押すともう一度試せます", "Click any step below to try it again") }}</p>
    </div>

    <!-- 前の手で起きたこと -->
    <div v-if="last && topicAt > 0" class="mt-2 rounded-md bg-black/25 px-2.5 py-1.5">
      <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("前の手で起きたこと", "What the last move did") }}: {{ nameOf(last.out.currency) }}</p>
      <p v-for="(m, i) in last.added" :key="'a' + i" class="text-[12px] text-emerald-300">＋ {{ modText(m) }}</p>
      <p v-for="(m, i) in last.removed" :key="'r' + i" class="text-[12px] text-rose-300 line-through">－ {{ modText(m) }}</p>
      <p v-if="!last.added.length && !last.removed.length" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("MOD の出入りは無し (数値・品質・レアリティなどが変わる手)", "No mod added or removed (values, quality, rarity and so on changed)") }}</p>
    </div>

    <!-- 手の一覧 (押すとその手から) -->
    <ol class="mt-2 flex flex-col gap-0.5">
      <li v-for="(st, i) in topic.steps" :key="i">
        <button type="button" class="g-plain flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-white/5" :class="i === topicAt ? 'bg-amber-500/10' : ''" @click="goTopic(i)">
          <span class="grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold" :class="i < topicAt ? 'bg-emerald-400 text-black' : i === topicAt ? 'bg-amber-400 text-black' : 'border border-white/25 text-white/50'">{{ i < topicAt ? "✓" : "" }}</span>
          <span class="min-w-0 flex-1 truncate text-[12px]" :class="i < topicAt ? 'text-emerald-100/80' : 'text-[var(--exile-color-text-secondary)]'">{{ stepName(st) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>

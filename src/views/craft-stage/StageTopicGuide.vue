<!--
  StageTopicGuide.vue — 動作を学ぶコースの案内 (2026-10-17、[[topic-courses.ts]] / [[craft-topic.ts]])。
  並べた手を 1 つずつ。今の手のアイコンを押すと持つ (お告げも掛ける)。要点 1 行をカードの頭と同じ大きな枠で (下限・付く MOD も)、カードの「このステージでの動き」は「詳しく」に畳む。
  前の手で何が起きたか (付いた / 消えた MOD) も出す。名前・説明はエミュレーターの物 (nameOf / stageHelp)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { endTopic, goTopic, topic, topicAt, topicDone, topicReset, topicStep } from "../../state/craft-topic";
import { stageAdds, stageFloor, stageHelp } from "../../state/craft-stage-help";
import { modListFor } from "../../services/craft-stage/mod-list";
import Disclosure from "../../components/ui/Disclosure.vue";
import { modText, tr } from "../../i18n/lang";
import Icon from "../../components/ui/Icon.vue";
import type { JaEn } from "../../services/craft-stage/quiz-tutorials";
import { topicKey, type TopicStep } from "../../services/craft-stage/topic-courses";

const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVEL: Record<number, { label: JaEn; chip: string }> = {
  1: { label: ["入門", "Intro"], chip: "bg-emerald-500/25 text-emerald-100" },
  2: { label: ["初級", "Easy"], chip: "bg-sky-500/25 text-sky-100" },
  3: { label: ["中級", "Medium"], chip: "bg-amber-500/25 text-amber-100" },
};
/** エッセンスの手の実際のキー (今のアイテムの棚から。一覧の先の手も日本語の名前で出す) */
const essKey = (st: TopicStep): string | null => (s.item.value && s.data.value ? topicKey(st, s.data.value, s.item.value) : null);
/** 手の名前 (エミュレーターの名前。白に戻す・発現は言葉で) */
function stepName(st: TopicStep): string {
  const main = st.use === "reset" ? tr("白に戻す", "Reset to white") : st.use === "reveal" ? tr("発現", "Reveal") : st.use.startsWith("ess:") ? (essKey(st) ? nameOf(essKey(st)!) : st.use.split(":")[1]!) : nameOf(st.use);
  return [main, ...(st.omens ?? []).map(nameOf)].join(" + ");
}
const iconOfStep = (st: TopicStep): string => (st.use === "reset" || st.use === "reveal" ? "" : st.use.startsWith("ess:") ? (essKey(st) ? iconOf(essKey(st)!) : "") : iconOf(st.use));
/** 今の手のカレンシーとお告げのカードの「このステージでの動き」 */
const help = computed(() => {
  const cur = topicStep.value;
  if (!cur) return [];
  const keys = [...(cur.key && cur.step.use !== "reveal" ? [cur.key] : []), ...(cur.step.omens ?? [])];
  return keys.map((k) => ({ k, lines: stageHelp(k, s.data.value, s.item.value) })).filter((x) => x.lines.length);
});
/** カードの頭と同じ: 上級・完全の MOD レベルの下限と、付く MOD (エッセンス・ルーン・感情) */
const floor = computed(() => { const k = topicStep.value?.key; return k && topicStep.value?.step.use !== "reveal" ? stageFloor(k) : null; });
const adds = computed(() => { const k = topicStep.value?.key; return k && topicStep.value?.step.use !== "reveal" ? stageAdds(k, s.data.value, s.item.value) : null; });
/**
 * 上級・完全の例: このアイテムに出やすい MOD 1 つで、下限ぎりぎりで付く段と、すぐ下の付かない段 (エミュレーターの MOD 一覧の行から)。
 * 2026-10-17 オーナー「例も簡単に欲しい、これは付くけどこれは付かないみたいな」
 */
const example = computed(() => {
  const f = floor.value, d = s.data.value, it = s.item.value;
  if (!f || !d || !it) return null;
  const rows = modListFor(d, it).filter((r) => r.group === "normal" && !r.on && !r.blocked).sort((a, b) => b.weight - a.weight);
  // 行は同じ系統の MOD をまとめているので、MOD (modId) ごとの段で比べる
  for (const r of rows) for (const id of new Set(r.tiers.map((t) => t.modId))) {
    const ts = r.tiers.filter((t) => t.modId === id && t.ilvl <= s.itemLevel.value);
    const ok = [...ts].reverse().find((t) => t.ilvl >= f), ng = ts.find((t) => t.ilvl < f);
    if (ok && ng) return { ok, ng };
  }
  return null;
});
/** 細かい説明 (カードの「このステージでの動き」) は既定で閉じる */
const more = ref(false);
const parts = (line: string): Array<{ t: string; b: boolean }> => line.split("**").map((t, i) => ({ t, b: i % 2 === 1 }));
/** 押すと持つ (お告げも掛ける)。発現の反響は掛けるだけ */
function holdIt(): void {
  const cur = topicStep.value;
  if (!cur) return;
  if (cur.step.use !== "reveal" && cur.key) s.hold(cur.key);
  for (const o of cur.step.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
/** MOD 一覧の窓を開いて、その MOD の行へ (確認用。2026-10-17 オーナー「MOD 一覧もそこで出せるように」) */
function jump(modId: string): void { s.modOverlay.value = true; s.modJump.value = { modId, n: (s.modJump.value?.n ?? 0) + 1 }; }
const last = computed(() => s.log.value[s.log.value.length - 1] ?? null);
</script>

<template>
  <section v-if="topic" data-topic-guide class="g-panel p-3 text-[12px]">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="LEVEL[topic.level]!.chip">{{ t2(LEVEL[topic.level]!.label) }}</span>
      <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ t2(topic.title) }}</b>
      <span class="tabular-nums text-[11px] text-[var(--exile-color-text-tertiary)]">{{ Math.min(topicAt, topic.steps.length) }} / {{ topic.steps.length }}</span>
      <button type="button" data-topic-mods class="g-btn sm ml-auto" :title="tr('このベースに付く MOD (Tab でも開く)', 'Mods for this base (Tab also opens it)')" @click="s.modOverlay.value = true">{{ tr("MOD 一覧", "Mod list") }}</button>
      <button type="button" class="g-btn sm" @click="endTopic">{{ tr("コースをやめる", "Quit course") }}</button>
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
      <!-- 要点はエミュレーターのカードの頭と同じ大きな枠で (2026-10-17 オーナー「入門は要点でっかく表示のみ、文章長くてだるい」) -->
      <p data-topic-point class="mt-2 rounded-lg border border-amber-300/50 bg-amber-400/10 px-2.5 py-1.5 text-center text-[15px] font-bold text-amber-100">{{ t2(topicStep.step.note) }}</p>
      <p v-if="floor" class="mt-1.5 rounded-lg border border-amber-300/50 bg-amber-400/10 px-2.5 py-1.5 text-center text-[15px] font-bold text-amber-100">{{ tr(`MOD レベル ${floor} 以上だけ付く`, `Only mod level ${floor}+ tiers`) }}</p>
      <div v-if="example" data-topic-example class="mt-1.5 grid gap-0.5 rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px]">
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ tr("例", "Example") }}</p>
        <p class="text-emerald-200"><b>{{ tr("付く", "Can roll") }}</b> {{ example.ok.text }} <span class="text-[11px] text-emerald-200/70">({{ example.ok.rank }} · {{ tr(`MOD レベル ${example.ok.ilvl}`, `mod level ${example.ok.ilvl}`) }})</span></p>
        <p class="text-rose-300"><b>{{ tr("付かない", "Can't roll") }}</b> <span class="line-through">{{ example.ng.text }}</span> <span class="text-[11px] text-rose-300/70">({{ example.ng.rank }} · {{ tr(`MOD レベル ${example.ng.ilvl}`, `mod level ${example.ng.ilvl}`) }})</span></p>
      </div>
      <div v-if="adds" class="mt-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5">
        <p class="text-[10px] text-emerald-200/70">{{ adds.head }}</p>
        <p v-for="(l, i) in adds.lines" :key="i" class="text-[13px] font-semibold text-emerald-200">・{{ l }}</p>
      </div>
      <template v-if="help.length">
        <Disclosure v-model:open="more" kind="detail" class="mt-1.5" />
        <div v-if="more">
          <div v-for="h in help" :key="h.k" class="mt-1.5 rounded-md bg-black/25 px-2.5 py-1.5">
            <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ nameOf(h.k) }}</p>
            <p v-for="(l, i) in h.lines" :key="i" class="flex gap-1.5 text-[12px] text-[#cfc6ae]"><span class="text-amber-300/60">・</span><span><template v-for="(p, j) in parts(l)" :key="j"><b v-if="p.b" class="text-white">{{ p.t }}</b><template v-else>{{ p.t }}</template></template></span></p>
          </div>
        </div>
      </template>
    </div>
    <div v-else-if="topicDone" data-topic-done class="mt-3 rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-3">
      <p class="text-[18px] font-black text-amber-100">{{ tr("全部使ってみた! おつかれさま", "You tried them all!") }}</p>
      <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("気になった手は、下の一覧から押すともう一度試せます", "Click any step below to try it again") }}</p>
    </div>

    <!-- 前の手で起きたこと -->
    <div v-if="last && topicAt > 0" class="mt-2 rounded-md bg-black/25 px-2.5 py-1.5">
      <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("前の手で起きたこと", "What the last move did") }}: {{ nameOf(last.out.currency) }}</p>
      <button v-for="(m, i) in last.added" :key="'a' + i" type="button" class="g-plain block text-left text-[12px] text-emerald-300 hover:underline" :title="tr('MOD 一覧のこの行へ', 'Show in the mod list')" @click="jump(m.modId)">＋ {{ modText(m) }}</button>
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

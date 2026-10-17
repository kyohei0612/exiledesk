<!--
  StageTopicGuide.vue — 動作を学ぶコースの案内 (2026-10-17、[[topic-courses.ts]] / [[craft-topic.ts]])。
  並べた手を 1 つずつ。今の手のアイコンを押すと持つ (お告げも掛ける)。要点 1 行をカードの頭と同じ大きな枠で (下限・付く MOD も)、カードの「このステージでの動き」は「詳しく」に畳む。
  前の手で何が起きたか (付いた / 消えた MOD) も出す。名前・説明はエミュレーターの物 (nameOf / stageHelp)
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { canLessonBack, lessonBack, prepareStep, prepared } from "../../state/craft-lesson";
import { endTopic, goTopic, topic, topicAt, topicDone, topicNext, topicReset, topicStep, topicUsed } from "../../state/craft-topic";
import { stageAdds, stageFloor, stageHelp } from "../../state/craft-stage-help";
import { modListFor } from "../../services/craft-stage/mod-list";
import { currencyHoverOf } from "../../services/currency/currency-hover";
import { enOf } from "../../state/craft-stage-shelf";
import { modText, tr } from "../../i18n/lang";
import Icon from "../../components/ui/Icon.vue";
import type { JaEn } from "../../services/craft-stage/quiz-tutorials";
import { topicKey, type TopicStep } from "../../services/craft-stage/topic-courses";
import type { StageMod } from "../../services/craft-stage/types";

/** now = 今の手の枠 (棚の上) / course = コースの枠 (アイテムの下、既定) */
defineProps<{ part?: "now" | "course" }>();
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
/**
 * 今の手の動き (カレンシー・お告げごと): ゲームの公式の説明 (クライアントの原文、棚のカードの上と同じ) と、カードの「このステージでの動き」(条件・決まり) を畳まずに出す
 * (2026-10-17 オーナー「説明はしょりすぎ、挙動の説明はかならずいる。箇条書きでも」「フラクチャーとかも何個以上の MOD で適応とか全然書いてない」)。
 * この手で使わないお告げの案内 (「お告げ: …」の行) は外す
 */
const plain = (x: string): string => x.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
const help = computed(() => {
  const cur = topicStep.value;
  if (!cur || cur.step.how) return []; // やさしい箇条書き (how) がある手はそれだけ出す (2026-10-17 オーナー「まんますぎる、赤ちゃんに説明するくらい簡単に」)
  const keys = cur.step.use === "reveal" ? ["reveal", ...(cur.step.omens ?? [])] : [...(cur.key ? [cur.key] : []), ...(cur.step.omens ?? [])];
  return keys.map((k) => ({
    k,
    official: k === "reveal" ? [] : (currencyHoverOf(enOf(k, s.item.value))?.e ?? []).map(plain),
    lines: stageHelp(k, s.data.value, s.item.value).filter((l) => !/^(お告げ|Omens):/.test(l)),
  })).filter((x) => x.official.length || x.lines.length);
});
/** カードの頭と同じ: 上級・完全の MOD レベルの下限と、付く MOD (エッセンス・ルーン・感情) */
const floor = computed(() => { const k = topicStep.value?.key; return k && topicStep.value?.step.use !== "reveal" ? stageFloor(k) : null; });
const adds = computed(() => { const k = topicStep.value?.key; return k && topicStep.value?.step.use !== "reveal" ? stageAdds(k, s.data.value, s.item.value) : null; });
/**
 * 上級・完全の例: このアイテムに出やすい MOD 1 つで、下限ぎりぎりで付く段と、すぐ下の付かない段 (エミュレーターの MOD 一覧の行から)。
 * 2026-10-17 オーナー「例も簡単に欲しい、これは付くけどこれは付かないみたいな」。
 * 境目に一番近い組 (付く段と付かない段の MOD レベルの差が一番小さい MOD) を選ぶ。同じ差なら出やすい MOD
 * (2026-10-17 オーナー「ぎりぎりのところせめてくれ、50 以上付く・25 は付かないみたいな離れた例だとイメージしづらい」)
 */
const example = computed(() => {
  const f = floor.value, d = s.data.value, it = s.item.value;
  if (!f || !d || !it) return null;
  const rows = modListFor(d, it).filter((r) => r.group === "normal" && !r.on && !r.blocked).sort((a, b) => b.weight - a.weight);
  type Tier = (typeof rows)[number]["tiers"][number];
  let best: { ok: Tier; ng: Tier } | null = null;
  // 行は同じ系統の MOD をまとめているので、MOD (modId) ごとの段で比べる
  for (const r of rows) for (const id of new Set(r.tiers.map((t) => t.modId))) {
    const ts = r.tiers.filter((t) => t.modId === id && t.ilvl <= s.itemLevel.value);
    const above = ts.filter((t) => t.ilvl >= f), below = ts.filter((t) => t.ilvl < f);
    if (!above.length || !below.length) continue;
    const ok = above.reduce((a, b) => (b.ilvl < a.ilvl ? b : a)), ng = below.reduce((a, b) => (b.ilvl > a.ilvl ? b : a));
    if (!best || ok.ilvl - ng.ilvl < best.ok.ilvl - best.ng.ilvl) best = { ok, ng };
  }
  return best;
});
const parts = (line: string): Array<{ t: string; b: boolean }> => line.split("**").map((t, i) => ({ t, b: i % 2 === 1 }));
/** 押すと持つ (お告げも掛ける)。発現の反響は掛けるだけ */
/** 次へ: 次の手に進み、打てるアイテムを用意する */
function next(): void { topicNext(); prepareStep(); }
function holdIt(): void {
  prepareStep(); // 今のアイテムにこの手が打てなければ、ここで打てるアイテムを用意する
  const cur = topicStep.value;
  if (!cur) return;
  if (cur.step.use !== "reveal" && cur.key) s.hold(cur.key);
  for (const o of cur.step.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
/** MOD 一覧の窓を開いて、その MOD の行へ (確認用。2026-10-17 オーナー「MOD 一覧もそこで出せるように」) */
function jump(modId: string): void { s.modOverlay.value = true; s.modJump.value = { modId, n: (s.modJump.value?.n ?? 0) + 1 }; }
const last = computed(() => s.log.value[s.log.value.length - 1] ?? null);
/**
 * 前の手で起きたこと: 同じ MOD (modId と側が同じ) が消えて付いたのは 1 行にまとめる (神 = 数字が変わった、フラクチャー = 固定された)。
 * 2026-10-17 点検: 神のオーブの後に「消えた 3 つ + 付いた 3 つ」に見えて、MOD が入れ替わったように読めた
 */
const lastRows = computed(() => {
  const l = last.value;
  if (!l) return null;
  const divine = l.out.currency.startsWith("divine");
  const same = (a: StageMod, b: StageMod): boolean => a.modId === b.modId && a.side === b.side && (divine || (!!a.fractured && !b.fractured));
  // フラクチャーの手は固定した MOD が「付いた」だけで記録される (消えた側は空)
  const fracOnly = (a: StageMod): boolean => l.out.currency === "fracture" && !!a.fractured && !l.removed.some((r) => same(r, a));
  const changed = [
    ...l.added.flatMap((a) => { const b = l.removed.find((r) => same(r, a)); return b ? [{ before: b, after: a, fractured: !!a.fractured && !b.fractured }] : []; }),
    ...l.added.filter(fracOnly).map((a) => ({ before: a, after: a, fractured: true })),
  ];
  return {
    added: l.added.filter((a) => !l.removed.some((r) => same(r, a)) && !fracOnly(a)),
    removed: l.removed.filter((r) => !l.added.some((a) => same(r, a))),
    changed,
  };
});
/** MOD の札: ティア · MOD レベル · プレ / サフィ */
const modInfo = (m: StageMod): string => [m.tierName, tr(`MOD レベル ${m.modLevel}`, `mod level ${m.modLevel}`), m.side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix")].filter(Boolean).join(" · ");
/** 手の一覧の並び: 今の手から上に順に、済んだ手は ✓ のまま最後尾へ (2026-10-17 オーナー「終わったやつは列の最後尾に」)。全部済んだら元の順 */
const order = computed(() => {
  const n = topic.value?.steps.length ?? 0, at = topicAt.value;
  const idx = [...Array(n).keys()];
  return at >= n ? idx : [...idx.slice(at), ...idx.slice(0, at)];
});
</script>

<template>
  <!-- 今の手の枠 (使う物と動きの説明・前の手で起きたこと)。カレンシーの棚のすぐ上 (2026-10-17 オーナー「コースと打つ挙動の部分を隔離」) -->
  <section v-if="topic && part === 'now'" data-topic-now-panel class="g-panel p-3 text-[12px]">
    <!-- 操作のボタンは今の手の枠の上 (2026-10-17 オーナー「こっちのが良いな場所」) -->
    <div class="mb-2 flex flex-wrap justify-end gap-2">
      <!-- 次へは枠の左端にいつも出す。打ち終えるまでは押せない (2026-10-17 オーナー) -->
      <button type="button" data-topic-next class="g-btn-red sm mr-auto" :disabled="!topicUsed || !topicStep" :title="topicUsed ? undefined : tr('今の手を使うと押せる', 'Use this step first')" @click="next">{{ topic && topicAt + 1 >= topic.steps.length ? tr("完了", "Finish") : tr("次へ →", "Next →") }}</button>
      <button type="button" data-lesson-back class="g-btn sm inline-flex items-center gap-1" :disabled="!canLessonBack" :title="tr('1 つ前の手に戻る (R でも)', 'Go back one step (R also works)')" @click="lessonBack">{{ tr("1 つ前に戻る", "Back one step") }}<kbd class="kbd max-md:hidden">R</kbd></button>
      <button type="button" data-topic-mods class="g-btn sm" :title="tr('このベースに付く MOD (Tab でも開く)', 'Mods for this base (Tab also opens it)')" @click="s.modOverlay.value = true">{{ tr("MOD 一覧", "Mod list") }}</button>
      <button type="button" class="g-btn sm" @click="endTopic">{{ tr("コースをやめる", "Quit course") }}</button>
    </div>
    <div v-if="topicStep" data-topic-now class="rounded-lg border-2 border-amber-300/50 bg-amber-500/[0.08] px-3 py-2">
      <p class="text-[11px] font-bold text-amber-200">{{ tr(`${topicAt + 1} 手目: これを使ってみる`, `Step ${topicAt + 1}: try this`) }}</p>
      <p v-if="prepared && !topicUsed" data-topic-prepared class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("この手が使えるアイテムを用意しました", "We set up an item this can be used on") }}</p>
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
      <ul v-if="topicStep.step.how" data-topic-how class="mt-1.5 grid gap-1 rounded-lg bg-black/25 px-2.5 py-2">
        <li v-for="(l, i) in topicStep.step.how" :key="i" class="flex gap-1.5 text-[14px] text-[var(--exile-color-text-primary)]"><span class="text-amber-300/70">・</span><span>{{ t2(l) }}</span></li>
      </ul>
      <div v-for="h in help" :key="h.k" data-topic-how class="mt-1.5 rounded-lg bg-black/25 px-2.5 py-1.5">
        <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ h.k === "reveal" ? tr("発現", "Reveal") : nameOf(h.k) }}</p>
        <p v-for="(l, i) in h.official" :key="'o' + i" class="text-[13px] text-[var(--exile-color-text-primary)]">{{ l }}</p>
        <p v-for="(l, i) in h.lines" :key="i" class="flex gap-1.5 text-[12px] text-[#cfc6ae]"><span class="text-amber-300/60">・</span><span><template v-for="(p, j) in parts(l)" :key="j"><b v-if="p.b" class="text-white">{{ p.t }}</b><template v-else>{{ p.t }}</template></template></span></p>
      </div>
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
    </div>
    <div v-else-if="topicDone" data-topic-done class="mt-3 rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-3">
      <p class="text-[18px] font-black text-amber-100">{{ tr("全部使ってみた! おつかれさま", "You tried them all!") }}</p>
      <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("気になった手は、下の一覧から押すともう一度試せます", "Click any step below to try it again") }}</p>
    </div>

    <!-- 前の手で起きたこと -->
    <div v-if="last && topicAt > 0" class="mt-2 rounded-md bg-black/25 px-2.5 py-1.5">
      <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("前の手で起きたこと", "What the last move did") }}: {{ nameOf(last.out.currency) }}</p>
      <!-- 付いた / 消えた MOD のティア・MOD レベル・側も出す (2026-10-17 オーナー「結局何レベルの奴がついてるかの体験ができない」) -->
      <p v-for="(c, i) in lastRows?.changed ?? []" :key="'c' + i" class="text-[12px] text-sky-200"><template v-if="c.fractured">{{ tr("固定された", "Fractured") }}: {{ modText(c.after) }}</template><template v-else>{{ tr("数字が変わった", "Numbers changed") }}: <span class="text-sky-200/60">{{ modText(c.before) }}</span> → {{ modText(c.after) }}</template> <span class="whitespace-nowrap text-[11px] text-sky-200/60">({{ modInfo(c.after) }})</span></p>
      <button v-for="(m, i) in lastRows?.added ?? []" :key="'a' + i" type="button" class="g-plain block text-left text-[12px] text-emerald-300 hover:underline" :title="tr('MOD 一覧のこの行へ', 'Show in the mod list')" @click="jump(m.modId)">＋ {{ modText(m) }} <span class="whitespace-nowrap text-[11px] text-emerald-200/70">({{ modInfo(m) }})</span></button>
      <p v-for="(m, i) in lastRows?.removed ?? []" :key="'r' + i" class="text-[12px] text-rose-300"><span class="line-through">－ {{ modText(m) }}</span> <span class="whitespace-nowrap text-[11px] text-rose-300/70">({{ modInfo(m) }})</span></p>
      <p v-if="!last.added.length && !last.removed.length && !lastRows?.changed.length" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("MOD の出入りは無し (数値・品質・レアリティなどが変わる手)", "No mod added or removed (values, quality, rarity and so on changed)") }}</p>
    </div>
  </section>
  <!-- コースの枠 (題・ボタン・進み具合・手の一覧)。アイテムの下 -->
  <section v-if="topic && part !== 'now'" data-topic-guide class="g-panel p-3 text-[12px]">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="LEVEL[topic.level]!.chip">{{ t2(LEVEL[topic.level]!.label) }}</span>
      <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ t2(topic.title) }}</b>
      <span class="tabular-nums text-[11px] text-[var(--exile-color-text-tertiary)]">{{ Math.min(topicAt, topic.steps.length) }} / {{ topic.steps.length }}</span>
    </header>
    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-500" :style="{ width: `${(topicAt / topic.steps.length) * 100}%` }" /></div>
    <!-- 手の一覧 (押すとその手から) -->
    <!-- 2 列は左の列を上から下へ、次に右の列 (並び順のまま読めるように) -->
    <ol class="mt-2 columns-2 gap-x-2 max-md:columns-1">
      <li v-for="i in order" :key="i" class="mb-0.5 break-inside-avoid">
        <button type="button" class="g-plain flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-white/5" :class="i === topicAt ? 'bg-amber-500/10' : ''" @click="goTopic(i)">
          <span class="grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold" :class="i < topicAt ? 'bg-emerald-400 text-black' : i === topicAt ? 'bg-amber-400 text-black' : 'border border-white/25 text-white/50'">{{ i < topicAt ? "✓" : "" }}</span>
          <span class="min-w-0 flex-1 truncate text-[12px]" :class="i < topicAt ? 'text-emerald-100/80' : 'text-[var(--exile-color-text-secondary)]'">{{ stepName(topic.steps[i]!) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>

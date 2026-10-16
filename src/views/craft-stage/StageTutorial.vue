<!--
  StageTutorial.vue — クラフトのチュートリアル (2026-10-16、ADR-003 のクイズのレシピの見本 4 本)。

  オーナー 2026-10-14「クラフトチュートリアルにする。全部クイズ形式 (次はどれを打つ? を選ばせて案内)」(メモ recipe-showcase)。
  2026-10-16 オーナー「○○をするには? の 3 択で明確に ○×」「UI とか説明カスだから、初心者が迷わない作りで」「色とかふんだんに使って分かりやすく案内」:
    - 4 本は部位ごとの色のカード (何を覚えるか付き)
    - 問題は「Q3」の札 + 大きな問い + A/B/C の 3 択。正解は緑で理由、外れは赤でなぜ違うか
    - 完成の形は ✓ (付いた・緑) / 🔒 (固定・青) / ○ (まだ・琥珀) の札、上に進み具合
  見本のレシピ (services/craft-stage/quiz-tutorials.ts) を今のアイテムで 1 手ずつ進める。一度正解した手と同じ状況は聞かずに自動で打つ
  (quiz-tutorial-run.ts)。資料で決まらない手は「仮」の札。開発版だけ開く (シミュレーターと同じ SIM_LOCKED)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";
import { craftStage } from "../../state/craft-stage";
import { iconOfKey, nameOfKey } from "../../state/craft-stage-shelf";
import { baseNameOf, tr } from "../../i18n/lang";
import { jaTypeName } from "../../services/trade2/localize";
import { aimLabel } from "../../services/craft-stage/mod-list";
import StageItemCard from "./StageItemCard.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import Icon from "../../components/ui/Icon.vue";
import { QUIZ_TUTORIALS, type JaEn, type QuizTutorial, type TutorialRule } from "../../services/craft-stage/quiz-tutorials";
import { autoAdvance, playRule, questionOf, startTutorial, type TutorialQuestion, type TutorialState } from "../../services/craft-stage/quiz-tutorial-run";
import type { QuizAction, QuizSlot } from "../../services/craft-stage/quiz-recipe";

const s = craftStage;
const t2 = (x: JaEn): string => tr(x[0], x[1]);

// ── 進め方の状態 (計算の物は反応させず、手を打つたびに tick を進めて描き直す) ─────────────
const st = shallowRef<TutorialState | null>(null);
const tick = ref(0);
const q = shallowRef<TutorialQuestion | null>(null);
/** 直前に正解した答えと、その後に自動で打った数 */
const last = ref<{ rule: number; auto: number } | null>(null);
/** 今の問題で選んで外れた選択肢 (並びの番号) */
const wrong = ref<number[]>([]);
const error = ref("");

function refresh(): void {
  const x = st.value;
  q.value = x ? questionOf(x) : null;
  wrong.value = [];
  tick.value++;
}
function open(t: QuizTutorial, seed = t.seed): void {
  const d = s.data.value;
  if (!d) return;
  try {
    st.value = startTutorial(d, t, seed);
    last.value = null;
    error.value = "";
    refresh();
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
function choose(i: number): void {
  const d = s.data.value, x = st.value, cur = q.value;
  if (!d || !x || !cur) return;
  hoverStack.clear();
  if (!cur.choices[i]!.right) { if (!wrong.value.includes(i)) wrong.value = [...wrong.value, i]; return; }
  playRule(d, x, cur.rule, false);
  const n = autoAdvance(d, x);
  last.value = { rule: cur.rule, auto: n };
  refresh();
}
/** 同じ運でやり直す / 別の運で */
function again(other: boolean): void { const x = st.value; if (x) open(x.tut, other ? x.seed + 1 + Math.floor(Math.random() * 1000) : x.tut.seed); }
function close(): void { st.value = null; q.value = null; last.value = null; tick.value++; }

// ── 表示 ─────────────
const tut = computed(() => { void tick.value; return st.value?.tut ?? null; });
const item = computed(() => { void tick.value; return st.value?.item ?? null; });
const rules = computed(() => (tut.value?.recipe.routes[0]!.rules ?? []) as TutorialRule[]);
const lastEntry = computed(() => { void tick.value; return st.value?.log[st.value.log.length - 1] ?? null; });
const baseName = (t: QuizTutorial): string => baseNameOf({ base: t.recipe.base, baseJa: jaTypeName(t.recipe.base) });
/** 部位ごとの色 (カード・見出し) */
const TONE: Record<string, { ring: string; chip: string; text: string }> = {
  wand: { ring: "border-rose-400/50 hover:border-rose-300", chip: "bg-rose-500/20 text-rose-100", text: "text-rose-200" },
  gloves: { ring: "border-sky-400/50 hover:border-sky-300", chip: "bg-sky-500/20 text-sky-100", text: "text-sky-200" },
  ring: { ring: "border-amber-400/50 hover:border-amber-300", chip: "bg-amber-500/20 text-amber-100", text: "text-amber-200" },
  amulet: { ring: "border-violet-400/50 hover:border-violet-300", chip: "bg-violet-500/20 text-violet-100", text: "text-violet-200" },
  jewel: { ring: "border-emerald-400/50 hover:border-emerald-300", chip: "bg-emerald-500/20 text-emerald-100", text: "text-emerald-200" },
};
const toneOf = (t: QuizTutorial | null) => TONE[t?.id ?? ""] ?? TONE.ring!;

function keyName(k: string): string { return nameOfKey(k, item.value); }
function actionLabel(a: QuizAction): string {
  if ("restart" in a) return tr("新しいベースを買って最初から", "Buy a new base and start over");
  if ("reveal" in a) return a.reveal.echoes ? tr(`発現 + ${keyName("OmenofAbyssalEchoes")}`, `Reveal + ${keyName("OmenofAbyssalEchoes")}`) : tr("発現 (お告げ無し)", "Reveal (no omen)");
  return [keyName(a.use), ...(a.omens ?? []).map(keyName)].join(" + ");
}
/** 答えの手で使う物 (カレンシー + お告げ) のキーと絵 */
function actionKeys(a: QuizAction): Array<{ k: string; icon: string; omen: boolean }> {
  // 発現は棚の絵が無いので、きらめきの印で出してカードは「reveal」の説明 (2026-10-16 初心者の目での点検: 発現にだけカードが無かった)
  if ("reveal" in a) return [{ k: "reveal", icon: "", omen: false }, ...(a.reveal.echoes ? [{ k: "OmenofAbyssalEchoes", icon: iconOfKey("OmenofAbyssalEchoes", item.value), omen: true }] : [])];
  if (!("use" in a)) return [];
  return [a.use, ...(a.omens ?? [])].map((k) => ({ k, icon: iconOfKey(k, item.value), omen: k.startsWith("Omen") })).filter((x) => !!x.icon);
}
/**
 * 選択肢の絵に乗せると棚と同じ詳しいカード (StageCurrencyCard、hover-stack)。説明はチュートリアルのアイテムで出す。
 * 指の端末 (hover の無い画面) は絵を押すと出す (選ぶのは名前の所。2026-10-16 オーナー「棚と同じホバーのカード、スマホは押すと出る」)
 */
const touchOnly = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
function cardAt(e: Event, x: { k: string; omen: boolean }, now: boolean): void {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const payload = { kind: "shelf" as const, k: x.k, reason: null, omen: x.omen, item: item.value };
  const box = { left: toCss(r.left), right: toCss(r.right), top: toCss(r.top), bottom: toCss(r.bottom) };
  if (now) { hoverStack.openRoot(payload, box.right, box.top); const l = hoverStack.layers.value.at(-1); if (l) hoverStack.togglePin(l.key); }
  else hoverStack.openRootDelayed(payload, box.right, box.top, box);
}
function iconEnter(e: MouseEvent, x: { k: string; omen: boolean }): void { if (!touchOnly) cardAt(e, x, false); }
function iconTap(e: MouseEvent, x: { k: string; omen: boolean }): void { if (touchOnly) { e.stopPropagation(); cardAt(e, x, true); } }
onBeforeUnmount(() => hoverStack.leave());

/** 完成の形の札 */
const KIND: Record<QuizSlot["kind"], JaEn | null> = { normal: null, desecrated: ["冒涜", "Desecrated"], fractured: ["固定", "Fractured"], essence: ["エッセンス", "Essence"], crafted: ["作った", "Crafted"] };
const SIDE: Record<QuizSlot["side"], JaEn> = { prefix: ["プレ", "Prefix"], suffix: ["サフィ", "Suffix"] };
function modName(m0: QuizSlot["mods"][number]): string {
  return m0.minTierIndex === 0 ? aimLabel(s.data.value, { ...m0, label: m0.modId }).replace(/ \((T\d+ 以上|T\d+\+)\)$/, "") + tr(" (段は問わない)", " (any tier)") : aimLabel(s.data.value, { ...m0, label: m0.modId });
}
/** 行の見出し: 候補が 1 つならその名前、複数なら「次のどれか」(数は × N) */
function rowName(g: { sl: QuizSlot; n: number }): string {
  if (!g.sl.mods.length) return g.n > 1 ? tr(`何でも良い (${g.n} つ)`, `Anything (${g.n})`) : tr("何でも良い", "Anything");
  if (g.sl.mods.length > 1) return g.n > 1 ? tr(`次のどれか ${g.n} つ`, `Any ${g.n} of these`) : tr("次のどれか 1 つ", "Any 1 of these");
  return g.n > 1 ? `${modName(g.sl.mods[0]!)} × ${g.n}` : modName(g.sl.mods[0]!);
}
/** 札の状態: 0 無い / 1 段が低い / 2 付いている / 3 固定 */
const slots = computed(() => {
  void tick.value;
  const t = tut.value;
  if (!t) return [];
  const sit = q.value?.situation;
  return t.recipe.routes[0]!.goal.map((sl) => {
    const v = st.value?.done ? (sl.kind === "fractured" ? 3 : 2) : Number(sit?.[sl.id] ?? 0);
    const ok = v >= (sl.kind === "fractured" ? 3 : 2);
    return { sl, v, ok };
  });
});
const progress = computed(() => { const xs = slots.value.filter((x) => !x.sl.temp); return { done: xs.filter((x) => x.ok).length, all: xs.length }; });
/**
 * 完成の形の行: 同じ中身の札は 1 行にまとめて「次のどれか 3 つ」、途中だけ使う札 (軽蔑など) は別に
 * (2026-10-16 初心者の目での点検: 手袋はプレの 3 行が同じ文、ジュエルは外す物まで「全部そろえる」に入っていた)
 */
const slotRows = computed(() => {
  const out: Array<{ key: string; sl: QuizSlot; n: number; okN: number; fixed: boolean }> = [];
  for (const x of slots.value) {
    const key = `${x.sl.side}|${x.sl.kind}|${x.sl.temp ? 1 : 0}|${x.sl.mods.map((m) => `${m.modId}:${m.minTierIndex}`).sort().join(",")}`;
    const g = out.find((o) => o.key === key);
    if (g) { g.n++; if (x.ok) g.okN++; }
    else out.push({ key, sl: x.sl, n: 1, okN: x.ok ? 1 : 0, fixed: x.sl.kind === "fractured" });
  }
  return out.map((g) => ({ ...g, ok: g.okN === g.n }));
});
const goalRows = computed(() => slotRows.value.filter((g) => !g.sl.temp));
const tempRows = computed(() => slotRows.value.filter((g) => g.sl.temp));
/** 問題の番号 (答えた数 + 1) と、このコースの問題の数 (答えの数) */
const qNo = computed(() => { void tick.value; return (st.value?.answered.size ?? 0) + 1; });
/** 問いの数は運で減る (同じ状況に来ない答えもある) ので「多くて」(2026-10-16 点検: 「全 16 問くらい」で 11 問だった) */
const qAll = computed(() => rules.value.length);
const LETTER = ["A", "B", "C"];

/** 最後のまとめ: 答えた手と理由 */
const learned = computed(() => { void tick.value; return [...(st.value?.answered ?? [])].sort((a, b) => a - b).map((i) => rules.value[i]!).filter(Boolean); });
const learnedOpen = ref(true);
const usesList = computed(() => { void tick.value; return Object.entries(st.value?.uses ?? {}).sort((a, b) => b[1] - a[1]); });
const logOpen = ref(false);
const logCount = computed(() => { void tick.value; return st.value?.log.length ?? 0; });
const assumedOpen = ref(false);
const stopText = computed(() => {
  void tick.value;
  const x = st.value?.stop;
  if (!x) return "";
  if (x === "unanswered") return tr("この状況の答えがレシピに無い", "The recipe has no answer for this situation");
  if (x === "cap") return tr("手の上限で止めた", "Stopped at the step limit");
  return x;
});
</script>

<template>
  <section class="g-panel flex flex-col gap-4 p-4 text-[13px]">
    <!-- コースを選ぶ (選ぶ前は大きなカード、選んだ後は細い帯) -->
    <template v-if="!st">
      <div class="rounded-xl border border-amber-300/30 bg-gradient-to-r from-amber-500/[0.10] to-transparent px-4 py-3">
        <p class="text-[16px] font-bold text-amber-100">{{ tr("クラフトのチュートリアル", "Crafting tutorial") }}</p>
        <p class="mt-1 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr("見本のクラフトを 1 問ずつ進めます。問いに合う手を 3 つから選ぶと、その手を打って理由が出ます。間違えても、なぜ違うかが出るので何度でも選び直せます。", "Work through a sample craft one question at a time. Pick the right step out of 3; it gets used and the reason appears. A wrong pick tells you why, so just try again.") }}</p>
      </div>
      <div class="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <button v-for="t in QUIZ_TUTORIALS" :key="t.id" type="button" class="g-plain flex min-w-0 flex-col items-start gap-1.5 rounded-xl border-2 bg-white/[0.03] px-4 py-3 text-left transition hover:bg-white/[0.06]" :class="TONE[t.id]?.ring" :disabled="!s.data.value" @click="open(t)">
          <span class="flex w-full items-center gap-2">
            <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="TONE[t.id]?.chip">{{ t2(t.part) }}</span>
            <b class="min-w-0 truncate text-[15px] text-[var(--exile-color-text-title)]">{{ baseName(t) }}</b>
            <span class="ml-auto shrink-0 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`${t.recipe.routes[0]!.rules.length} 問`, `${t.recipe.routes[0]!.rules.length} questions`) }}</span>
          </span>
          <span class="text-[12px]" :class="TONE[t.id]?.text">{{ tr("覚えること", "You learn") }}: {{ t2(t.learn) }}</span>
        </button>
      </div>
    </template>
    <p v-if="error" class="text-[12px] text-[var(--exile-color-signal-down)]">{{ error }}</p>

    <template v-if="st && tut && item">
      <!-- 選んだコースの帯 -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 bg-white/[0.02] px-3 py-2" :class="toneOf(tut).ring">
        <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="toneOf(tut).chip">{{ t2(tut.part) }}</span>
        <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ baseName(tut) }}</b>
        <span class="min-w-0 text-[12px]" :class="toneOf(tut).text">{{ t2(tut.learn) }}</span>
        <!-- スマホは帯の下に 3 等分で (横に並べるとはみ出した、2026-10-16) -->
        <span class="ml-auto flex flex-wrap items-center gap-1.5 max-md:ml-0">
          <button type="button" class="g-btn sm shrink-0" :title="tr('同じ運で最初から', 'Restart with the same luck')" @click="again(false)"><Icon name="rotate" class="size-4 shrink-0 max-md:hidden" /><span class="truncate">{{ tr("最初から", "Restart") }}</span></button>
          <button type="button" class="g-btn sm shrink-0" :title="tr('別の運で最初から (付く MOD が変わる)', 'Restart with different luck (other mods will roll)')" @click="again(true)"><span class="truncate">{{ tr("別の運で", "Other luck") }}</span></button>
          <button type="button" class="g-btn sm shrink-0" :title="tr('コースを選び直す', 'Pick another course')" @click="close"><span class="truncate">{{ tr("コース一覧", "Courses") }}</span></button>
        </span>
      </div>

      <!-- 進み具合 -->
      <div class="flex items-center gap-3">
        <span class="shrink-0 text-[12px] font-bold text-[var(--exile-color-text-secondary)]">{{ tr("完成まで", "Progress") }}</span>
        <span class="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-500" :style="{ width: `${(progress.done / Math.max(1, progress.all)) * 100}%` }" /></span>
        <span class="shrink-0 tabular-nums text-[12px] font-bold text-emerald-200">{{ progress.done }} / {{ progress.all }}</span>
      </div>

      <div class="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-5 max-md:grid-cols-1">
        <!-- 左: 今のアイテムと完成の形 -->
        <div class="flex min-w-0 flex-col gap-3 max-md:w-full">
          <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("今のアイテム", "Your item") }}</p>
          <StageItemCard class="max-md:mx-auto" :item="item" :added="lastEntry?.added ?? []" :removed="lastEntry?.removed ?? []" :holding="false" :flash-key="tick" :width="300" compact />
          <div class="flex flex-col gap-1.5">
            <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("完成の形 (これを全部そろえる)", "Goal (get all of these)") }}</p>
            <div v-for="g in goalRows" :key="g.key" class="flex min-w-0 flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-[12px] transition-colors" :class="g.ok ? (g.fixed ? 'border-sky-400/40 bg-sky-500/10' : 'border-emerald-400/40 bg-emerald-500/10') : 'border-amber-400/25 bg-amber-500/[0.05]'">
              <div class="flex min-w-0 items-center gap-2">
                <span class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" :class="g.ok ? (g.fixed ? 'bg-sky-400 text-black' : 'bg-emerald-400 text-black') : 'border border-amber-300/60 text-amber-200'">{{ g.ok ? (g.fixed ? "🔒" : "✓") : g.n > 1 && g.okN ? g.okN : "" }}</span>
                <span class="shrink-0 rounded px-1 text-[10px] text-[var(--exile-color-text-tertiary)] ring-1 ring-white/15">{{ t2(SIDE[g.sl.side]) }}</span>
                <span class="min-w-0 flex-1 truncate" :class="g.ok ? 'text-[var(--exile-color-text-primary)]' : 'text-[var(--exile-color-text-secondary)]'" :title="rowName(g)">{{ rowName(g) }}</span>
                <span v-if="KIND[g.sl.kind]" class="shrink-0 rounded px-1 text-[10px]" :class="g.sl.kind === 'desecrated' ? 'bg-rose-500/20 text-rose-200' : g.sl.kind === 'fractured' ? 'bg-sky-500/20 text-sky-200' : 'bg-violet-500/20 text-violet-200'">{{ t2(KIND[g.sl.kind]!) }}</span>
              </div>
              <!-- 候補が複数の札は名前を並べる (前は「ほか 3」で中身が見えなかった) -->
              <ul v-if="g.sl.mods.length > 1" class="ml-7 flex min-w-0 flex-col text-[11px] text-[var(--exile-color-text-secondary)]">
                <li v-for="m in g.sl.mods" :key="m.modId" class="truncate" :title="modName(m)">・{{ modName(m) }}</li>
              </ul>
            </div>
          </div>
          <!-- 途中だけ使う札 (ジュエルの軽蔑など)。完成には要らない -->
          <div v-if="tempRows.length" class="flex flex-col gap-1.5">
            <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("途中で使う (完成の時は無くて良い)", "Used along the way (not needed at the end)") }}</p>
            <div v-for="g in tempRows" :key="g.key" class="flex min-w-0 items-center gap-2 rounded-lg border border-dashed border-white/15 px-2 py-1.5 text-[12px] text-[var(--exile-color-text-secondary)]">
              <span class="shrink-0 rounded px-1 text-[10px] text-[var(--exile-color-text-tertiary)] ring-1 ring-white/15">{{ t2(SIDE[g.sl.side]) }}</span>
              <span class="min-w-0 flex-1 truncate" :title="rowName(g)">{{ rowName(g) }}</span>
              <span v-if="KIND[g.sl.kind]" class="shrink-0 rounded bg-violet-500/20 px-1 text-[10px] text-violet-200">{{ t2(KIND[g.sl.kind]!) }}</span>
            </div>
          </div>
        </div>

        <!-- 右: 正解の理由 → 問題 (スマホは問題を先に) -->
        <div class="flex min-w-0 flex-col gap-3 max-md:order-first">
          <div v-if="last" class="rounded-xl border-2 border-emerald-400/50 bg-emerald-500/[0.08] px-4 py-3">
            <p class="flex flex-wrap items-center gap-2 text-[14px] font-bold text-emerald-200"><Icon name="check" class="size-5" />{{ tr("正解!", "Correct!") }}<span class="font-normal text-emerald-100">{{ actionLabel(rules[last.rule]!.do) }}</span></p>
            <p class="mt-1.5 text-[13px] leading-relaxed text-[var(--exile-color-text-primary)]">{{ t2(rules[last.rule]!.why) }}</p>
            <p v-if="rules[last.rule]!.assumed" class="mt-1 text-[12px] text-amber-200/80"><span class="mr-1 rounded bg-amber-500/20 px-1 text-[10px] font-bold">{{ tr("仮", "Assumed") }}</span>{{ t2(rules[last.rule]!.assumed!) }}</p>
            <p v-if="last.auto" class="mt-1.5 text-[12px] text-emerald-100/70">{{ tr(`同じ手で進む所は ${last.auto} 手、自動で打った`, `Used ${last.auto} more step${last.auto === 1 ? "" : "s"} automatically where the answer is the same`) }}</p>
          </div>

          <!-- 問題 -->
          <div v-if="q" class="rounded-xl border-2 border-amber-300/50 bg-gradient-to-b from-amber-500/[0.10] to-transparent px-4 py-3">
            <p class="flex items-center gap-2">
              <span class="rounded-md bg-amber-400 px-2 py-0.5 text-[13px] font-black text-black">Q{{ qNo }}</span>
              <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`多くて ${qAll} 問 · ここまで ${st.steps} 手`, `up to ${qAll} questions · ${st.steps} steps so far`) }}</span>
            </p>
            <h4 class="mt-2 text-[18px] font-bold leading-snug text-amber-50 max-md:text-[16px]">{{ t2(rules[q.rule]!.ask) }}</h4>
            <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("「今のアイテム」と「完成の形」を見て、3 つから選んでください。絵に乗せる (スマホは押す) と説明が出ます。", "Check “Your item” and the “Goal”, then pick 1 of 3. Hover (or tap) an icon for its details.") }}</p>
            <div class="mt-3 flex flex-col gap-2">
              <template v-for="(c, i) in q.choices" :key="`${tick}-${i}`">
                <button type="button" class="g-plain flex min-h-12 w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 px-3 py-2 text-left transition" :class="wrong.includes(i) ? 'border-rose-500/60 bg-rose-500/10 text-[var(--exile-color-text-tertiary)]' : 'border-white/15 bg-black/20 hover:border-amber-300 hover:bg-amber-500/10'" :disabled="wrong.includes(i)" @click="choose(i)">
                  <span class="grid size-7 shrink-0 place-items-center rounded-md text-[13px] font-black" :class="wrong.includes(i) ? 'bg-rose-500 text-white' : 'bg-white/10 text-amber-100'">{{ wrong.includes(i) ? "✕" : LETTER[i] }}</span>
                  <span class="flex shrink-0 items-center gap-0.5">
                    <span v-for="x in actionKeys(c.do)" :key="x.k" class="g-slot grid size-9 place-items-center" :data-key="x.k" @mouseenter="iconEnter($event, x)" @mouseleave="hoverStack.leave()" @click="iconTap($event, x)"><img v-if="x.icon" :src="x.icon" alt="" class="size-7 object-contain" draggable="false" /><Icon v-else name="sparkles" class="size-6 text-violet-200" /></span>
                  </span>
                  <!-- 名前に乗せても 1 つ目の物のカード (PC だけ。2026-10-16 点検: 小さな絵に乗せないと出なかった) -->
                  <span class="min-w-[10rem] flex-1 text-[13px]" :class="wrong.includes(i) ? 'line-through' : 'text-[var(--exile-color-text-primary)]'" @mouseenter="actionKeys(c.do)[0] && iconEnter($event, actionKeys(c.do)[0]!)" @mouseleave="hoverStack.leave()">{{ actionLabel(c.do) }}</span>
                </button>
                <p v-if="wrong.includes(i) && c.why" class="-mt-1 flex items-start gap-1.5 rounded-md bg-rose-500/[0.08] px-3 py-1.5 text-[12px] text-rose-100"><span class="font-bold text-rose-300">{{ tr("違う理由", "Why not") }}:</span>{{ t2(c.why) }}</p>
              </template>
            </div>
          </div>

          <!-- 完成 -->
          <div v-else-if="st.done" class="rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-4">
            <p class="text-[20px] font-black text-amber-100">{{ tr("完成! おめでとう", "Done! Well crafted") }}</p>
            <p class="mt-1 text-[13px] text-[var(--exile-color-text-primary)]">{{ tr(`${st.steps} 手 · ベース ${st.bases} 個で完成しました。`, `Finished in ${st.steps} steps with ${st.bases} base${st.bases === 1 ? "" : "s"}.`) }}</p>
            <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
              <li v-for="[k, n] in usesList" :key="k" class="inline-flex items-center gap-1 rounded bg-black/20 px-1.5 py-0.5"><img v-if="iconOfKey(k, item)" :src="iconOfKey(k, item)" alt="" class="size-5 object-contain" />{{ keyName(k) }} ×{{ n }}</li>
            </ul>
            <div class="mt-3">
              <Disclosure v-model:open="learnedOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`このコースで覚えた手 (${learned.length})`, `What you learned (${learned.length})`) }}</Disclosure>
              <ol v-if="learnedOpen" class="mt-1 flex flex-col gap-1.5 text-[12px]">
                <li v-for="(r, i) in learned" :key="i" class="rounded-md bg-black/20 px-3 py-1.5"><b class="text-emerald-200">{{ t2(r.ask) }}</b><br /><span class="text-[var(--exile-color-text-primary)]">→ {{ actionLabel(r.do) }}</span><br /><span class="text-[var(--exile-color-text-secondary)]">{{ t2(r.why) }}</span></li>
              </ol>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="g-btn sm" @click="again(true)">{{ tr("別の運でもう一度", "Again with other luck") }}</button>
              <button type="button" class="g-btn sm" @click="close">{{ tr("ほかのコースへ", "Other courses") }}</button>
            </div>
          </div>
          <p v-else-if="stopText" class="text-[12px] text-[var(--exile-color-signal-down)]">{{ stopText }}</p>

          <!-- 打った手・仮 (既定で畳む) -->
          <div class="flex flex-wrap gap-x-3 border-t border-white/[0.06] pt-2">
            <Disclosure v-if="logCount" v-model:open="logOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`打った手 (${logCount})`, `Steps used (${logCount})`) }}</Disclosure>
            <Disclosure v-if="tut.assumed.length" v-model:open="assumedOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`仮にした所 (${tut.assumed.length})`, `Assumptions (${tut.assumed.length})`) }}</Disclosure>
          </div>
          <ol v-if="logOpen" class="flex max-h-64 flex-col gap-0.5 overflow-y-auto text-[12px]">
            <li v-for="(e, i) in st.log" :key="i" class="flex min-w-0 gap-2 px-2" :class="e.auto ? 'text-[var(--exile-color-text-tertiary)]' : 'text-[var(--exile-color-text-primary)]'">
              <span class="w-8 shrink-0 text-right tabular-nums">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate">{{ actionLabel(rules[e.rule]!.do) }}</span>
              <span v-if="e.auto" class="shrink-0">{{ tr("自動", "auto") }}</span>
            </li>
          </ol>
          <ul v-if="assumedOpen" class="list-disc pl-5 text-[12px] text-[var(--exile-color-text-secondary)]">
            <li v-for="(a, i) in tut.assumed" :key="i">{{ t2(a) }}</li>
            <li class="list-none opacity-70">{{ tr("資料", "Source") }}: {{ tut.source }}</li>
          </ul>
        </div>
      </div>
    </template>
  </section>
</template>

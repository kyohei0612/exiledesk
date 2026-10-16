<!--
  StageTutorial.vue — クラフトのチュートリアル (2026-10-16、ADR-003 のクイズのレシピの見本 4 本)。

  オーナー 2026-10-14「クラフトチュートリアルにする。全部クイズ形式 (次はどれを打つ? を選ばせて案内)」(メモ recipe-showcase)。
  見本のレシピ (services/craft-stage/quiz-tutorials.ts) を今のアイテムで 1 手ずつ「この時は?」と聞く。正解を選ぶとその手を打ち、
  理由を出す。一度正解した答えと同じ状況は聞かずに自動で打つ (quiz-tutorial-run.ts)。資料で決まらない手は「仮」の札。
  開発版だけ開く (シミュレーターと同じ SIM_LOCKED)
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
import { fillModText } from "../../services/htc/mod-text";
import { oneOfMod } from "../../services/craft-stage/stage-core";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import StageItemCard from "./StageItemCard.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import Icon from "../../components/ui/Icon.vue";
import { QUIZ_TUTORIALS, type JaEn, type QuizTutorial, type TutorialRule } from "../../services/craft-stage/quiz-tutorials";
import { autoAdvance, playRule, questionOf, startTutorial, type TutorialQuestion, type TutorialState } from "../../services/craft-stage/quiz-tutorial-run";
import type { QuizAction, QuizSlot } from "../../services/craft-stage/quiz-recipe";
import { SLOT_STATE, whenText } from "./quiz-text";

const s = craftStage;
const t2 = (x: JaEn): string => tr(x[0], x[1]);

// ── 進め方の状態 (計算の物は反応させず、手を打つたびに tick を進めて描き直す) ─────────────
const st = shallowRef<TutorialState | null>(null);
const tick = ref(0);
const q = shallowRef<TutorialQuestion | null>(null);
/** 直前に正解した答えと、その後に自動で打った数 */
const last = ref<{ rule: number; auto: number } | null>(null);
/** 今の問題で選んで外れた答え */
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
    const x = startTutorial(d, t, seed);
    st.value = x;
    last.value = null;
    error.value = "";
    refresh();
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
function choose(i: number): void {
  const d = s.data.value, x = st.value, cur = q.value;
  if (!d || !x || !cur) return;
  hoverStack.clear();
  if (i !== cur.rule) { if (!wrong.value.includes(i)) wrong.value = [...wrong.value, i]; return; }
  playRule(d, x, i, false);
  const n = autoAdvance(d, x);
  last.value = { rule: i, auto: n };
  refresh();
}
/** 同じ運でやり直す / 別の運で */
function again(other: boolean): void { const x = st.value; if (x) open(x.tut, other ? x.seed + 1 + Math.floor(Math.random() * 1000) : x.tut.seed); }

// ── 表示 ─────────────
const tut = computed(() => { void tick.value; return st.value?.tut ?? null; });
const item = computed(() => { void tick.value; return st.value?.item ?? null; });
const rules = computed(() => (tut.value?.recipe.routes[0]!.rules ?? []) as TutorialRule[]);
const lastEntry = computed(() => { void tick.value; return st.value?.log[st.value.log.length - 1] ?? null; });
const baseName = (t: QuizTutorial): string => baseNameOf({ base: t.recipe.base, baseJa: jaTypeName(t.recipe.base) });

function keyName(k: string): string { return nameOfKey(k, item.value); }
function actionLabel(a: QuizAction): string {
  if ("restart" in a) return tr("買い直して最初から", "Buy a new base and start over");
  if ("reveal" in a) return a.reveal.echoes ? tr(`発現 (${keyName("OmenofAbyssalEchoes")}で引き直し)`, `Reveal (reroll with ${keyName("OmenofAbyssalEchoes")})`) : tr("発現 (狙いを取る)", "Reveal (take the target)");
  return [keyName(a.use), ...(a.omens ?? []).map(keyName)].join(" + ");
}
/** 答えの手で使う物 (カレンシー + お告げ) のキーと絵 */
function actionKeys(a: QuizAction): Array<{ k: string; icon: string; omen: boolean }> {
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
  // 指の端末はピン留めで出す (× で閉じる。乗せる / 外すが無いので、留めないと消せない)
  if (now) { hoverStack.openRoot(payload, box.right, box.top); const l = hoverStack.layers.value.at(-1); if (l) hoverStack.togglePin(l.key); }
  else hoverStack.openRootDelayed(payload, box.right, box.top, box);
}
function iconEnter(e: MouseEvent, x: { k: string; omen: boolean }): void { if (!touchOnly) cardAt(e, x, false); }
function iconTap(e: MouseEvent, x: { k: string; omen: boolean }): void { if (touchOnly) { e.stopPropagation(); cardAt(e, x, true); } }
onBeforeUnmount(() => hoverStack.leave());

/** 完成の札 (名前・付け方・今の状態) */
const KIND: Record<QuizSlot["kind"], JaEn | null> = { normal: null, desecrated: ["冒涜", "Desecrated"], fractured: ["固定", "Fractured"], essence: ["エッセンス", "Essence"], crafted: ["作った", "Crafted"] };
function slotName(sl: QuizSlot): string {
  if (!sl.mods.length) return tr(sl.side === "prefix" ? "プレ (何でも)" : "サフィ (何でも)", sl.side === "prefix" ? "Prefix (any)" : "Suffix (any)");
  // 段の数値を入れた文 + 「T○ 以上」(狙う MOD の札と同じ。前は jaOfMod の雛形のままで「#から#の物理ダメージ」と出ていた、2026-10-16)
  const n = aimLabel(s.data.value, { ...sl.mods[0]!, label: sl.mods[0]!.modId });
  return sl.mods.length > 1 ? `${n} ${tr(`ほか ${sl.mods.length - 1}`, `+${sl.mods.length - 1}`)}` : n;
}
const TONE = ["text-[var(--exile-color-text-secondary)]", "text-amber-200", "text-emerald-200", "text-[var(--exile-color-accent-focus)]"];
const slots = computed(() => {
  const t = tut.value;
  if (!t) return [];
  const sit = q.value?.situation;
  return t.recipe.routes[0]!.goal.map((sl) => {
    const v = st.value?.done ? (sl.kind === "fractured" ? 3 : 2) : Number(sit?.[sl.id] ?? 0);
    return { sl, v, state: tr(SLOT_STATE[v]?.[0] ?? "", SLOT_STATE[v]?.[1] ?? "") };
  });
});
/** 進み具合: 完成の形のうち付いた札の数 */
const progress = computed(() => { const xs = slots.value; return { done: xs.filter((x) => x.v >= 2).length, all: xs.length }; });
/** 外れた答えの「なぜ」: その手はどんな時に使うか (答えの条件) */
// 数値は一番上の段の幅で入れる (雛形のままだと「#から#の物理ダメージ」になる、2026-10-16)
const modName = (id: string): string => { const m = s.data.value?.mods.get(id); return m ? fillModText(oneOfMod(m), tierDisplayRanges(m.tiers[m.tiers.length - 1]!)) : id; };
function wrongWhy(i: number): string {
  const t = tut.value;
  if (!t) return "";
  return tr(`この手は「${whenText(t.recipe.routes[0]!.goal, rules.value[i]!.when, modName)}」の時に使う`, `Use this when: ${whenText(t.recipe.routes[0]!.goal, rules.value[i]!.when, modName)}`);
}
/** 最後のまとめ: 答えた手と理由 (既定で畳む) */
const learned = computed(() => { void tick.value; return [...(st.value?.answered ?? [])].sort((a, b) => a - b).map((i) => rules.value[i]!).filter(Boolean); });
const learnedOpen = ref(false);
const usesList = computed(() => { void tick.value; return Object.entries(st.value?.uses ?? {}).sort((a, b) => b[1] - a[1]); });
const logOpen = ref(false);
/** 打った手の数 (Disclosure の題は tick で描き直す) */
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
    <!-- 4 本の切り替え -->
    <div class="flex flex-wrap gap-1.5" role="tablist">
      <button v-for="t in QUIZ_TUTORIALS" :key="t.id" type="button" role="tab" :aria-selected="tut?.id === t.id" class="g-tab min-w-0 !inline-flex items-baseline gap-2 !px-4 text-left max-md:flex-1" :class="tut?.id === t.id ? 'on' : ''" :disabled="!s.data.value" @click="open(t)">
        <span class="shrink-0 text-[11px] opacity-70">{{ t2(t.part) }}</span>
        <span class="min-w-0 max-w-[16rem] truncate">{{ baseName(t) }}</span>
      </button>
    </div>
    <p v-if="!st" class="text-[var(--exile-color-text-secondary)]">{{ tr("作る物を選ぶと、見本のクラフトを 1 手ずつ「この時は何を打つ?」で進めます。", "Pick an item. The sample craft runs one step at a time and asks “what do you use now?”.") }}</p>
    <p v-if="error" class="text-[12px] text-[var(--exile-color-signal-down)]">{{ error }}</p>

    <template v-if="st && tut && item">
      <!-- 何を覚えるか・仮 -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b class="text-[var(--exile-color-text-primary)]">{{ t2(tut.learn) }}</b>
        <span v-if="tut.assumed.length" class="inline-flex items-center gap-1">
          <span class="rounded bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-200">{{ tr("仮", "Assumed") }}</span>
          <Disclosure v-model:open="assumedOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`仮にした所 (${tut.assumed.length})`, `Assumptions (${tut.assumed.length})`) }}</Disclosure>
        </span>
        <span class="ml-auto flex items-center gap-1.5">
          <button type="button" class="g-btn sm" :title="tr('同じ運で最初から', 'Restart with the same luck')" @click="again(false)"><Icon name="rotate" class="size-4" />{{ tr("最初から", "Restart") }}</button>
          <button type="button" class="g-btn sm" :title="tr('別の運で最初から (付く MOD が変わる)', 'Restart with different luck (other mods will roll)')" @click="again(true)">{{ tr("別の運で", "Other luck") }}</button>
        </span>
      </div>
      <ul v-if="assumedOpen" class="list-disc pl-5 text-[12px] text-[var(--exile-color-text-secondary)]">
        <li v-for="(a, i) in tut.assumed" :key="i">{{ t2(a) }}</li>
        <li class="list-none opacity-70">{{ tr("資料", "Source") }}: {{ tut.source }}</li>
      </ul>

      <div class="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-5 max-md:grid-cols-1">
        <div class="flex min-w-0 flex-col gap-3 max-md:mx-auto">
          <StageItemCard :item="item" :added="lastEntry?.added ?? []" :removed="lastEntry?.removed ?? []" :holding="false" :flash-key="tick" :width="300" compact />
          <!-- 完成の形 -->
          <div class="flex flex-col gap-1">
            <p class="flex items-center gap-2 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("完成の形", "Goal") }}
              <span class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full bg-emerald-400/70 transition-[width]" :style="{ width: `${(progress.done / Math.max(1, progress.all)) * 100}%` }" /></span>
              <span class="tabular-nums">{{ progress.done }}/{{ progress.all }}</span>
            </p>
            <div v-for="x in slots" :key="x.sl.id" class="flex min-w-0 items-baseline gap-2 text-[12px]">
              <span class="w-4 shrink-0 font-bold text-[var(--exile-color-text-tertiary)]">{{ x.sl.id }}</span>
              <span class="min-w-0 flex-1 truncate" :title="slotName(x.sl)">{{ slotName(x.sl) }}<span v-if="KIND[x.sl.kind]" class="ml-1 text-[11px] opacity-60">({{ t2(KIND[x.sl.kind]!) }})</span></span>
              <span class="shrink-0" :class="TONE[x.v]">{{ x.state }}</span>
            </div>
          </div>
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <!-- 直前の正解の理由 -->
          <div v-if="last" class="rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] px-3 py-2">
            <p class="flex flex-wrap items-center gap-x-2 text-emerald-200"><Icon name="check" class="size-4" /><b>{{ actionLabel(rules[last.rule]!.do) }}</b><span v-if="rules[last.rule]!.assumed" class="rounded bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-200" :title="t2(rules[last.rule]!.assumed!)">{{ tr("仮", "Assumed") }}</span></p>
            <p class="mt-1 text-[var(--exile-color-text-primary)]">{{ t2(rules[last.rule]!.why) }}</p>
            <p v-if="rules[last.rule]!.assumed" class="mt-1 text-[12px] text-amber-200/80">{{ t2(rules[last.rule]!.assumed!) }}</p>
            <p v-if="last.auto" class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(`前に答えた手と同じ状況を ${last.auto} 手、自動で打った`, `Used ${last.auto} more step${last.auto === 1 ? "" : "s"} automatically for situations you already answered`) }}</p>
          </div>

          <!-- 問題 -->
          <template v-if="q">
            <h4 class="flex items-baseline gap-2 text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ tr("この時は?", "What now?") }}<span class="text-[11px] font-normal text-[var(--exile-color-text-tertiary)]">{{ tr(`${st.answered.size + 1} 問目 · ${st.steps} 手`, `Question ${st.answered.size + 1} · ${st.steps} steps`) }}</span></h4>
            <div class="flex max-w-2xl flex-col gap-1.5">
              <template v-for="i in q.choices" :key="i">
              <button type="button" class="g-plain flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition" :class="wrong.includes(i) ? 'border-[rgba(224,108,108,0.5)] bg-[rgba(224,108,108,0.08)] text-[var(--exile-color-text-tertiary)] line-through' : 'border-white/15 bg-white/[0.03] hover:border-[var(--exile-color-accent-focus)] hover:bg-white/[0.06]'" :disabled="wrong.includes(i)" @click="choose(i)">
                <span class="flex shrink-0 items-center gap-0.5">
                  <span v-for="x in actionKeys(rules[i]!.do)" :key="x.k" class="g-slot grid size-9 place-items-center" :data-key="x.k" @mouseenter="iconEnter($event, x)" @mouseleave="hoverStack.leave()" @click="iconTap($event, x)"><img :src="x.icon" alt="" class="size-7 object-contain" draggable="false" /></span>
                </span>
                <span class="min-w-0 flex-1 truncate">{{ actionLabel(rules[i]!.do) }}</span>
              </button>
              <p v-if="wrong.includes(i)" class="-mt-1 px-3 text-[12px] text-[var(--exile-color-text-secondary)]">{{ wrongWhy(i) }}</p>
              </template>
            </div>
            <p v-if="wrong.length" class="text-[12px] text-[var(--exile-color-signal-down)]">{{ tr("違う。完成の形と、今のアイテムに足りない物を見てもう一度", "Not this one. Compare the goal with what the item is missing, then try again") }}</p>
          </template>
          <div v-else-if="st.done" class="rounded-lg border border-[var(--exile-color-accent-focus)]/40 bg-white/[0.03] px-3 py-2">
            <p class="text-[15px] font-semibold text-[var(--exile-color-accent-focus)]">{{ tr("完成", "Done") }}</p>
            <p class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(`${st.steps} 手 · ベース ${st.bases} 個`, `${st.steps} steps · ${st.bases} base${st.bases === 1 ? "" : "s"}`) }}</p>
            <ul class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
              <li v-for="[k, n] in usesList" :key="k" class="inline-flex items-center gap-1"><img v-if="iconOfKey(k, item)" :src="iconOfKey(k, item)" alt="" class="size-5 object-contain" />{{ keyName(k) }} ×{{ n }}</li>
            </ul>
            <Disclosure v-if="learned.length" v-model:open="learnedOpen" kind="detail" class="mt-1 h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`覚えた手 (${learned.length})`, `What you learned (${learned.length})`) }}</Disclosure>
            <ol v-if="learnedOpen" class="mt-1 flex flex-col gap-1.5 text-[12px]">
              <li v-for="(r, i) in learned" :key="i" class="px-2"><b class="text-[var(--exile-color-text-primary)]">{{ actionLabel(r.do) }}</b><span v-if="r.assumed" class="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-200">{{ tr("仮", "Assumed") }}</span><br /><span class="text-[var(--exile-color-text-secondary)]">{{ t2(r.why) }}</span></li>
            </ol>
          </div>
          <p v-else-if="stopText" class="text-[12px] text-[var(--exile-color-signal-down)]">{{ stopText }}</p>

          <!-- 打った手 (既定で畳む) -->
          <div v-if="logCount" class="border-t border-white/[0.06] pt-2">
            <Disclosure v-model:open="logOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`打った手 (${logCount})`, `Steps used (${logCount})`) }}</Disclosure>
            <ol v-if="logOpen" class="mt-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto text-[12px]">
              <li v-for="(e, i) in st.log" :key="i" class="flex min-w-0 gap-2 px-2" :class="e.auto ? 'text-[var(--exile-color-text-tertiary)]' : 'text-[var(--exile-color-text-primary)]'">
                <span class="w-8 shrink-0 text-right tabular-nums">{{ i + 1 }}</span>
                <span class="min-w-0 flex-1 truncate">{{ actionLabel(rules[e.rule]!.do) }}</span>
                <span v-if="e.auto" class="shrink-0">{{ tr("自動", "auto") }}</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

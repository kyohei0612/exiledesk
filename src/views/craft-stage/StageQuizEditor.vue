<!--
  StageQuizEditor.vue — クイズのレシピ (ADR-003、2026-10-12)。

  オーナー 2026-10-12「先に完成の MOD を決めて、状況ごとに『この場合はこう』を答えるクイズ」「この時はこのカレンシーを使うって時に
  今の仕組み (棚 + お告げ) で選択させたらいい」「プレ狙いでサフィも兼ねてる、サフィに付いたらサフィの工程へ」。
  裏で何人も回して、答えの無い状況に来たらそこで止め、来た数の多い状況から 1 つずつ聞く。答えると次の問題へ。
  条件は札から見た形。押すとその項目は「何でも」になる (広げる)。決まりは services/craft-stage/quiz-recipe.ts
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { provideShelf, simHidden } from "../../state/shelf-context";
import { tr } from "../../i18n/lang";
import CurrencyShelf from "./CurrencyShelf.vue";
import ShelfButton from "./ShelfButton.vue";
import StageItemCard from "./StageItemCard.vue";
import Icon from "../../components/ui/Icon.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import { OMEN_FOR } from "../../services/craft-stage/omens";
import { applyCurrency, kindOf, omensFor } from "../../services/craft-stage/apply-currency";
import { mulberry32 } from "../../services/htc/rng";
import { ruleFor, runQuizOnce, summarizeQuiz, type QuizAction, type QuizRecipe, type QuizResult, type QuizRule, type QuizRun, type QuizSlot, type When } from "../../services/craft-stage/quiz-recipe";
import { ROUTE_NAME } from "../../services/craft-stage/quiz-build";
import { actionText, chipText as chipTextOf, whenText as whenTextOf } from "./quiz-text";
import type { StageItem } from "../../services/craft-stage/types";

const props = defineProps<{
  recipe: QuizRecipe;
  /** 札の MOD の短い名前 */
  nameOfMod: (modId: string) => string;
  locked?: boolean;
  /** パターンの名前 (残りの数を覚える) */
  name?: string;
  error?: string | null;
}>();
const emit = defineEmits<{ change: [route: string, rules: QuizRule[]] }>();

// ── 裏で回して、答えの無い状況を集める ─────────────────────────
const EXPLORE_RUNS = 150;
const result = ref<QuizResult | null>(null);
const exploring = ref(false);
let gen = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
async function explore(): Promise<void> {
  const d = craftStage.data.value;
  if (!d) return;
  const my = ++gen;
  exploring.value = true;
  const runs: QuizRun[] = [];
  try {
    for (let i = 0; i < EXPLORE_RUNS; i++) {
      runs.push(runQuizOnce(d, props.recipe, 1 + i * 7919, { price: () => 0, maxSteps: 4000 }));
      if (i % 10 === 9) { await new Promise((r) => setTimeout(r)); if (my !== gen) return; }
    }
  } catch (e) {
    if (my === gen) { result.value = null; exploring.value = false; startError.value = e instanceof Error ? e.message : String(e); }
    return;
  }
  if (my !== gen) return;
  startError.value = "";
  result.value = summarizeQuiz(runs, () => 0);
  exploring.value = false;
}
const startError = ref("");
watch(() => JSON.stringify([props.recipe.routes.map((r) => [r.goal, r.rules]), props.recipe.base, props.recipe.itemLevel, props.recipe.start.kind]), () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void explore(), 120);
}, { immediate: true });
onBeforeUnmount(() => { gen++; if (timer) clearTimeout(timer); });

/** 残りの問題 (打てない手で止まった状況が先、次に来た数の多い順) */
const questions = computed(() => {
  const r = result.value;
  if (!r) return [];
  return [...r.blocked.map((b) => ({ ...b, blocked: true as const })), ...r.open.map((o) => ({ ...o, blocked: false as const, reason: "" }))];
});
const left = computed(() => questions.value.length);
watch([left, () => props.name, exploring], ([n, name, busy]) => { if (name && !busy) craftStage.simPlayLeft.value = { ...craftStage.simPlayLeft.value, [name]: n }; }, { immediate: true });
const q = computed(() => questions.value[0] ?? null);
const routeOfQ = computed(() => props.recipe.routes.find((r) => r.id === q.value?.route) ?? props.recipe.routes[0]!);
const answered = computed(() => props.recipe.routes.reduce((a, r) => a + r.rules.length, 0));

// ── 条件 (札から見た形) ─────────────────────────
/** 既定で条件に入れる項目 (残りは「何でも」)。0 の未発現・冒涜の外れ・固定・ルーンは細かい条件 (畳む) */
const MAIN = (k: string): boolean => k === "r" || k === "p.n" || k === "s.n";
const SUB = ["p.hid", "s.hid", "p.bad", "s.bad", "fx", "aug"];
const slotOf = (id: string): QuizSlot | undefined => routeOfQ.value.goal.find((s) => s.id === id);
const chipText = (k: string, v: string | number): string => chipTextOf(routeOfQ.value.goal, k, v, props.nameOfMod);
/** 今の問題の条件 (押して外した項目は何でも) */
const off = ref<Set<string>>(new Set());
watch(() => q.value?.key, () => { off.value = new Set(); held.value = null; omens.value = []; });
const chips = computed(() => {
  const sit = q.value?.situation;
  if (!sit) return { main: [] as string[], sub: [] as string[] };
  const keys = Object.keys(sit);
  const main = [...routeOfQ.value.goal.map((s) => s.id), ...keys.filter(MAIN), ...SUB.filter((k) => sit[k] !== 0)];
  const sub = SUB.filter((k) => sit[k] === 0);
  return { main, sub };
});
const subOpen = ref(false);
/** 札の状態の色 (無い = 灰、段が低い = 黄、付いている = 緑、固定 = 金) */
const TONE: Record<string, string> = { none: "text-[var(--exile-color-text-secondary)]", low: "text-amber-200", on: "text-emerald-200", fixed: "text-[var(--exile-color-accent-focus)]", plain: "text-[var(--exile-color-text-primary)]" };
function toneOf(k: string): string {
  if (!slotOf(k)) return "plain";
  return (["none", "low", "on", "fixed"] as const)[Number(q.value?.situation[k] ?? 0)] ?? "plain";
}
function toggleChip(k: string): void { const s = new Set(off.value); if (s.has(k)) s.delete(k); else s.add(k); off.value = s; }
const whenNow = computed<When>(() => {
  const sit = q.value?.situation;
  if (!sit) return {};
  const w: When = {};
  for (const k of [...chips.value.main, ...chips.value.sub]) if (!off.value.has(k)) w[k] = sit[k]!;
  return w;
});

// ── 答え: 棚 (手打ちと同じ) + 発現・買い直し ─────────────────────────
const item = computed<StageItem | null>(() => q.value?.item ?? null);
const omens = ref<string[]>([]);
const held = ref<string | null>(null);
provideShelf({
  data: craftStage.data, item, omens, held,
  // 当たり所で弾かれるだけの物は打てる扱い (棚は乱数に関係ない条件だけで出す。オーナーの方針 2026-10-12)
  usable: (k) => { const d = craftStage.data.value, it = item.value; if (!d || !it) return tr("準備中", "Loading"); const r = applyCurrency(d, it, k, mulberry32(0), omens.value); return r.applied || r.random ? null : (r.reason ?? tr("打てない", "Can't use")); },
  toggleOmen: (id) => toggleOmen(id),
  hidden: simHidden,
});
const heldOmens = computed(() => { if (!held.value) return []; const k = kindOf(held.value); return [...(OMEN_FOR[k] ?? []), ...(k === "desecrate" ? OMEN_FOR.reveal ?? [] : [])]; });
function toggleOmen(id: string): void { omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id]; }
const echoes = ref(true);
const hasHidden = computed(() => (item.value ? [...item.value.prefixes, ...item.value.suffixes].some((m) => m.unrevealed) : false));

function answer(a: QuizAction): void {
  if (props.locked || !q.value) return;
  const route = routeOfQ.value;
  const when = whenNow.value;
  // 同じ条件の答えは置き換える (打てなかった答えを直す時も)
  const same = (r: QuizRule): boolean => JSON.stringify(Object.entries(r.when).sort()) === JSON.stringify(Object.entries(when).sort());
  // 打てなかった答えは外して入れ替える
  const bad = q.value.blocked ? ruleFor(route.rules, q.value.situation) : null;
  emit("change", route.id, [...route.rules.filter((r) => !same(r) && r !== bad), { when, do: a }]);
  held.value = null; omens.value = [];
}
function useHeld(): void { if (held.value) answer({ use: held.value, omens: omensFor(held.value, omens.value) }); }

// ── 答えた一覧 ─────────────────────────
const listOpen = ref(false);
function whenText(route: string, w: When): string {
  return whenTextOf(props.recipe.routes.find((x) => x.id === route)?.goal ?? [], w, props.nameOfMod);
}
function removeRule(route: string, i: number): void {
  const r = props.recipe.routes.find((x) => x.id === route);
  if (!r || props.locked) return;
  emit("change", route, r.rules.filter((_, k) => k !== i));
}
const routeLabel = (id: string): string => { const n = ROUTE_NAME[id]; return n && n[0] ? tr(n[0], n[1]) : ""; };
const multi = computed(() => props.recipe.routes.length > 1);
</script>

<template>
  <div class="flex flex-col gap-3 text-[13px]">
    <!-- 進み具合 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="tabular-nums text-[var(--exile-color-text-secondary)]">{{ tr(`答えた ${answered}`, `Answered ${answered}`) }}</span>
      <span v-if="left" class="rounded-full bg-[rgba(224,201,122,0.14)] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--exile-color-signal-warn)]">{{ tr(`残り ${left}`, `${left} left`) }}</span>
      <span v-else-if="result && !exploring" class="inline-flex items-center gap-1 text-[12px] text-[var(--exile-color-signal-up)]"><Icon name="check" class="size-3.5" />{{ tr("全部答えた · 回せる", "All answered · ready to run") }}</span>
      <span v-if="exploring" class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ tr("確かめています…", "Checking…") }}</span>
    </div>
    <p v-if="error || startError" class="text-[12px] text-[var(--exile-color-signal-down)]">{{ error || startError }}</p>

    <!-- 問題 -->
    <div v-if="q && item" class="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-5 max-md:grid-cols-1">
      <div class="max-md:mx-auto">
        <StageItemCard :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="260" compact />
      </div>
      <div class="flex min-w-0 flex-col gap-3">
        <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h4 class="text-[15px] font-semibold text-[var(--exile-color-text-primary)]">{{ tr("この時は?", "What now?") }}</h4>
          <span v-if="multi" class="rounded bg-white/[0.06] px-1.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ routeLabel(q.route) }}</span>
          <span class="text-[12px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ tr(`${EXPLORE_RUNS} 人中 ${q.n} 人がここに来た`, `${q.n} of ${EXPLORE_RUNS} runs reach this`) }}</span>
        </header>
        <p v-if="q.blocked" class="rounded-md bg-[rgba(224,108,108,0.1)] px-3 py-2 text-[12px] text-[var(--exile-color-signal-down)]">{{ tr("前の答えはここで打てない", "The previous answer can't be used here") }}: {{ q.reason }}</p>
        <!-- 条件: 押すと「何でも」 -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="flex items-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("条件", "When") }}<HelpTip :text="tr('答えはこの条件の時に使う。押した項目は何でも良くなる (同じ答えで済む状況をまとめる)', 'This answer is used when all of these match. Click an item to accept any value (one answer covers more situations)')" /></span>
          <button v-for="k in chips.main" :key="k" type="button" class="g-plain rounded-md border px-2 py-1 text-left text-[12px] transition" :class="off.has(k) ? 'border-dashed border-white/15 text-[var(--exile-color-text-tertiary)] line-through' : ['border-white/15 bg-white/[0.04]', TONE[toneOf(k)]]" :title="tr('押すと、この項目は何でも良い条件になる', 'Click to accept any value here')" :disabled="locked" @click="toggleChip(k)">{{ chipText(k, q.situation[k]!) }}</button>
          <Disclosure v-if="chips.sub.length" v-model:open="subOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5" />
        </div>
        <div v-if="subOpen" class="flex flex-wrap gap-1.5">
          <button v-for="k in chips.sub" :key="k" type="button" class="g-plain rounded-md border px-2 py-1 text-[12px] transition" :class="off.has(k) ? 'border-dashed border-white/15 text-[var(--exile-color-text-tertiary)] line-through' : 'border-white/15 text-[var(--exile-color-text-secondary)]'" :disabled="locked" @click="toggleChip(k)">{{ chipText(k, q.situation[k]!) }}</button>
        </div>
        <!-- 答え -->
        <div v-if="!locked" class="flex flex-wrap items-center gap-2">
          <!-- スマホは持った物と「この手にする」を画面の下に固定 (棚を下まで送った所から上に戻らせない) -->
          <div v-if="held" class="flex flex-wrap items-center gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-[150] max-md:border-t max-md:border-amber-400/40 max-md:bg-[#14110d] max-md:px-3 max-md:py-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))] max-md:shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
            <span class="flex items-center -space-x-1"><img v-for="ic in [held, ...omensFor(held, omens)].filter((x) => !!iconOf(x))" :key="ic" :src="iconOf(ic)" alt="" class="size-6 object-contain" /></span>
            <b class="text-[var(--exile-color-text-primary)]">{{ actionText({ use: held, omens: omensFor(held, omens) }) }}</b>
            <button type="button" class="g-btn-red sm" @click="useHeld">{{ tr("この手にする", "Use this") }}</button>
            <button type="button" class="g-btn sm" @click="held = null; omens = []">{{ tr("やめる", "Cancel") }}</button>
          </div>
          <template v-else>
            <button v-if="hasHidden" type="button" class="g-btn sm" @click="answer({ reveal: { echoes } })">{{ tr("発現 (狙いを取る)", "Reveal (take a target)") }}</button>
            <label v-if="hasHidden" class="flex items-center gap-1 text-[12px] text-[var(--exile-color-text-secondary)]"><input v-model="echoes" type="checkbox" />{{ nameOf("OmenofAbyssalEchoes") }}</label>
            <button type="button" class="g-btn sm" @click="answer({ restart: true })">{{ tr("買い直して最初から", "Buy a new base") }}</button>
            <span class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ tr("または棚から打つ物を持つ", "or pick a currency below") }}</span>
          </template>
        </div>
        <CurrencyShelf v-if="!locked" full inline-held @hold="(k: string) => (held = k)">
          <template v-if="heldOmens.length" #held>
            <div class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2">
              <p class="mb-1 text-[11px] text-violet-200/80">{{ tr(`${nameOf(held ?? "")} に掛けられるお告げ`, `Omens for ${nameOf(held ?? "")}`) }}</p>
              <div class="flex flex-wrap gap-1.5"><ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="toggleOmen($event)" /></div>
            </div>
          </template>
        </CurrencyShelf>
        <div v-if="held" class="h-16 md:hidden"></div>
      </div>
    </div>
    <p v-else-if="!exploring && result && !left" class="text-[var(--exile-color-text-secondary)]">{{ tr("どの状況にも答えがある。下の「回す」で費用と運の幅を出す", "Every situation has an answer. Run below for the cost and luck range") }}</p>

    <!-- 答えた一覧 (既定で畳む) -->
    <div v-if="answered" class="border-t border-white/[0.06] pt-2">
      <Disclosure v-model:open="listOpen" kind="detail" class="h-7 rounded-md px-2 text-[12px] hover:bg-white/5">{{ tr(`答えた一覧 (${answered})`, `Answers (${answered})`) }}</Disclosure>
      <template v-if="listOpen">
        <div v-for="r in recipe.routes" :key="r.id" class="mt-2">
          <p v-if="multi" class="mb-1 text-[12px] font-semibold text-[var(--exile-color-text-secondary)]">{{ routeLabel(r.id) }}</p>
          <ol class="flex flex-col gap-1">
            <li v-for="(x, i) in r.rules" :key="i" class="group flex items-start gap-2 rounded-md px-2 py-1 hover:bg-white/[0.03]">
              <span class="min-w-0 flex-1"><span class="text-[var(--exile-color-text-secondary)]">{{ whenText(r.id, x.when) }}</span> → <b class="text-[var(--exile-color-text-primary)]">{{ actionText(x.do) }}</b></span>
              <button v-if="!locked" type="button" class="g-plain grid size-6 shrink-0 place-items-center rounded text-[var(--exile-color-text-tertiary)] opacity-0 transition hover:bg-white/10 hover:text-[var(--exile-color-signal-down)] focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" :title="tr('この答えを消す (また聞かれる)', 'Remove this answer (it will be asked again)')" @click="removeRule(r.id, i)"><Icon name="x" class="size-3.5" /></button>
            </li>
          </ol>
        </div>
      </template>
    </div>
  </div>
</template>

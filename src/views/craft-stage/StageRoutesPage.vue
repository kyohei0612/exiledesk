<!--
  StageRoutesPage.vue — スパムシミュレーター (?page=routes、2026-10-18 オーナー「エミュレーターに簡易シミュレーターページ。1 MOD を対象にどのルートが一番早く着くか。
  要はスパム。冒涜スパムは無し。高貴・増強・カオスのスパム」)。カレンシーの見出しの「スパムシミュレーター」で開き、最初に MOD を 1 つ選ぶ (StageAimPicker の routes)。
  オーナー「全てのスパムで計測、100 人で。カオスは今まで通り。カオススパム計算機じゃないから完全でのリロールは無し、カオスは無印と上級」
  計算は services/craft-stage/route-race.ts (エミュレーターと同じ applyCurrency で 1 通り 100 人分)。8 通り (増強・高貴 × 完全 / 上級 / 無印、カオス × 上級 / 無印) を 1 つずつ間を空けて回し、出た順に出す。
  見た目 (2026-10-19 オーナー「UI ダサすぎる、シンプル過ぎる」「各工程で詳しいルールは書いた方が良い」): 上に狙いと一番安い道を大きく、
  下に 3 つの道をカード (カレンシーの絵・打ち方の決まりを番号で・等級ごとの棒と使った物)。1 つの枠 (.g-panel) の中。決まりは route-race.ts と同じ文 (メモ feedback-show-sim-rules)
  値段は今の相場 (priceOf)、ベース代と始めの状態 (増強は白、カオスは MOD 1 つのレア、高貴は MOD 0 のレア。2026-10-19 オーナー) を作る費用は入れない。広告ありきの別のページ (WebApp.vue が両脇の枠を置く)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { routesLuck, routesOpen, routesTarget } from "../../state/web-page";
import StageRouteLuck from "./StageRouteLuck.vue";
import { raceRoutes, type Grade, type RaceRow, type RouteKind } from "../../services/craft-stage/route-race";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { displayCurrency } from "../../state/display-currency";
import { tr } from "../../i18n/lang";
import HelpTip from "../../components/ui/HelpTip.vue";

const GRADE_KEY: Record<Grade, string> = { base: "", greater: "_greater", perfect: "_perfect" };
const GRADE_JA: Record<Grade, [string, string]> = { perfect: ["完全", "Perfect"], greater: ["上級", "Greater"], base: ["無印", "Regular"] };
const RUNS = 100;
type Step = { k: string | null; ja: string; en: string };
/** 道ごと: 名前・主のカレンシー・等級・打ち方の決まり (route-race.ts と同じ。絵と文) */
const ROUTES: Array<{ route: RouteKind; ja: string; en: string; main: string; grades: Grade[]; steps: Step[] }> = [
  { route: "augment", ja: "増強スパム", en: "Augment spam", main: "augment", grades: ["perfect", "greater", "base"], steps: [
    { k: "transmute", ja: "白のベースに変成 (等級は増強と同じ) でマジックにする", en: "Transmute the white base (same grade as the augment) to magic" },
    { k: "annul", ja: "狙いの側に MOD が付いていたら消去 (どれが消えるかは運。反対側が消えることもある。狙いの側が空くまで続ける)", en: "If the target side has a mod, annul (which mod goes is random, the other side may go instead; repeat until the target side is empty)" },
    { k: "augment", ja: "狙いの側が空いたら増強 (両側とも空いている時はどちらに付くかは運。反対側に付いたら次は増強で狙いの側へ)", en: "When the target side is empty, augment (if both sides are empty the side is random; if it lands on the other side, the next augment goes to the target side)" },
    { k: null, ja: "狙いが付くまで 2・3 を繰り返す。マジックで狙いの側に枠が無いベースは使えない", en: "Repeat 2–3 until the target rolls. Bases with no slot on that side while magic can't use this" },
  ] },
  { route: "chaos", ja: "カオススパム", en: "Chaos spam", main: "chaos", grades: ["greater", "base"], steps: [
    { k: "exalt", ja: "MOD 1 つのレアから始める (狙いでない MOD が 1 つ。作る費用は入れない)", en: "Start from a rare with 1 mod (not the target; its cost is not included)" },
    { k: "chaos", ja: "狙いが付くまで同じカオスを打ち続ける (1 つ消えて 1 つ付くので、MOD はずっと 1 つ)", en: "Keep using the same Chaos Orb until the target rolls (one out, one in, so it stays at 1 mod)" },
    { k: null, ja: "完全のカオス (リロール) は入れない", en: "Perfect Chaos (reroll) is not included" },
  ] },
  { route: "exalt", ja: "高貴スパム", en: "Exalt spam", main: "exalt", grades: ["perfect", "greater", "base"], steps: [
    { k: null, ja: "MOD 0 のレアから始める (作る費用は入れない)", en: "Start from a rare with 0 mods (its cost is not included)" },
    { k: "OmenofGreaterExaltation", ja: "高貴 + 偉大な高貴のお告げで 2 つ付ける (どちらの側に付くかは運)", en: "Exalt with Omen of Greater Exaltation to add 2 mods (sides are random)" },
    { k: "annul", ja: "外れたら消去 2 回で MOD 0 に戻して 2 から繰り返す", en: "On a miss, annul twice back to 0 mods and repeat from 2" },
  ] },
];
const ORDER = ROUTES.flatMap((r) => r.grades.map((grade) => ({ route: r.route, grade })));

const t = computed(() => routesTarget.value);
const mod = computed(() => (t.value ? s.data.value?.mods.get(t.value.modId) ?? null : null));
const modText = computed(() => {
  const m = mod.value, tt = t.value;
  if (!m || !tt) return "";
  const tier = m.tiers[tt.minTierIndex];
  return fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
});
const rank = computed(() => (mod.value && t.value ? `T${mod.value.tiers.length - t.value.minTierIndex}` : ""));
const sideJa = computed(() => (mod.value?.type === "suffix" ? tr("サフィックス", "Suffix") : tr("プレフィックス", "Prefix")));
const ilvl = computed(() => s.item.value?.itemLevel ?? s.itemLevel.value);
const rows = ref<RaceRow[]>([]);
const busy = ref(false);
let runId = 0;
/**
 * 100 人の乱数の種。開くたび・狙いを変えるたび・「再計算」のたびに毎回ばらばら (2026-10-19 オーナー「再計算ボタンもあればいいね、疑ってる人多いからな」
 * 「全てにおいて乱数は頼むでな」)
 */
const newSeed = (): number => 1 + Math.floor(Math.random() * 2 ** 30);
const seed = ref(newSeed());
/** 何回目の 100 人か (1 = 最初) */
const round = ref(1);
function recompute(): void {
  if (busy.value) return;
  seed.value = newSeed();
  round.value++;
  luckOpen.value = false;
  void run();
}
async function run(): Promise<void> {
  const d = s.data.value, tt = t.value;
  if (!d || !tt) return;
  const id = ++runId;
  rows.value = [];
  busy.value = true;
  for (const one of ORDER) {
    await new Promise((r) => setTimeout(r, 0));
    if (id !== runId) return;
    rows.value = [...rows.value, ...raceRoutes(d, s.base.value, ilvl.value, tt, priceOf, { runs: RUNS, only: one, seed: seed.value })];
  }
  busy.value = false;
}
watch(t, () => { luckOpen.value = false; seed.value = newSeed(); round.value = 1; void run(); });
/** 運試しの欄 (一番安い道で。2026-10-19 オーナー「一番安い欄に運試しボタン」)。シェアから来た時は計算が済んだら開く */
const luckOpen = ref(false);
watch(busy, (b) => { if (!b && routesLuck.value) { routesLuck.value = false; if (best.value) luckOpen.value = true; } });
const rowOf = (route: RouteKind, grade: Grade): RaceRow | undefined => rows.value.find((r) => r.route === route && r.grade === grade);
const ok = computed(() => rows.value.filter((r) => !r.off));
/** 一番安い (着いた物の中で) */
const best = computed(() => (ok.value.length ? ok.value.reduce((a, b) => (b.avgCost < a.avgCost ? b : a)) : null));
/** 棒の長さの基準 (一番高い「10 人に 1 人」の費用) */
const maxCost = computed(() => Math.max(1e-9, ...ok.value.map((r) => r.p90)));
/** 道がまるごと使えない (増強が使えないベース) */
const offRoute = (route: RouteKind): string | null => { const xs = rows.value.filter((r) => r.route === route); return xs.length && xs.every((r) => r.off) ? xs[0]!.off : null; };
const routeName = (r: RaceRow): string => { const x = ROUTES.find((y) => y.route === r.route)!; return `${tr(x.ja, x.en)} · ${tr(...GRADE_JA[r.grade])}`; };
const mainKey = (r: RaceRow): string => `${ROUTES.find((y) => y.route === r.route)!.main}${GRADE_KEY[r.grade]}`;
const usesOf = (r: RaceRow) => Object.entries(r.uses).sort((a, b) => b[1] - a[1]);
const pct = (x: number): string => `${Math.max(2, Math.min(100, (x / maxCost.value) * 100))}%`;
const money = (x: number): string => displayCurrency.money(x);
const fmtN = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1));
function back(): void { routesLuck.value = false; s.aimPicker.value = null; routesOpen.value = false; routesTarget.value = null; }
function pickMod(): void { s.aimPicker.value = { seed: null, routes: true }; }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !s.aimPicker.value) back(); }
let before = 0;
onMounted(() => { before = window.scrollY; window.scrollTo(0, 0); window.addEventListener("keydown", onKey); void run(); });
onBeforeUnmount(() => { runId++; window.removeEventListener("keydown", onKey); const y = before; requestAnimationFrame(() => window.scrollTo(0, y)); });
</script>

<template>
  <section data-routes-page class="min-w-0 flex-1 p-4">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("スパムシミュレーター", "Spam simulator") }}</h1>
      <span class="flex items-center gap-2">
        <button type="button" data-routes-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
        <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
      </span>
    </div>

    <!-- まだ狙いが無い: MOD を選ぶ -->
    <div v-if="!t" class="g-panel flex flex-col items-center gap-4 px-4 py-10 text-center">
      <div class="flex items-center gap-3">
        <img v-for="k in ['augment', 'chaos', 'exalt']" :key="k" :src="iconOf(k)" alt="" class="size-12 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]" />
      </div>
      <p class="max-w-[30rem] text-[13px] text-[var(--exile-color-text-secondary)]">{{ tr(`狙う MOD を 1 つ選ぶと、増強・カオス・高貴のスパムをそれぞれ ${RUNS} 人が打って、どれが一番安く着くかを比べます`, `Pick one mod: ${RUNS} people try each of augment, chaos and exalt spam to see which gets there cheapest`) }}</p>
      <button type="button" data-routes-pick class="g-btn-red min-w-48" @click="pickMod">{{ tr("狙う MOD を選ぶ", "Pick a mod") }}</button>
    </div>

    <div v-else class="g-panel px-4 py-3">
      <!-- 上: 狙い (アイテムの札の見た目) と一番安い道 -->
      <div class="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div class="flex min-w-0 flex-col justify-center rounded-md border border-[var(--exile-color-border-brass)]/40 bg-black/40 px-4 py-3 text-center shadow-[inset_0_0_24px_rgba(0,0,0,0.7)]">
          <p class="text-[11px] tracking-[0.2em] text-[var(--exile-color-text-tertiary)]">{{ tr("狙い", "TARGET") }} · {{ sideJa }}</p>
          <p class="mt-1 text-[16px] font-bold leading-snug text-[var(--color-rarity-magic)] [text-shadow:0_1px_2px_#000]">{{ modText }}</p>
          <p class="mt-1"><span class="rounded-sm bg-amber-500/25 px-1.5 text-[11px] font-bold text-amber-100">{{ tr(`${rank} 以上で当たり`, `Hit at ${rank}+`) }}</span></p>
          <p class="mt-2 text-[12px] text-[var(--exile-color-text-secondary)]">{{ s.item.value?.baseJa ?? s.base.value }} · {{ tr(`アイテムレベル ${ilvl}`, `Item level ${ilvl}`) }}</p>
          <p class="mt-2"><button type="button" data-routes-pick class="g-btn sm" @click="pickMod">{{ tr("MOD を選び直す", "Change mod") }}</button></p>
        </div>
        <div data-routes-best class="relative flex min-w-0 items-center gap-4 overflow-hidden rounded-md border border-emerald-400/30 bg-gradient-to-r from-emerald-500/[0.12] via-emerald-500/[0.04] to-transparent px-4 py-3">
          <template v-if="best">
            <img :src="iconOf(mainKey(best))" alt="" class="size-16 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(110,231,183,0.35)] max-md:size-12" />
            <div class="min-w-0 flex-1">
              <p class="text-[11px] tracking-[0.2em] text-emerald-200/80">{{ busy ? tr("今のところ一番安い", "CHEAPEST SO FAR") : tr("一番安い", "CHEAPEST") }}</p>
              <p class="g-brush truncate text-[20px] text-[var(--exile-color-text-title)] max-md:text-[16px]">{{ routeName(best) }}</p>
              <p class="tabular-nums"><b class="text-[26px] text-emerald-300 max-md:text-[20px]">{{ money(best.avgCost) }}</b> <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(`平均 · ${fmtN(best.avgSteps)} 手`, `avg · ${fmtN(best.avgSteps)} uses`) }}</span></p>
              <p class="text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">{{ tr("半分の人", "Half") }} {{ money(best.p50) }} · {{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }} {{ money(best.p90) }}</p>
            </div>
            <span class="flex shrink-0 flex-col items-stretch gap-1.5 max-md:self-end">
            <button v-if="!busy && !luckOpen" type="button" data-route-luck-open class="g-btn-red" :title="tr('この道の決まりで、100 人と同じ始めの状態から自分でスパムして運を比べる', 'Spam it yourself with this route from the same start and compare your luck with the 100 people')" @click="luckOpen = true">{{ tr("運試し", "Luck test") }}</button>
            <button v-if="!busy" type="button" data-route-recompute class="g-btn sm" :title="tr('別の 100 人でもう一度全部の道を計算する (乱数を変える)', 'Run all routes again with a different 100 people (new random seed)')" @click="recompute">{{ tr("再計算", "Recompute") }}</button>
            <span v-if="!busy && round > 1" class="text-center text-[10px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ tr(`${round} 回目の 100 人`, `100 people, run ${round}`) }}</span>
            </span>
          </template>
          <p v-else class="text-[13px] text-[var(--exile-color-text-secondary)]">{{ busy ? tr("計算中…", "Calculating…") : tr("どの道でも着かなかった", "No route reached it") }}</p>
          <p v-if="busy" class="absolute right-3 top-2 text-[11px] tabular-nums text-amber-200">{{ tr("計算中", "Calculating") }} {{ rows.length }} / {{ ORDER.length }}</p>
        </div>
      </div>

      <!-- 運試し (一番安い道で。StageRouteLuck.vue) -->
      <StageRouteLuck v-if="luckOpen && best && !busy" :row="best" :target="t" :ilvl="ilvl" :label="`${modText} (${tr(`${rank} 以上`, `${rank}+`)})`" :route-name="routeName(best)" @close="luckOpen = false" />
      <!-- 下: 3 つの道 -->
      <div class="g-section mt-4 grid gap-3 lg:grid-cols-3">
        <article v-for="r in ROUTES" :key="r.route" :data-route="r.route" class="flex min-w-0 flex-col rounded-md border bg-white/[0.025] p-3" :class="[best && best.route === r.route ? 'border-emerald-400/35' : 'border-white/10', offRoute(r.route) ? 'opacity-50' : '']">
          <header class="flex items-center gap-2">
            <img :src="iconOf(r.main)" alt="" class="size-10 object-contain" />
            <b class="g-sec-title !text-[18px]">{{ tr(r.ja, r.en) }}</b>
          </header>
          <!-- 打ち方の決まり (番号順。route-race.ts と同じ) -->
          <ol data-route-rules class="mt-2 flex flex-col gap-1 rounded bg-black/30 px-2 py-1.5 text-[11px] leading-snug text-[var(--exile-color-text-secondary)]">
            <li v-for="(st, i) in r.steps" :key="i" class="flex items-start gap-1.5">
              <span class="mt-px w-3 shrink-0 text-right tabular-nums text-[var(--exile-color-text-tertiary)]">{{ i + 1 }}</span>
              <img v-if="st.k" :src="iconOf(st.k)" alt="" class="size-4 shrink-0 object-contain" />
              <span v-else class="w-4 shrink-0 text-center opacity-60">↻</span>
              <span class="min-w-0">{{ tr(st.ja, st.en) }}</span>
            </li>
          </ol>
          <p v-if="offRoute(r.route)" class="mt-4 py-4 text-center text-[12px]">{{ offRoute(r.route) }}</p>
          <ul v-else class="mt-3 flex flex-col gap-2">
            <li v-for="g in r.grades" :key="g" data-route-row class="rounded px-2 py-1.5" :class="rowOf(r.route, g) && best === rowOf(r.route, g) ? 'bg-emerald-500/10 ring-1 ring-emerald-400/30' : 'bg-black/25'">
              <template v-if="rowOf(r.route, g)">
                <div class="flex items-center gap-2 text-[12px]">
                  <img :src="iconOf(`${r.main}${GRADE_KEY[g]}`)" alt="" class="size-6 object-contain" />
                  <span class="w-9 shrink-0">{{ tr(...GRADE_JA[g]) }}</span>
                  <template v-if="!rowOf(r.route, g)!.off">
                    <b class="tabular-nums" :class="best === rowOf(r.route, g) ? 'text-emerald-300' : 'text-[var(--exile-color-text-primary)]'">{{ money(rowOf(r.route, g)!.avgCost) }}</b>
                    <span class="text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ tr(`${fmtN(rowOf(r.route, g)!.avgSteps)} 手`, `${fmtN(rowOf(r.route, g)!.avgSteps)} uses`) }}</span>
                    <span v-if="best === rowOf(r.route, g)" class="ml-auto rounded bg-emerald-500/25 px-1 text-[10px] text-emerald-200">{{ tr("一番安い", "Cheapest") }}</span>
                    <span v-else-if="best" class="ml-auto text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]" :title="tr('一番安い道の何倍か', 'Times the cheapest')">× {{ (rowOf(r.route, g)!.avgCost / best.avgCost).toFixed(1) }}</span>
                  </template>
                  <span v-else class="ml-auto text-[11px] opacity-60">{{ rowOf(r.route, g)!.off }}</span>
                </div>
                <template v-if="!rowOf(r.route, g)!.off">
                  <!-- 運の幅: 濃い所 = 半分の人まで、薄い所 = 運が悪い 10 人に 1 人まで、白い線 = 平均 -->
                  <div class="relative mt-1.5 h-2 rounded-full bg-white/[0.06]" :title="tr(`半分の人 ${money(rowOf(r.route, g)!.p50)} · 10 人に 1 人 ${money(rowOf(r.route, g)!.p90)}`, `Half ${money(rowOf(r.route, g)!.p50)} · 1 in 10 ${money(rowOf(r.route, g)!.p90)}`)">
                    <span class="absolute inset-y-0 left-0 rounded-full bg-amber-400/25" :style="{ width: pct(rowOf(r.route, g)!.p90) }" />
                    <span class="absolute inset-y-0 left-0 rounded-full" :class="best === rowOf(r.route, g) ? 'bg-emerald-400/80' : 'bg-amber-400/70'" :style="{ width: pct(rowOf(r.route, g)!.p50) }" />
                    <span class="absolute -inset-y-0.5 w-0.5 bg-white/80" :style="{ left: pct(rowOf(r.route, g)!.avgCost) }" />
                  </div>
                  <!-- 1 人あたり平均で使った物 -->
                  <p class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">
                    <span v-for="[k, n] in usesOf(rowOf(r.route, g)!)" :key="k" class="inline-flex items-center gap-0.5" :title="nameOf(k)"><img :src="iconOf(k)" alt="" class="size-4 object-contain" />× {{ fmtN(n) }}</span>
                  </p>
                </template>
              </template>
              <div v-else class="flex items-center gap-2 text-[12px] opacity-50">
                <img :src="iconOf(`${r.main}${GRADE_KEY[g]}`)" alt="" class="size-6 object-contain" />
                <span>{{ tr(...GRADE_JA[g]) }}</span>
                <span class="ml-auto animate-pulse text-[11px]">{{ tr("計算中…", "Calculating…") }}</span>
              </div>
            </li>
          </ul>
        </article>
      </div>

      <p class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
        <span class="inline-flex items-center gap-1"><span class="inline-block h-2 w-5 rounded-full bg-amber-400/70" />{{ tr("半分の人が着いた費用", "Half had hit by") }}</span>
        <span class="inline-flex items-center gap-1"><span class="inline-block h-2 w-5 rounded-full bg-amber-400/25" />{{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }}</span>
        <span class="inline-flex items-center gap-1"><span class="inline-block h-2.5 w-0.5 bg-white/80" />{{ tr("平均", "Average") }}</span>
        <span>{{ tr(`· エミュレーターと同じ決まりで決まりの始めの状態から ${RUNS} 人ずつ。値段は今の相場、ベース代と始めの状態を作る費用は入れない`, `· ${RUNS} runs each from the listed start with the Emulator's rules. Current prices; base and start-state costs not included`) }}</span>
        <HelpTip :title="tr('比べ方', 'How it compares')" :width="340" class="ml-auto">
          <p>{{ tr("手 = 打った回数 (お告げは数えない)。費用 = 打った物とお告げの値段の合計。ベース代と始めの状態 (MOD 0 / 1 つのレア) を作る費用は入れていない", "Uses = items used (omens not counted). Cost = currency plus omens. The base and the start state (rare with 0 / 1 mod) are left out") }}</p>
          <p class="mt-1 text-[var(--exile-color-text-secondary)]">{{ tr("冒涜スパムは入れていない", "Desecration spam is not included") }}</p>
        </HelpTip>
      </p>
    </div>
  </section>
</template>

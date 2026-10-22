<!--
  StageRoutesPage.vue — スパムシミュレーター (?page=routes、2026-10-18 オーナー「エミュレーターに簡易シミュレーターページ。1 MOD を対象にどのルートが一番早く着くか。
  要はスパム。冒涜スパムは無し。高貴・増強・カオスのスパム」)。カレンシーの見出しの「スパムシミュレーター」で開き、最初に MOD を 1 つ選ぶ (StageAimPicker の routes)。
  オーナー「全てのスパムで計測、100 人で。カオスは今まで通り」。カオスの完全は最初は外していたが入れる (2026-10-19 オーナー「流石に完全カオスも出してあげるか」)
  計算は services/craft-stage/route-race.ts (エミュレーターと同じ applyCurrency で 1 通り 100 人分)。9 通り (3 つの道 × 無印 / 上級 / 完全) を 1 つずつ間を空けて回し、出た順に出す (回す順も道のカードの並びも無印から。2026-10-22 オーナー「無印から実行してくれ」)。
  見た目 (2026-10-19 オーナー「UI ダサすぎる、シンプル過ぎる」「各工程で詳しいルールは書いた方が良い」): 上に狙いと一番安い道を大きく、
  下に 3 つの道をカード (カレンシーの絵・打ち方の決まりを番号で・等級ごとの棒と使った物)。1 つの枠 (.g-panel) の中。決まりは route-race.ts と同じ文 (メモ feedback-show-sim-rules)
  値段は今の相場 (priceOf)、ベース代と始めの状態 (増強は白、カオスは MOD 1 つのレア、高貴は MOD 0 のレア。2026-10-19 オーナー) を作る費用は入れない。広告ありきの別のページ (WebApp.vue が両脇の枠を置く)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { StageItem } from "../../services/craft-stage/types";
import { craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { ROUTES_MAX, ROUTES_MULTI_ON, routesLuck, routesOpen, routesRunes, routesShared, routesTarget } from "../../state/web-page";
import { revealNext } from "../../utils/keep-place";
import StageRoutesIntro from "./StageRoutesIntro.vue";
import StageRouteRunes from "./StageRouteRunes.vue";
import { routeRunesFor, runePrep } from "../../services/craft-stage/route-runes";
import { stageRuneIds } from "../../services/craft-stage/stage-core";
import StageRouteLuck from "./StageRouteLuck.vue";
import { hitItemOf, placeOnStage } from "./route-place";
import { GRADE_KEY, raceOne, unpackRace, type Grade, type RaceRow, type RouteKind } from "../../services/craft-stage/route-race";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { displayCurrency } from "../../state/display-currency";
import { tr } from "../../i18n/lang";
import { track } from "../../utils/track";
import { logRecord } from "../../utils/log-record";
import HelpTip from "../../components/ui/HelpTip.vue";
import BusyTag from "../../components/ui/BusyTag.vue";

const GRADE_JA: Record<Grade, [string, string]> = { perfect: ["完全", "Perfect"], greater: ["上級", "Greater"], base: ["無印", "Regular"] };
/** 1 通りの人数。スマホは 10 人 (2026-10-19 スマホ相当で 100 人は 35 秒・画面が最長 9 秒固まった。オーナー「スマホだと 10 人だな規模感的に」) */
const RUNS = typeof window !== "undefined" && window.innerWidth < 768 ? 10 : 100;
type Step = { k: string | null; ja: string; en: string };
/** 道ごと: 名前・主のカレンシー・等級・打ち方の決まり (route-race.ts と同じ。絵と文) */
const ROUTES: Array<{ route: RouteKind; ja: string; en: string; main: string; grades: Grade[]; steps: Step[] }> = [
  { route: "augment", ja: "増強スパム", en: "Augment spam", main: "augment", grades: ["base", "greater", "perfect"], steps: [
    { k: "transmute", ja: "白のベースに変成 (等級は増強と同じ) でマジックにする", en: "Transmute the white base (same grade as the augment) to magic" },
    { k: "annul", ja: "狙いの側に MOD が付いていたら消去 (どれが消えるかは運。反対側が消えることもある。狙いの側が空くまで続ける)", en: "If the target side has a mod, annul (which mod goes is random, the other side may go instead; repeat until the target side is empty)" },
    { k: "augment", ja: "狙いの側が空いたら増強 (両側とも空いている時はどちらに付くかは運。反対側に付いたら次は増強で狙いの側へ)", en: "When the target side is empty, augment (if both sides are empty the side is random; if it lands on the other side, the next augment goes to the target side)" },
    { k: null, ja: "狙いが付くまで 2・3 を繰り返す。マジックで狙いの側に枠が無いベースは使えない", en: "Repeat 2–3 until the target rolls. Bases with no slot on that side while magic can't use this" },
  ] },
  { route: "chaos", ja: "カオススパム", en: "Chaos spam", main: "chaos", grades: ["base", "greater", "perfect"], steps: [
    { k: "exalt", ja: "MOD 1 つのレアから始める (狙いでない MOD が 1 つ。作る費用は入れない)", en: "Start from a rare with 1 mod (not the target; its cost is not included)" },
    { k: "chaos", ja: "狙いが付くまで同じカオスを打ち続ける (1 つ消えて 1 つ付くので、MOD はずっと 1 つ)", en: "Keep using the same Chaos Orb until the target rolls (one out, one in, so it stays at 1 mod)" },
  ] },
  { route: "exalt", ja: "高貴スパム", en: "Exalt spam", main: "exalt", grades: ["base", "greater", "perfect"], steps: [
    { k: null, ja: "MOD 0 のレアから始める (作る費用は入れない)", en: "Start from a rare with 0 mods (its cost is not included)" },
    { k: "OmenofGreaterExaltation", ja: "高貴 + 偉大な高貴のお告げで 2 つ付ける (どちらの側に付くかは運)", en: "Exalt with Omen of Greater Exaltation to add 2 mods (sides are random)" },
    { k: "annul", ja: "外れたら消去 2 回で MOD 0 に戻して 2 から繰り返す", en: "On a miss, annul twice back to 0 mods and repeat from 2" },
  ] },
];
/** 最初の画面のカード (始めの状態。打ち方は steps をそのまま出す) */
const INTRO = ROUTES.map((r) => ({ ...r, start: ({ augment: ["白のベース", "White base"], chaos: ["MOD 1 つのレア", "Rare with 1 mod"], exalt: ["MOD 0 のレア", "Rare with 0 mods"] } as const)[r.route] as [string, string] }));
/**
 * 嵌めて打つルーン (StageRouteRunes.vue。2026-10-19 オーナー「ルーン嵌めた状態でスパムシミュレーターやらないと確率違うぞ」)。
 * 既定はエミュレーターのアイテムに嵌めている物 (この部位で確率が変わる物だけ)。狙いが特殊 MOD なら、そのルーンは必ず嵌める
 */
const runeNeed = computed((): string[] => [...new Set(aims.value.map((a) => a.m.rune).filter((r): r is string => !!r))]);
const runeIds = computed((): string[] => {
  const ok = new Set(routeRunesFor(s.item.value).map((r) => r.id));
  const base = routesRunes.value ?? (s.item.value ? stageRuneIds(s.item.value).filter((id) => ok.has(id)) : []);
  return [...new Set([...runeNeed.value, ...base])];
});
function setRunes(ids: string[]): void { routesRunes.value = ids; }
const prep = computed(() => (s.data.value && !fromItem.value ? runePrep(s.data.value, runeIds.value) : undefined));
/**
 * 始めの状態を今のクラフトのアイテムにする (2026-10-22 要望 51092b58、オーナー「現在のクラフトを参照した状態からカオススパムできるようにしたらええんやない」)。
 * カオスの道だけ、フラクチャー・品質・ルーン込みでそのアイテムから打つ (route-race.ts の from)。2026-10-22 オーナー OK で本番へ (v0.1.593)。null = 決まりの形
 */
const FROM_ON = true;
const fromItem = shallowRef<StageItem | null>(null);
const canFrom = computed(() => FROM_ON && s.item.value?.rarity === "rare" && s.item.value.prefixes.length + s.item.value.suffixes.length > 0);
function setFrom(on: boolean): void {
  if (!!fromItem.value === on) return;
  fromItem.value = on ? s.item.value : null;
  resetRace();
}
/** 使えない理由の英語 (route-race.ts の文) */
const OFF_EN: Record<string, string> = {
  "マジックに狙いの側の枠が無いベース": "This base has no slot on the target side while magic",
  "上限の手数までに付かなかった (この等級では付かない段かも)": "Didn't hit within the use cap (this grade may not roll that tier)",
  "今のアイテムから始める時はカオスだけ": "Only Chaos when starting from the current item",
  "今のアイテムがレアでない": "The current item isn't rare",
  "今のアイテムにもう狙いが付いている": "The current item already has the target",};
const offText = (x: string): string => tr(x, OFF_EN[x] ?? x);
/** 道のカード (今のアイテムから始める時は、カオスの 1 番目の決まりを差し替える) */
const FROM_STEP: Step = { k: null, ja: "今のクラフトのアイテムから始める (フラクチャー・品質・ルーンもそのまま。カオスで消えるのはフラクチャー以外。フラクチャーだけなら先に高貴 1 回で 1 つ足す)", en: "Start from the current craft item (fractures, quality and runes kept; Chaos only removes non-fractured mods. If only fractured mods, one Exalted Orb adds a mod first)" };
const shownRoutes = computed(() => (fromItem.value ? ROUTES.map((r) => (r.route === "chaos" ? { ...r, steps: [FROM_STEP, ...r.steps.slice(1)] } : r)) : ROUTES));
const ORDER = ROUTES.flatMap((r) => r.grades.map((grade) => ({ route: r.route, grade })));

/** 当たり (並べた物のどれか 1 つが付いたら止める。2 つ以上は開発版だけ ROUTES_MULTI_ON) */
const t = computed(() => (routesTarget.value?.length ? routesTarget.value : null));
/** 当たりごとの文・段・側 (狙いの札と内訳に出す) */
const aims = computed(() => (t.value ?? []).flatMap((tt) => {
  const m = s.data.value?.mods.get(tt.modId);
  if (!m) return [];
  const tier = m.tiers[tt.minTierIndex];
  const text = fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ");
  const rank = `T${m.tiers.length - tt.minTierIndex}`;
  return [{ m, text, rank, side: m.type === "suffix" ? tr("サフィックス", "Suffix") : tr("プレフィックス", "Prefix"), label: `${text} (${tr(`${rank} 以上`, `${rank}+`)})` }];
}));
const aimKey = computed(() => (t.value ?? []).map((x) => `${x.modId}#${x.minTierIndex}`).join(","));
/** 当たりを 1 つ外す (最後の 1 つは外さない、選び直しで変える) */
function removeAim(i: number): void {
  const xs = routesTarget.value ?? [];
  if (xs.length > 1) routesTarget.value = xs.filter((_, k) => k !== i);
}
/** 道の行の「どの当たりで止まったか」(当たりが 2 つ以上の時だけ) */
const hitsOf = (r: RaceRow): Array<{ label: string; n: number; pct: string }> => {
  if (aims.value.length < 2 || r.hitsBy.length !== aims.value.length) return [];
  const sum = r.hitsBy.reduce((a, b) => a + b, 0);
  return sum ? aims.value.map((a, i) => ({ label: a.text, n: r.hitsBy[i]!, pct: `${Math.round((r.hitsBy[i]! / sum) * 100)}%` })) : [];
};
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
/**
 * 計算は「計算開始」を押した時だけ (2026-10-19 オーナー「PC でもまぁまぁ重い、即計算ではなく計算開始を MOD を選ぶの下に。中止ボタンも、
 * 計算開始が中止に変わる仕組み。開いたら即計算開始はダメ」)。2 回目からは別の 100 人 (再計算と同じ)
 */
const started = ref(false);
/** 出ている結果がシェアした人の物 (自分で計算した 1 回目は「1 回目」のまま) */
const fromShare = ref(false);
function start(): void {
  if (busy.value || !t.value) return;
  if (started.value) { seed.value = newSeed(); if (!fromShare.value) round.value++; }
  fromShare.value = false;
  started.value = true;
  luckRow.value = null;
  void run();
}
/** 中止 (出た分の道はそのまま残す) */
function stop(): void {
  runId++;
  busy.value = false;
  calcLog(false);
}
/** 計算の記録 (2026-10-19 PV の点検で抜けていた)。done = 最後まで / false = 中止 (k = 出た通り数) */
function calcLog(done: boolean): void {
  const tt = t.value;
  track("routes:calc", done ? "done" : "stop");
  logRecord("routes_calc", { base: s.base.value, mod: tt ? aimKey.value : null, ilvl: ilvl.value, runes: runeIds.value, n: RUNS, done, k: rows.value.length, from: !!fromItem.value, best: best.value ? `${best.value.route}:${best.value.grade}` : null });
}
const recompute = start;
/** 狙い・ルーンが変わったら、計算の前に戻す (計算はしない) */
function resetRace(): void {
  runId++;
  busy.value = false;
  rows.value = [];
  luckRow.value = null;
  started.value = false;
  round.value = 1;
  seed.value = newSeed();
}
async function run(): Promise<void> {
  const d = s.data.value, tt = t.value;
  if (!d || !tt) return;
  const id = ++runId;
  // シェアから来た時: 計算せずにシェアした人の結果を出して、すぐ運試し
  const sh = routesShared.value;
  if (sh) {
    routesShared.value = null;
    started.value = true;
    fromShare.value = true;
    rows.value = unpackRace(sh);
    busy.value = false;
    routesLuck.value = false;
    openLuck(rows.value.find((r) => r.route === sh.l[0] && r.grade === sh.l[1]) ?? bestLuck.value);
    track("routes:shared", `${sh.l[0]}:${sh.l[1]}`);
    logRecord("routes_shared", { base: s.base.value, mod: aimKey.value, route: `${sh.l[0]}:${sh.l[1]}`, n: sh.n });
    return;
  }
  rows.value = [];
  busy.value = true;
  peopleDone.value = 0;
  for (const [i, one] of ORDER.entries()) {
    await new Promise((r) => setTimeout(r, 0));
    if (id !== runId) return;
    const row = await raceOne(d, s.base.value, ilvl.value, tt, priceOf, one.route, one.grade, { runs: RUNS, seed: seed.value, prep: prep.value, from: fromItem.value ?? undefined, stop: () => id !== runId, onPerson: (k) => { peopleDone.value = i * RUNS + k; } });
    if (!row || id !== runId) return;
    rows.value = [...rows.value, row];
  }
  busy.value = false;
  calcLog(true);
  // 次に押すのは一番安い欄の「運試し」(2026-10-19 オーナー「次入力するとこまで自動スクロール」)
  next("[data-routes-best]");
}
watch(aimKey, (v) => { resetRace(); if (v) next("[data-routes-target]"); }); // 狙いを選んだら次は「計算開始」(狙いの札の中。札ごと見せる)
// 嵌めるルーンを変えたら、別の 100 人で計算し直す
watch(() => runeIds.value.join(), () => { if (t.value) resetRace(); });
/** 運試しの欄 (一番安い道で。2026-10-19 オーナー「一番安い欄に運試しボタン」)。シェアから来た時は計算が済んだら開く */
/** 運試しの道 (一番安い欄・道のカードの下のボタンから。2026-10-19 オーナー「それぞれ運試しボタン、運試しはここに出す」)。null = 閉じている */
const luckRow = ref<RaceRow | null>(null);
const luckOpen = computed(() => !!luckRow.value);
/** 運試しを開いて、その欄を画面に入れる */
function openLuck(r: RaceRow | null): void {
  if (!r || !canLuck(r)) return;
  if (luckRow.value !== r) track("routes:luck", `${r.route}:${r.grade}`);
  luckRow.value = r;
  // 運試しの欄を見せる (押すボタンは PC は欄の中、スマホは画面の下の帯で動かない)
  next("[data-route-luck]");
}
/** 次に押す所へ送る (描き直しの後。utils/keep-place.ts の revealNext = 下の線 + 24px、上にあれば戻る) */
function next(sel: string): void { void nextTick(() => requestAnimationFrame(() => revealNext(document.querySelector(sel)))); }
/**
 * 運試しができる道 = 着いた人の手数を持っている物。シェアから開いた時は運試しの道しか持っていない
 * (2026-10-19 点検: 手数の無い道で運試しを開けて、順位がいつも上位 1% になっていた)
 */
const canLuck = (r: RaceRow): boolean => !r.off && r.tries.length > 0;
/**
 * 当たった形でクラフト台に戻る (道のカード・一番安い欄から。2026-10-22 オーナー「スパムしてクラフトに戻れるけど、付いた状態で戻れない」)。
 * その道・等級で 1 人を当たるまで打ち、その形を置く。工程の 1 行の費用は 100 人の平均 (route-place.ts)。付かなければ何もしない
 */
const placeMiss = ref(false);
/** 裏で 1 人回している (読み込み中の札) */
const placing = ref(false);
/** 計算の進み: 終わった人数 (全部の道 × 等級を通して。読み込み中の n/m) */
const peopleDone = ref(0);
const placeTitle = computed(() => tr("この道の一番安い等級で 1 人を当たるまで打ち、その形をクラフト台に置く (工程に 1 行、費用は 100 人の平均。1 つ戻す・Ctrl+Z で消える)", "Spam once with this route's cheapest grade until it hits and put that item on the craft stage (one step, cost = average of 100; Undo / Ctrl+Z removes it)"));
async function placeHit(r: RaceRow | null): Promise<void> {
  const tt = t.value;
  if (!r || !tt || !canLuck(r) || placing.value) return;
  placing.value = true;
  const hit = await hitItemOf(r, tt, ilvl.value, prep.value, fromItem.value);
  placing.value = false;
  track("routes:place", r.route);
  placeMiss.value = !hit || !placeOnStage(hit.item, r, { cost: r.avgCost, n: hit.n, avg: true });
}
/** 道の中で一番安い、運試しができる等級 */
const bestIn = (route: RouteKind): RaceRow | null => { const xs = ok.value.filter((r) => r.route === route && canLuck(r)); return xs.length ? xs.reduce((a, b) => (b.avgCost < a.avgCost ? b : a)) : null; };
/** 運試しができる中で一番安い (一番安い欄の「運試し」) */
const bestLuck = computed(() => { const xs = ok.value.filter(canLuck); return xs.length ? xs.reduce((a, b) => (b.avgCost < a.avgCost ? b : a)) : null; });
watch(busy, (b) => { if (!b && routesLuck.value) { routesLuck.value = false; openLuck(bestLuck.value); } });
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
function back(): void { routesLuck.value = false; routesRunes.value = null; s.aimPicker.value = null; routesOpen.value = false; routesTarget.value = null; }
function pickMod(): void { s.aimPicker.value = { seed: null, routes: true }; }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !s.aimPicker.value) back(); }
let before = 0;
onMounted(() => { before = window.scrollY; window.scrollTo(0, 0); window.addEventListener("keydown", onKey); if (routesShared.value) void run(); else if (!t.value) next("[data-routes-pick]"); }); // 開いたら次は「狙う MOD を選ぶ」 (スマホは 3 つのカードの下)
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
    <StageRoutesIntro v-if="!t" :routes="INTRO" :runs="RUNS" :picked="runeIds" :required="runeNeed" @pick="pickMod" @runes="setRunes" />

    <div v-else class="g-panel px-4 py-3">
      <!-- 上: 狙い (アイテムの札の見た目) と一番安い道 -->
      <div class="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div data-routes-target class="flex min-w-0 flex-col justify-center rounded-md border border-[var(--exile-color-border-brass)]/40 bg-black/40 px-4 py-3 text-center shadow-[inset_0_0_24px_rgba(0,0,0,0.7)]">
          <template v-if="aims.length === 1">
            <p class="text-[11px] tracking-[0.2em] text-[var(--exile-color-text-tertiary)]">{{ tr("狙い", "TARGET") }} · {{ aims[0]!.side }}</p>
            <p class="mt-1 text-[16px] font-bold leading-snug text-[var(--color-rarity-magic)] [text-shadow:0_1px_2px_#000]">{{ aims[0]!.text }}</p>
            <p class="mt-1"><span class="rounded-sm bg-amber-500/25 px-1.5 text-[11px] font-bold text-amber-100">{{ tr(`${aims[0]!.rank} 以上で当たり`, `Hit at ${aims[0]!.rank}+`) }}</span></p>
          </template>
          <!-- 当たりが 2 つ以上 (開発版だけ): どれか 1 つが付いたら止める -->
          <template v-else>
            <p class="text-[11px] tracking-[0.2em] text-[var(--exile-color-text-tertiary)]">{{ tr("当たり (どれか 1 つ)", "TARGETS (ANY ONE)") }}</p>
            <ul data-routes-aims class="mt-1 flex flex-col gap-1 text-left">
              <li v-for="(a, i) in aims" :key="i" class="flex min-w-0 items-center gap-2 rounded bg-white/[0.04] px-2 py-1">
                <span class="w-6 shrink-0 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ a.m.type === "suffix" ? "S" : "P" }}</span>
                <span class="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--color-rarity-magic)]" :title="a.text">{{ a.text }}</span>
                <span class="shrink-0 rounded-sm bg-amber-500/25 px-1.5 text-[11px] font-bold text-amber-100">{{ tr(`${a.rank} 以上`, `${a.rank}+`) }}</span>
                <button type="button" class="g-plain grid size-7 shrink-0 place-items-center opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="busy" :title="tr('この当たりを外す', 'Remove this target')" @click="removeAim(i)">×</button>
              </li>
            </ul>
          </template>
          <p class="mt-2 text-[12px] text-[var(--exile-color-text-secondary)]">{{ s.item.value?.baseJa ?? s.base.value }} · {{ tr(`アイテムレベル ${ilvl}`, `Item level ${ilvl}`) }}</p>
          <!-- 始めの状態 (開発版だけ): 決まりの形 / 今のクラフトのアイテム (カオスだけ) -->
          <span v-if="canFrom || fromItem" data-routes-from class="mt-2 flex flex-wrap items-center justify-center gap-1 text-[11px]">
            <span class="text-[var(--exile-color-text-tertiary)]">{{ tr("始めの状態", "Start") }}</span>
            <button type="button" data-routes-from-rule class="g-tab !min-h-[28px] !px-2 !text-[12px]" :class="!fromItem ? 'on' : ''" :disabled="busy" @click="setFrom(false)">{{ tr("決まりの形", "Listed start") }}</button>
            <button type="button" data-routes-from-item class="g-tab !min-h-[28px] !px-2 !text-[12px]" :class="fromItem ? 'on' : ''" :disabled="busy || !canFrom" :title="tr('今のクラフトのアイテム (フラクチャー・付いている MOD・品質・ルーン込み) からカオススパム。クラフトのアイテムは変わらない', 'Chaos spam from the current craft item (fractures, mods, quality and runes included). The craft item itself is not changed')" @click="setFrom(true)">{{ tr("今のアイテムから (カオス)", "Current item (Chaos)") }}</button>
          </span>
          <p class="mt-2 flex flex-wrap justify-center gap-2"><button type="button" data-routes-pick class="g-btn sm" :disabled="busy" @click="pickMod">{{ tr("MOD を選び直す", "Change mod") }}</button><button v-if="ROUTES_MULTI_ON && aims.length < ROUTES_MAX" type="button" data-routes-add class="g-btn sm" :disabled="busy" :title="tr(`当たりを ${ROUTES_MAX} つまで並べられる (どれか 1 つが付いたら止める)`, `Up to ${ROUTES_MAX} targets (stops when any one rolls)`)" @click="pickMod">{{ tr("＋ 当たりを足す", "+ Add target") }}</button></p>
          <!-- 計算開始 ⇔ 中止 (同じ場所のボタンが変わる) -->
          <p class="mt-2"><button type="button" data-routes-start class="min-h-11 w-full max-w-[16rem]" :class="busy ? 'g-btn' : 'g-btn-red'" @click="busy ? stop() : start()">{{ busy ? tr(`中止 (${rows.length} / ${ORDER.length})`, `Stop (${rows.length} / ${ORDER.length})`) : started ? tr(`別の ${RUNS} 人でもう一度計算`, `Again with another ${RUNS}`) : tr("計算開始", "Start") }}</button></p>
          <!-- 読み込み中 (計算の 100 人 × 道・等級 / 裏で 1 人回す)。2026-10-22 オーナー「待ち時間の表示が無いとバグってるのか分からない」 -->
          <p v-if="busy || placing" class="mt-1.5"><BusyTag :text="placing ? tr('当たるまで回し中', 'Rolling until it hits') : tr(`${RUNS} 人ずつ計算中`, `Calculating ${RUNS} people each`)" :n="placing ? undefined : peopleDone" :of="placing ? undefined : ORDER.length * RUNS" /></p>
          <p v-if="fromItem" class="mt-3 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("ルーンは今のアイテムに嵌めている物のまま", "Runes stay as socketed on the current item") }}</p>
          <StageRouteRunes v-else class="mt-3 flex flex-col items-center" :picked="runeIds" :required="runeNeed" :disabled="busy" @change="setRunes" />
        </div>
        <div data-routes-best class="relative flex min-w-0 items-center gap-4 overflow-hidden rounded-md border border-emerald-400/30 bg-gradient-to-r from-emerald-500/[0.12] via-emerald-500/[0.04] to-transparent px-4 py-3 max-md:flex-wrap">
          <template v-if="best">
            <img :src="iconOf(mainKey(best))" alt="" class="size-16 shrink-0 object-contain drop-shadow-[0_0_12px_rgba(110,231,183,0.35)] max-md:size-12" />
            <div class="min-w-0 flex-1">
              <p class="text-[11px] tracking-[0.2em] text-emerald-200/80">{{ busy ? tr("今のところ一番安い", "CHEAPEST SO FAR") : tr("一番安い", "CHEAPEST") }}</p>
              <p class="g-brush truncate text-[20px] text-[var(--exile-color-text-title)] max-md:text-[16px]">{{ routeName(best) }}</p>
              <p class="tabular-nums"><b class="text-[26px] text-emerald-300 max-md:text-[20px]">{{ money(best.avgCost) }}</b> <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(`平均 · ${fmtN(best.avgSteps)} 手`, `avg · ${fmtN(best.avgSteps)} uses`) }}</span></p>
              <p class="text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">{{ tr("半分の人", "Half") }} {{ money(best.p50) }} · {{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }} {{ money(best.p90) }}</p>
            </div>
            <span class="flex shrink-0 flex-col items-stretch gap-1.5 max-md:w-full max-md:flex-row max-md:items-center max-md:[&>button]:flex-1">
            <button v-if="!busy && !luckOpen && bestLuck" type="button" data-route-luck-open class="g-btn-red" :title="tr(`この道の決まりで、${RUNS} 人と同じ始めの状態から自分でスパムして運を比べる`, `Spam it yourself with this route from the same start and compare your luck with the ${RUNS} people`)" @click="openLuck(bestLuck)">{{ tr("運試し", "Luck test") }}</button>
            <button v-if="!busy && bestLuck" type="button" data-route-place class="g-btn sm" :disabled="placing" :title="placeTitle" @click="placeHit(bestLuck)">{{ tr("当たった形でクラフト台に戻る", "Back to the craft stage with a hit") }}</button>
            <button v-if="!busy" type="button" data-route-recompute class="g-btn sm" :title="tr(`別の ${RUNS} 人でもう一度全部の道を計算する (乱数を変える)`, `Run all routes again with a different ${RUNS} people (new random seed)`)" @click="recompute">{{ tr("再計算", "Recompute") }}</button>
            <span v-if="!busy && round > 1" class="text-center text-[10px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ tr(`${round} 回目の ${RUNS} 人`, `${RUNS} people, run ${round}`) }}</span>
            </span>
          </template>
          <p v-else class="text-[13px] text-[var(--exile-color-text-secondary)]">{{ busy ? tr("計算中…", "Calculating…") : started ? tr("どの道でも着かなかった (中止した時は出た分だけ)", "No route reached it (or stopped early)") : tr(`「計算開始」を押すと、3 つの道を 3 つの等級で ${RUNS} 人ずつ打って比べます`, `Press “Start” to run each route at 3 grades, ${RUNS} times each`) }}</p>
          <p v-if="busy" class="absolute right-3 top-2 text-[11px] tabular-nums text-amber-200">{{ tr("計算中", "Calculating") }} {{ rows.length }} / {{ ORDER.length }}</p>
        </div>
      </div>

      <!-- 運試し (一番安い道で。StageRouteLuck.vue) -->
      <StageRouteLuck v-if="luckRow && !busy" :row="luckRow" :targets="t" :aim-labels="aims.map((a) => a.label)" :ilvl="ilvl" :label="aims.map((a) => a.label).join(' / ')" :route-name="routeName(luckRow)" :options="ok.filter((x) => x.route === luckRow!.route && x.tries.length)" :rows="ok" :prep="prep" :from="fromItem" :runes="fromItem ? [] : runeIds" @close="luckRow = null" @pick="(x) => (luckRow = x)" />
      <!-- 下: 3 つの道 -->
      <div class="route-rule mt-4 grid gap-3 lg:grid-cols-3">
        <article v-for="r in shownRoutes" :key="r.route" :data-route="r.route" class="flex min-w-0 flex-col rounded-md border bg-white/[0.025] p-3" :class="[best && best.route === r.route ? 'border-emerald-400/35' : 'border-white/10', offRoute(r.route) ? 'opacity-50' : '']">
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
          <p v-if="offRoute(r.route)" class="mt-4 py-4 text-center text-[12px]">{{ offText(offRoute(r.route)!) }}</p>
          <ul v-else class="mt-3 flex flex-col gap-2">
            <li v-for="g in r.grades" :key="g" data-route-row class="rounded px-2 py-1.5" :class="[rowOf(r.route, g) && best === rowOf(r.route, g) ? 'bg-emerald-500/10 ring-1 ring-emerald-400/30' : 'bg-black/25', rowOf(r.route, g) && canLuck(rowOf(r.route, g)!) && !busy ? 'cursor-pointer hover:bg-white/[0.06]' : '', luckRow && luckRow === rowOf(r.route, g) ? 'outline outline-2 outline-amber-400/50' : '']" :title="rowOf(r.route, g) && canLuck(rowOf(r.route, g)!) && !busy ? tr('押すとこの等級で運試し', 'Click for a luck test at this grade') : undefined" @click="rowOf(r.route, g) && !busy && openLuck(rowOf(r.route, g)!)">
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
                  <span v-else class="ml-auto text-[11px] opacity-60">{{ offText(rowOf(r.route, g)!.off!) }}</span>
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
                  <!-- 増強で当たりがプレとサフィの両方にある時: 両方揃うまで (プレ 1 + サフィ 1、マジックで) -->
                  <p v-if="rowOf(r.route, g)!.both" data-route-both class="mt-1 flex flex-wrap items-baseline gap-x-2 rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] tabular-nums" :title="tr('どれか 1 つではなく、プレとサフィの両方の当たりが揃うまで増強スパムした時の平均 (マジックで)', 'Average when Augment-spamming until both a prefix and a suffix target are on the magic item')">
                    <span class="text-[var(--exile-color-text-secondary)]">{{ tr("両方揃うまで", "Until both") }}</span>
                    <template v-if="rowOf(r.route, g)!.both!.hitRate > 0"><b class="text-[var(--exile-color-text-primary)]">{{ money(rowOf(r.route, g)!.both!.avgCost) }}</b><span class="text-[var(--exile-color-text-tertiary)]">{{ tr(`${fmtN(rowOf(r.route, g)!.both!.avgSteps)} 手`, `${fmtN(rowOf(r.route, g)!.both!.avgSteps)} uses`) }}<template v-if="rowOf(r.route, g)!.both!.hitRate < 1"> · {{ tr(`着いた人 ${Math.round(rowOf(r.route, g)!.both!.hitRate * 100)}%`, `${Math.round(rowOf(r.route, g)!.both!.hitRate * 100)}% reached`) }}</template></span></template>
                    <span v-else class="text-[var(--exile-color-text-tertiary)]">{{ tr("上限の手数までに揃わなかった", "Not reached within the use cap") }}</span>
                  </p>
                  <!-- どの当たりで止まったか (当たりが 2 つ以上の時) -->
                  <p v-if="hitsOf(rowOf(r.route, g)!).length" data-route-hits class="mt-0.5 flex flex-col text-[10px] tabular-nums text-[var(--exile-color-text-tertiary)]">
                    <span v-for="(h, i) in hitsOf(rowOf(r.route, g)!)" :key="i" class="flex min-w-0 gap-1.5" :title="tr(`${h.n} 人がこの当たりで止まった`, `${h.n} stopped on this target`)"><span class="min-w-0 flex-1 truncate">{{ h.label }}</span><b class="shrink-0 text-[var(--exile-color-text-secondary)]">{{ h.pct }}</b></span>
                  </p>
                </template>
              </template>
              <div v-else class="flex items-center gap-2 text-[12px] opacity-50">
                <img :src="iconOf(`${r.main}${GRADE_KEY[g]}`)" alt="" class="size-6 object-contain" />
                <span>{{ tr(...GRADE_JA[g]) }}</span>
                <span v-if="busy" class="ml-auto animate-pulse text-[11px]">{{ tr("計算中…", "Calculating…") }}</span>
                <span v-else class="ml-auto text-[11px]">—</span>
              </div>
            </li>
          </ul>
          <!-- この道で運試し (道の中で一番安い等級。運試しの欄は一番安い欄の下に出す) -->
          <p v-if="!offRoute(r.route) && !busy && bestIn(r.route)" class="mt-auto pt-3 text-center">
            <button type="button" :data-route-luck-card="r.route" class="g-btn sm" :class="luckRow === bestIn(r.route) ? 'on' : ''" :title="tr(`${tr(r.ja, r.en)}の一番安い等級 (${tr(...GRADE_JA[bestIn(r.route)!.grade])}) で運試し`, `Luck test with ${r.en} at its cheapest grade (${GRADE_JA[bestIn(r.route)!.grade][1]})`)" @click="openLuck(bestIn(r.route))">{{ tr("運試し", "Luck test") }}</button>
            <button type="button" :data-route-place-card="r.route" class="g-btn sm ml-2" :disabled="placing" :title="placeTitle" @click="placeHit(bestIn(r.route))">{{ tr("当たった形でクラフト台に戻る", "Back to the craft stage with a hit") }}</button>
          </p>
          <p v-if="placeMiss && !busy && bestIn(r.route)" class="mt-1 text-center text-[11px] text-rose-300">{{ tr("上限の手数までに付かなかった。もう一度押して", "Didn't hit within the use cap. Press again") }}</p>
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

<style src="../../styles/route-rule.css"></style>

<!--
  StageRouteLuck.vue — スパムシミュレーターの運試し (2026-10-19 オーナー「一番安い欄に運試しボタン、カオススパム計算機の運試しで。
  全スパムで安い奴がここに出るので、それでスパム挙動に。全ての部分で安い場合のスパム運試し。シェアは例の感じで」)。
  一番安い道 (row) の決まりで、100 人と同じ始めの状態から自分で打つ。打つのは route-race.ts の routeRun (100 人と同じ打ち手)。
  エミュレーターのアイテムには触らない (この欄の中だけのアイテム)。押している間打ち、狙いが付いたら止まって 100 人の手数と比べる。
  かなりの強運 (上位 10%) は計算機と同じ銅色の演出と音 (styles/spam-lucky.css)。X のシェアは計算機と同じカード (/s/<id>) に、題と主のカレンシーの絵を足す
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { usePhone } from "../../utils/use-phone";
import { craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { packRace, routeHitIndex, routeKey, routeRun, type RaceRow, type RaceTarget, type RoutePrep, type RouteRun } from "../../services/craft-stage/route-race";
import { medianOf, rankOf, unluckyOf, type SpamStats } from "../../services/craft-stage/chaos-spam";
import { mulberry32 } from "../../services/htc/rng";
import { baseArtFile } from "../../services/craft-stage/base-art";
import { displayCurrency } from "../../state/display-currency";
import { luck, packCard, rankWord, sendShare, shareOrigin, shortIdOf } from "./use-spam-share";
import { playSfx, playUseSfx } from "../../utils/sfx";
import { isRareChance } from "../../utils/format-pct";
import { track } from "../../utils/track";
import { logRecord } from "../../utils/log-record";
import { isEn, tr } from "../../i18n/lang";
import type { StageItem, StageMod } from "../../services/craft-stage/types";
import StageItemCard from "./StageItemCard.vue";
import { fullSockets } from "../../state/emulator/stage-steps";
import { startFrom } from "../../services/craft-stage/run-plan";
import type { Force } from "../../services/craft-stage/stage-core";
import { routesLuck, routesOpen, routesTarget } from "../../state/web-page";
import { revealNext } from "../../utils/keep-place";

/** options = 同じ道の等級 (着いた物。タブと比べに出す。2026-10-19 オーナー「等級も選べるように、カオススパム計算機の形で」) */
const props = defineProps<{ row: RaceRow; options: RaceRow[]; /** 当たり (どれか 1 つが付いたら止める) と、その名前 (同じ順) */ targets: readonly RaceTarget[]; aimLabels: readonly string[]; ilvl: number; label: string; routeName: string; /** 嵌めるルーン (始めのアイテムの下ごしらえ) */ prep?: RoutePrep; runes: readonly string[]; /** 始めのアイテム (今のクラフトのアイテムから。route-race.ts の from。シェアは出さない) */ from?: StageItem | null; /** 全部の道の結果 (シェアに入れる) */ rows: RaceRow[] }>();
/** 比べる人数 (スマホは 10 人) */
const people = computed(() => props.row.people);
/**
 * 人数が少ない時 (スマホの 10 人) は % ではなく「何位」で出す (2026-10-19 オーナー「スマホだと 10 人だから何位だね、表示は % やなくて」)。
 * 位 = 自分より早く付いた人の数 + 1、自分を入れて people + 1 人の中。付かなかった人は自分より遅い
 */
const byPlace = computed(() => people.value <= 20);
const placeOf = (n: number): number => 1 + props.row.tries.filter((x) => x < n).length;
const emit = defineEmits<{ close: []; pick: [row: RaceRow] }>();
const GRADE_NAME: Record<RaceRow["grade"], [string, string]> = { base: ["無印", "Regular"], greater: ["上級", "Greater"], perfect: ["完全", "Perfect"] }; // 道のカードと同じ呼び方
/** 道の中で一番安い等級 (おすすめ) */
const cheapest = computed(() => (props.options.length ? props.options.reduce((a, b) => (b.avgCost < a.avgCost ? b : a)) : null));
const ORDER_G = ["base", "greater", "perfect"] as const;
const tabs = computed(() => [...props.options].sort((a, b) => ORDER_G.indexOf(a.grade) - ORDER_G.indexOf(b.grade)));

const stats = computed<SpamStats>(() => ({ tries: props.row.tries, failed: props.row.people - props.row.tries.length, people: props.row.people }));
const median = computed(() => medianOf(stats.value));
const unlucky = computed(() => unluckyOf(stats.value));
const mainKey = computed(() => routeKey(props.row.route, props.row.grade));

/** この欄のアイテム (エミュレーターとは別)。描き直しは 1 コマに 1 回 */
let run: RouteRun | null = null;
const item = ref<StageItem | null>(null);
const n = ref(0);
const cost = ref(0);
const last = ref<{ key: string; omens: string[] } | null>(null);
const spamming = ref(false);
const result = ref<{ hit: boolean; n: number; cost: number; rank: number | null; reason: string | null } | null>(null);
function fresh(): void {
  stop();
  item.value = null;
  run = routeRun(s.data.value!, s.base.value, props.ilvl, props.targets, props.row.route, props.row.grade, mulberry32((Math.random() * 2 ** 31) | 0), priceOf, props.prep, props.from ?? undefined);
  // 暗黙の値の種はエミュレーターと同じ (「ここから開始」で置いた時に暗黙の値がずれないように)。今のアイテムからの時は元の種のまま
  if (run && !props.from) run.item = { ...run.item, rollSeed: s.seed.value - 1 };
  sync();
  result.value = null;
}
/** 直前の描き直しから付いた・消えた MOD (札の緑と取り消し線。エミュレーターの 1 手分と同じ見せ方) */
const added = ref<StageMod[]>([]);
/** 付いた瞬間の確率 (札の % と神演出。描き直すたびに写しを渡す) */
const chanceMap = ref<ReadonlyMap<string, number>>(new Map());
const removed = ref<StageMod[]>([]);
const sameMod = (a: StageMod, b: StageMod): boolean => a.modId === b.modId && a.tierIndex === b.tierIndex && a.values.join() === b.values.join();
function sync(): void {
  const before = item.value, now = run?.item ?? null;
  const was = before ? [...before.prefixes, ...before.suffixes] : [], is = now ? [...now.prefixes, ...now.suffixes] : [];
  added.value = before && now ? is.filter((m) => !was.some((x) => sameMod(x, m))) : [];
  removed.value = before && now ? was.filter((m) => !is.some((x) => sameMod(x, m))) : [];
  chanceMap.value = new Map(run?.chances ?? []);
  item.value = now; n.value = run?.n ?? 0; cost.value = run?.cost ?? 0; last.value = run?.last ?? null;
}
watch(() => [props.row, props.targets, props.ilvl, props.prep, props.from], fresh, { immediate: true });
/** 止まった当たり (付いていなければ null)。札で光らせるのも、付いていなければ 1 つ目 */
const hitAim = computed(() => { const i = item.value ? routeHitIndex(item.value, props.targets) : -1; return i >= 0 ? i : null; });
const focusId = computed(() => props.targets[hitAim.value ?? 0]?.modId ?? null);

let raf = 0, t0 = 0, lastT = 0;
const CAP = 20_000;
function start(e: PointerEvent): void {
  if (spamming.value || !run || run.hit()) return;
  try { (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId); } catch { /* 無くてよい */ }
  result.value = null;
  spamming.value = true;
  // 押しっぱなしで文字が選ばれないように (スマホの長押しの選択。2026-10-19 オーナー)。出ていた選択も消す
  try { window.getSelection()?.removeAllRanges(); } catch { /* 無くてよい */ }
  document.documentElement.classList.add("select-none");
  t0 = performance.now(); lastT = 0;
  const loop = (now: number): void => {
    if (!spamming.value || !run) return;
    // 1.5 秒までは 1 秒に約 16 回 (入れ替わりが目で追える)、その後は押している時間に合わせて速く (計算機と同じ)
    const held = now - t0;
    const per = held < 1500 ? (now - lastT >= 60 ? 1 : 0) : Math.min(60, 1 + Math.floor((held - 1500) / 150));
    if (per > 0) lastT = now;
    for (let i = 0; i < per; i++) {
      if (!run.step()) { sync(); finish(tr("決まりの手が打てなくなりました", "The next move can't be used")); return; }
      if (run.hit()) { sync(); finish(null); return; }
      if (run.n >= CAP) { sync(); finish(tr(`${CAP.toLocaleString()} 手で止めました`, `Stopped at ${CAP.toLocaleString()} uses`)); return; }
    }
    sync();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
function stop(): void { if (spamming.value) finish(null); }
function finish(reason: string | null): void {
  cancelAnimationFrame(raf);
  spamming.value = false;
  document.documentElement.classList.remove("select-none");
  if (!run) return;
  const hit = run.hit();
  result.value = { hit, n: run.n, cost: run.cost, rank: hit ? rankOf(stats.value, run.n) : null, reason };
  // 付いたら次は「X でシェア」(結果の下。2026-10-19 オーナー「次入力するとこまで自動スクロール」)
  if (hit) void nextTick(() => requestAnimationFrame(() => revealNext(document.querySelector("[data-route-share]"))));
  // 付いた時の音 (押しっぱなしの間は鳴らさず、付いた 1 回だけ。2026-10-19 オーナー「付いた時の SE が無い」)。かなりの強運は下の watch が珍しい段の音を鳴らす
  // 狙いが珍しい段 (エミュレーターの神演出と同じ確率の線) で付いた時は珍しい段の音
  const hi = run.hitIndex();
  const tc = hi >= 0 ? run.chances.get(props.targets[hi]!.modId) : undefined;
  if (hit && !(result.value.rank != null && result.value.rank <= 10) && run.last) playUseSfx(run.last.key, tc != null && isRareChance(tc));
  if (hit || reason) {
    track("spam:run", hit ? "hit" : "stop");
    logRecord("emu_spam", { base: s.base.value, key: mainKey.value, route: props.row.route, aims: props.targets.map((x) => `${x.modId}#${x.minTierIndex}`), uses: run.n, hit });
  }
}
onBeforeUnmount(() => { cancelAnimationFrame(raf); document.documentElement.classList.remove("select-none"); });

// かなりの強運 (上位 10% 以内) は計算機と同じ音と銅色の演出
const isLucky = computed(() => !!result.value?.hit && result.value.rank != null && (byPlace.value ? placeOf(result.value.n) === 1 : result.value.rank <= 10));
watch(isLucky, (v) => { if (v) playSfx("rare", 1.5); });

const money = (x: number): string => displayCurrency.money(x);
const fmt = (v: number | null): string => (v == null ? tr("付かない人が多い", "Most never hit") : tr(`${v.toLocaleString()} 手`, `${v.toLocaleString()} uses`));
/**
 * スマホは押すボタンを画面の下の帯に置く (旧カオススパム計算機と同じ)。札の下に置くと、打つたびに札の高さが変わってボタンが動いた
 * (2026-10-19 オーナー「スパム中スマホがスパムボタン動いちゃうな、アイテムの縦枠動くから」)
 */
const phone = usePhone();
const barShown = computed(() => phone.value && !(result.value?.hit && !spamming.value));
const holdLabel = computed(() => (spamming.value ? tr("スパム中… (離すと止まる)", "Spamming… (release to stop)") : result.value && !result.value.hit ? tr("押して続ける", "Hold to continue") : tr("押している間スパム", "Hold to spam")));

// ---- シェア (計算機と同じカード。setup に道と狙いを入れて、開いた人に同じ運試しを出す: state/spam-share-open.ts) ----
const shareUrl = ref("");
let shareCode = "";
const baseName = computed(() => (isEn.value ? s.base.value : (s.item.value?.baseJa ?? s.base.value)));
watch([result, isEn], async () => {
  const r = result.value;
  if (!r?.hit) { shareUrl.value = ""; return; }
  const code = await packCard([
    isEn.value ? "en" : "ja", s.base.value, baseName.value, props.label, r.n, baseArtFile(s.base.value), r.rank, median.value, unlucky.value, money(r.cost),
    { route: { r: props.row.route, g: props.row.grade, m: props.targets[0]!.modId, t: props.targets[0]!.minTierIndex, ...(props.targets.length > 1 ? { a: props.targets.map((x) => [x.modId, x.minTierIndex] as [string, number]) } : {}), i: props.ilvl, u: [...props.runes], x: packRace(props.rows, props.row) } },
    tr(`スパムシミュレーター · ${props.routeName}`, `Spam simulator · ${props.routeName}`),
    iconOf(mainKey.value) || null,
    people.value,
    byPlace.value ? placeOf(r.n) : null,
  ]);
  shareCode = code;
  shareUrl.value = `${shareOrigin()}/s/${await shortIdOf(code)}`;
});
const shareText = computed(() => {
  const r = result.value;
  if (!r?.hit) return "";
  const luckLine = r.rank == null ? "" : byPlace.value ? tr(`${people.value + 1} 人中 ${placeOf(r.n)} 位 (${luck(r.rank)})`, `#${placeOf(r.n)} of ${people.value + 1} (${luck(r.rank)})`) : tr(`${people.value} 人中 ${rankWord(r.rank)} の運 (${luck(r.rank)})`, `${rankWord(r.rank)} luck among ${people.value} people (${luck(r.rank)})`);
  return tr(
    `${props.routeName}で ${baseName.value} に ${props.label} を ${r.n.toLocaleString()} 手 (${money(r.cost)}) で付けた！ ${luckLine}\n#PoE2 #ExileDesk`,
    `${props.routeName}: ${props.label} on ${baseName.value} in ${r.n.toLocaleString()} uses (${money(r.cost)})! ${luckLine}\n#PoE2 #ExileDesk`,
  );
});
/**
 * ここから開始 (計算機と同じ。2026-10-19 オーナー「ここから始めるボタンが無い」): この欄のアイテムをエミュレーターに置いて、ページを閉じる。
 * 運試しの手はエミュレーターの工程には入っていないので、工程・費用は 0 から (始めの MOD として置く)
 */
function startHere(): void {
  const it = item.value, d = s.data.value;
  if (!it || !d) return;
  const forces: Force[] = [...it.prefixes, ...it.suffixes].map((m) => ({ mod: m.modId, tier: m.tierName, values: m.values, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) }));
  // 今のアイテムから始めた時は、アイテムを丸ごと置く (フラクチャー・品質・ルーン・暗黙の値もそのまま)。前の形は 1 つ戻す (Ctrl+Z) で戻る (2026-10-22 オーナー)
  if (props.from) { s.place(it, forces); routesLuck.value = false; routesTarget.value = null; routesOpen.value = false; return; }
  s.hold(null);
  s.itemLevel.value = it.itemLevel;
  s.reset();
  s.startMods.value = forces;
  // 嵌めたルーンもそのまま (ソケットの数とオーグメント)
  const placed = fullSockets(startFrom(d, s.base.value, it.itemLevel, { mods: forces, rarity: it.rarity }, s.seed.value - 1));
  s.item.value = { ...placed, rollSeed: s.seed.value - 1, ...(it.augments?.length ? { sockets: Math.max(placed.sockets ?? 0, it.sockets ?? 0), augments: it.augments } : {}) };
  routesLuck.value = false;
  routesTarget.value = null;
  routesOpen.value = false;
}
/** ここから開始の説明 (クラフトの工程は 0 からになる) */
const startTitle = computed(() => props.from
  ? tr("このアイテムをクラフト台に置いて続きを打つ (1 つ戻す・Ctrl+Z で置く前の形に戻る。運試しの手と費用は工程に入らない)", "Put this item on the craft stage and keep crafting (Undo / Ctrl+Z goes back to the item before; the luck-test uses and cost are not in the steps)")
  : tr("このアイテムでエミュレーターを始める (クラフトの今の工程は消え、運試しの手も工程に入らない)", "Start the emulator with this item (the current craft steps are cleared; the luck-test uses are not in the steps)"));
const xUrl = computed(() => `https://x.com/intent/post?text=${encodeURIComponent(shareText.value)}&url=${encodeURIComponent(shareUrl.value)}`);
function shareX(e: MouseEvent): void {
  sendShare(e, { code: shareCode, web: xUrl.value, text: shareText.value, url: shareUrl.value, log: { base: s.base.value, rank: result.value?.rank ?? null, route: props.row.route } });
}
</script>

<template>
  <div data-route-luck class="route-rule mt-4 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <!-- 左: この欄のアイテム (始めの状態から、打つたびに変わる)。札はエミュレーターと同じ (StageItemCard)、狙いの MOD を光らせる -->
    <div class="flex min-w-0 flex-col items-center gap-1">
      <StageItemCard v-if="item" :item="item" :added="added" :removed="removed" :holding="false" :flash-key="n" :focus="focusId" :chances="chanceMap" class="max-w-full" />
      <p class="flex h-5 items-center justify-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
        <template v-if="last">{{ tr("今打った", "Last") }}: <img :src="iconOf(last.key)" alt="" class="size-4 object-contain" />{{ nameOf(last.key) }}<img v-for="o in last.omens" :key="o" :src="iconOf(o)" alt="" class="size-4 object-contain" /></template>
        <template v-else>{{ tr("始めの状態", "Start state") }}</template>
      </p>
    </div>

    <!-- 右: 押すボタン・回数・結果 -->
    <div class="min-w-0">
      <p class="flex items-center gap-2 text-[12px] text-[var(--exile-color-text-secondary)]">
        <img :src="iconOf(mainKey)" alt="" class="size-6 object-contain" />{{ tr(`${routeName}の運試し (${people} 人と同じ始めの状態から)`, `${routeName} luck test (same start as the ${people} people)`) }}
        <button type="button" class="g-btn sm ml-auto" :disabled="spamming" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
      </p>
      <!-- 等級 (カオススパム計算機と同じタブ。押すとその等級で始めの状態から) -->
      <span v-if="tabs.length > 1" data-route-grades class="mt-2 flex flex-wrap items-center gap-1">
        <button v-for="o in tabs" :key="o.grade" type="button" :data-route-grade="o.grade" class="g-tab !min-h-[30px] !gap-1 !px-2 !text-[12px]" :class="o === row ? 'on' : ''" :disabled="spamming" :title="nameOf(routeKey(o.route, o.grade))" @click="o !== row && emit('pick', o)"><img :src="iconOf(routeKey(o.route, o.grade))" alt="" class="size-5 object-contain" />{{ tr(...GRADE_NAME[o.grade]) }}<span v-if="cheapest === o" class="rounded bg-emerald-500/25 px-1 text-[10px] text-emerald-200">{{ tr("おすすめ", "Best") }}</span></button>
      </span>
      <template v-if="result?.hit && !spamming">
        <div v-if="isLucky" :key="`lucky-${result.n}`" data-route-lucky class="spam-lucky">
          <span class="spam-lucky-line" aria-hidden="true" />
          <p class="spam-lucky-kicker">{{ tr("かなりの強運", "Exceptional luck") }}</p>
          <p v-if="byPlace" class="spam-lucky-rank"><span class="spam-lucky-top">{{ tr(`${people + 1} 人中`, `of ${people + 1}`) }}</span><span class="spam-lucky-num">{{ placeOf(result.n) }}</span><span class="spam-lucky-pct">{{ tr("位", "st") }}</span></p>
          <p v-else class="spam-lucky-rank"><span class="spam-lucky-top">TOP</span><span class="spam-lucky-num">{{ result.rank }}</span><span class="spam-lucky-pct">%</span></p>
          <p class="spam-lucky-sub">{{ tr(`${people} 人の中で ${result.n.toLocaleString()} 手目に付いた`, `Hit on use ${result.n.toLocaleString()} among ${people} people`) }}</p>
          <span class="spam-lucky-line" aria-hidden="true" />
        </div>
        <p v-else class="mt-2 text-[16px] font-bold text-emerald-300">{{ tr(`${result.n.toLocaleString()} 手目で付きました！`, `Hit on use ${result.n.toLocaleString()}!`) }}</p>
        <!-- どの当たりで止まったか (当たりが 2 つ以上の時) -->
        <p v-if="targets.length > 1 && hitAim != null" data-route-hit-aim class="mt-0.5 truncate text-[12px] text-[var(--color-rarity-magic)]" :title="aimLabels[hitAim]">{{ tr("当たり", "Hit") }}: {{ aimLabels[hitAim] }}</p>
        <template v-if="result.rank != null">
          <p v-if="!isLucky" class="mt-0.5 text-[13px]">{{ byPlace ? tr(`${people + 1} 人中 ${placeOf(result.n)} 位 (あなたを入れて)`, `#${placeOf(result.n)} of ${people + 1} (including you)`) : tr(`${people} 人中 ${rankWord(result.rank)} の運`, `${rankWord(result.rank)} luck among ${people} people`) }} <b :class="result.rank <= 50 ? 'text-emerald-300' : 'text-rose-300'">{{ luck(result.rank) }}</b></p>
          <div class="relative mt-1.5 h-2 max-w-[320px] rounded-full bg-gradient-to-r from-emerald-500/60 via-amber-400/50 to-rose-500/60">
            <span class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#14110d]" :style="{ left: `${result.rank}%` }" />
          </div>
        </template>
        <p class="mt-1 tabular-nums text-[var(--exile-color-text-secondary)]">{{ tr(`${result.n.toLocaleString()} 手`, `${result.n.toLocaleString()} uses`) }} · {{ money(result.cost) }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <a v-if="!from" data-route-share :href="xUrl" target="_blank" rel="noopener" class="g-btn-red sm inline-flex items-center !no-underline" @click="shareX">{{ tr("X でシェア", "Share on X") }}</a>
          <button type="button" data-route-again class="g-btn sm" @click="fresh">{{ tr("もう一度 (始めの状態から)", "Again (from the start)") }}</button>
          <button type="button" data-route-start class="g-btn sm" :title="startTitle" @click="startHere">{{ from ? tr("当たった形でクラフト台に戻る", "Back to the craft stage with this item") : tr("ここから開始", "Continue from here") }}</button>
        </div>
      </template>
      <template v-else>
        <button v-if="!barShown" type="button" data-route-hold class="g-btn-red mt-2 min-h-11 w-full max-w-[320px] select-none touch-none [-webkit-touch-callout:none] px-2 text-[14px]" @pointerdown.prevent="start" @pointerup="stop" @pointercancel="stop" @contextmenu.prevent>{{ holdLabel }}</button>
        <p class="mt-1.5 tabular-nums text-[14px]"><b>{{ tr(`${n.toLocaleString()} 手`, `${n.toLocaleString()} uses`) }}</b><span class="text-[var(--exile-color-text-secondary)]"> · {{ money(cost) }}</span></p>
        <p v-if="result && !spamming" class="mt-0.5 text-[var(--exile-color-text-secondary)]">{{ result.reason ?? tr("まだ付いていません。もう一度押すと続きから", "Not hit yet. Hold again to continue") }}</p>
        <span v-if="result && !spamming" class="mt-1 flex flex-wrap gap-2">
          <button type="button" class="g-btn sm" @click="fresh">{{ tr("始めの状態に戻す", "Back to the start") }}</button>
          <button type="button" class="g-btn sm" :title="startTitle" @click="startHere">{{ tr("ここから開始", "Continue from here") }}</button>
        </span>
      </template>
      <!-- 100 人の結果 (カオススパム計算機と同じ並び) -->
      <p class="mt-4 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`${people} 人が同じ始めの状態からスパムしたら`, `If ${people} people spammed from the same start`) }}</p>
      <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("半分の人", "Half of them") }}</dt>
        <dd class="tabular-nums"><b>{{ fmt(median) }}</b><span class="text-[var(--exile-color-text-secondary)]"> · {{ money(row.p50) }}</span></dd>
        <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }}</dt>
        <dd class="tabular-nums"><b>{{ fmt(unlucky) }}</b><span class="text-[var(--exile-color-text-secondary)]"> · {{ money(row.p90) }}</span></dd>
        <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("一番早い / 遅い", "Fastest / slowest") }}</dt>
        <dd class="tabular-nums">{{ row.tries.length ? `${fmt(row.tries[0]!)} / ${fmt(row.tries[row.tries.length - 1]!)}` : "—" }}<template v-if="stats.failed"> · {{ tr(`${stats.failed} 人は付かなかった`, `${stats.failed} never hit`) }}</template></dd>
      </dl>
      <!-- スマホの帯の分だけ下を空ける (帯に隠れないように) -->
      <div v-if="barShown" class="h-24" aria-hidden="true" />
    </div>
    <!-- スマホ: 画面の下の帯に押すボタン (動かない)。旧カオススパム計算機の帯と同じ見た目 -->
    <Teleport to="body">
      <div v-if="barShown" data-route-bar data-bottom-bar class="select-none [-webkit-touch-callout:none] fixed inset-x-0 bottom-0 z-[150] border-t border-amber-400/40 bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
        <p class="mb-1 truncate text-[12px] font-bold tabular-nums text-white/80">{{ tr(`${n.toLocaleString()} 手`, `${n.toLocaleString()} uses`) }} · {{ money(cost) }}<template v-if="!spamming && result?.reason"> · {{ result.reason }}</template></p>
        <div class="flex items-center gap-2">
          <img :src="iconOf(mainKey)" alt="" class="h-9 w-9 object-contain" />
          <b class="min-w-0 flex-1 line-clamp-2 text-[12px] leading-tight text-amber-100">{{ routeName }}</b>
          <button type="button" data-route-hold class="g-btn-red min-h-11 shrink-0 whitespace-nowrap select-none touch-none [-webkit-touch-callout:none] px-2 text-[13px]" @pointerdown.prevent="start" @pointerup="stop" @pointercancel="stop" @contextmenu.prevent>{{ spamming ? tr("スパム中…", "Spamming…") : result && !result.hit ? tr("押して続ける", "Hold to continue") : tr("押しっぱなしで使う", "Hold to use") }}</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style src="../../styles/spam-lucky.css"></style>

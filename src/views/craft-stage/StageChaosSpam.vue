<!--
  StageChaosSpam.vue — カオススパムモード (2026-10-16 オーナーの手書きのメモ)

  ① 狙う MOD は「次の手で狙う」と同じ (最大 6 つ、全部揃って当たり)
  ② カオス・上級・完全のどれかを選ぶ
  ③ 100 人が当たるまでスパムした時の回数 (半分の人・運が悪い 10 人に 1 人・一番良い / 悪い人) + 自分でもスパム (押している間打ち続け、狙いが出たら自動で止まる)
  ④ 止まったら、100 人の結果と比べて今回の運を出す (「今回は 100 人中 上位 ◯%」)

  打つのはステージと同じ s.use (1 回ずつ工程に入る)。工程は 50 手で古い方が消えるので、戻す時は「スパムの前に戻す」で丸ごと戻す (snapshot / restore)。
  分析の記録は 1 回ごとには送らず、スパムの終わりに 1 件だけ (emu_spam)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { spamKey, spamPending, spamming } from "../../state/chaos-spam";
import { scrollToTop } from "../../utils/keep-place";
import { displayCurrency } from "../../state/display-currency";
import { aimDone, type AimTarget } from "../../services/craft-stage/aim-odds";
import type { StageItem } from "../../services/craft-stage/types";
import { medianOf, rankOf, spamOne, unluckyOf, SPAM_KEYS, SPAM_PEOPLE, type SpamStats } from "../../services/craft-stage/chaos-spam";
import { mulberry32 } from "../../services/htc/rng";
import { logRecord } from "../../utils/log-record";
import HelpTip from "../../components/ui/HelpTip.vue";
import { tr } from "../../i18n/lang";

const targets = computed<AimTarget[]>(() => s.aims.value.map((a) => ({ modId: a.modId, minTierIndex: a.minTierIndex })));
/** 今打てるカオス (普通・上級・完全。アイテムレベルが足りない物などは出さない) */
const keys = computed(() => (s.item.value ? SPAM_KEYS.filter((k) => s.usableBare(k) == null) : []));
const key = ref<string>("chaos");
watch(keys, (ks) => { if (ks.length && !ks.includes(key.value as (typeof SPAM_KEYS)[number])) key.value = ks[0]!; }, { immediate: true });
/**
 * アイテムレベル (2026-10-16 オーナー「アイテムレベル選べるようにせなね。下限は指定の MOD を下限として、そこから一番近いベースのアイテムレベル、あとは変えれる」)。
 * 付く段はアイテムレベルで決まる (段の ilvl 以下だけ) ので確率が変わる (金の指輪の火耐性 T2 以上: 75 は 0.57%、82 は 1.19%)。
 * 下限 = 狙いの段のうち一番下の段が付くアイテムレベル (狙いが複数なら一番高い物)。選べるのはエミュレーターと同じ 45 / 65 / 75 / 82 / 86
 */
const ILVLS = [45, 65, 75, 82, 86];
const floor = computed(() => Math.max(1, ...targets.value.map((t) => s.data.value?.mods.get(t.modId)?.tiers[t.minTierIndex]?.ilvl ?? 1)));
/**
 * 既定 = 狙いの MOD の T1 が出る一番低いアイテムレベル (2026-10-16 オーナー「T1 が 75 なら 75 のほうが 82 より出やすい」)。
 * 「T2 以上」は T1 も当たりなので T1 が出るまでは上げるほど付きやすく (火耐性 T2 以上: 75 は 0.52%、82 は 1.16%)、
 * T1 が出た後は上げるとほかの MOD の上の段で薄まる (ライフ T1: 65 は 0.97%、82 は 0.86%)
 */
const best = computed(() => Math.max(floor.value, ...targets.value.map((t) => { const ts = s.data.value?.mods.get(t.modId)?.tiers; return ts?.[ts.length - 1]?.ilvl ?? 1; })));
const ilvl = ref(82);
watch(best, (f) => { ilvl.value = ILVLS.find((x) => x >= f) ?? ILVLS[ILVLS.length - 1]!; }, { immediate: true });
/** そのアイテムレベルにした今のアイテム (計算と自分のスパムの始まり) */
const atIlvl = (it: StageItem | null): StageItem | null => (it && it.itemLevel !== ilvl.value ? { ...it, itemLevel: ilvl.value } : it);
/** アイテムの下の「カオススパム確率機へ」で持っていたカオスの種類で開く */
watch(spamKey, (k) => { if (k && SPAM_KEYS.includes(k as (typeof SPAM_KEYS)[number])) key.value = k; }, { immediate: true });
/** そのボタンから来た時: 狙いが決まったら、この欄を画面の真ん中へ */
const root = ref<HTMLElement | null>(null);
function arrive(): void {
  if (!spamPending.value || !s.aims.value.length) return;
  spamPending.value = false;
  void nextTick(() => scrollToTop(root.value, "smooth", "center"));
}
onMounted(arrive);
watch([spamPending, () => s.aims.value], arrive);

/** 自分のスパムの結果 (④ の運試し)。sig = 狙いとカオスの種類 (変わったら別のスパム) */
interface SpamResult { sig: string; uses: number; applied: number; hit: boolean; reason: string | null; rank: number | null }
const result = ref<SpamResult | null>(null);

// ---- ③ 100 人の結果 (今の状態から。回している間は出し直さない) ----
const stats = ref<SpamStats | null>(null);
const statsFor = ref<string>("");
const progress = ref(0);
let gen = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const sig = (): string => `${key.value}|${ilvl.value}|${targets.value.map((t) => `${t.modId}#${t.minTierIndex}`).join(",")}`;
/** start のアイテムから 100 人分を少しずつ (画面を止めない) */
function simulate(start = atIlvl(s.item.value)): void {
  const my = ++gen;
  clearTimeout(timer);
  stats.value = null;
  progress.value = 0;
  const d = s.data.value, ts = targets.value, k = key.value;
  if (!d || !start || !ts.length || !keys.value.includes(k as (typeof SPAM_KEYS)[number])) return;
  const tries: number[] = [];
  let failed = 0, i = 0;
  const step = (): void => {
    if (my !== gen) return;
    const t0 = performance.now();
    while (i < SPAM_PEOPLE && performance.now() - t0 < 25) {
      const n = spamOne(d, start, ts, k, mulberry32(9001 + i * 7919));
      if (n == null) failed++; else tries.push(n);
      i++;
    }
    progress.value = i;
    if (i < SPAM_PEOPLE) { timer = setTimeout(step, 0); return; }
    tries.sort((a, b) => a - b);
    stats.value = { tries, failed, people: SPAM_PEOPLE };
    statsFor.value = sig();
  };
  timer = setTimeout(step, 0);
}
// 狙いがもう揃っている時 (スパムで付いた直後) は出し直さない (今の状態から数えると全員 0 回になる)。比べた 100 人の結果と運試しをそのまま残す
watch([key, ilvl, targets, () => s.item.value], () => {
  if (spamming.value) return;
  if (s.item.value && aimDone(s.item.value, targets.value) && result.value?.sig === sig()) return;
  result.value = result.value && sig() === result.value.sig ? result.value : null;
  simulate();
}, { immediate: true });
onBeforeUnmount(() => { gen++; clearTimeout(timer); stopSpam(); });

const cost = (n: number): string => (priceOf(key.value) > 0 ? displayCurrency.money(n * priceOf(key.value)) : "");
const fmt = (n: number | null): string => (n == null ? tr("付かない人が多い", "Most never hit") : tr(`${n.toLocaleString()} 回`, `${n.toLocaleString()} uses`));
const median = computed(() => (stats.value ? medianOf(stats.value) : null));
const unlucky = computed(() => (stats.value ? unluckyOf(stats.value) : null));

// ---- ③ 自分でスパム (押している間) ----
const live = ref<{ uses: number; applied: number } | null>(null);
let snap: ReturnType<typeof s.snapshot> | null = null;
let snapIlvl = 82;
let startItem: typeof s.item.value = null;
let raf = 0, t0 = 0, last = 0;
const CAP = 20_000;
/** 押し始め: 狙いが揃うまで打ち続ける (最初はゆっくり、押し続けると速く) */
function startSpam(e: PointerEvent): void {
  if (spamming.value || !s.item.value || !targets.value.length || aimDone(s.item.value, targets.value)) return;
  // 押したまま指が外へずれても止まらないように (取れない時はそのまま)
  try { (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId); } catch { /* 無くてよい */ }
  // 前のスパムの続きなら回数を足す (離してもう一度押した時)。新しく始める時は今の状態を控える
  const cont = result.value && !result.value.hit && result.value.sig === sig() && snap;
  if (!cont) {
    snap = s.snapshot();
    snapIlvl = s.itemLevel.value;
    // 選んだアイテムレベルにしてから回す (スパムの前に戻すと元のアイテムレベルに戻る)
    if (s.item.value && s.item.value.itemLevel !== ilvl.value) { s.restore({ ...snap, item: atIlvl(s.item.value) }); s.itemLevel.value = ilvl.value; }
    startItem = s.item.value;
    result.value = null;
  }
  live.value = cont ? { uses: result.value!.uses, applied: result.value!.applied } : { uses: 0, applied: 0 };
  spamming.value = true;
  t0 = performance.now(); last = 0;
  const loop = (now: number): void => {
    if (!spamming.value || !live.value) return;
    // 1.5 秒までは 1 秒に約 16 回 (入れ替わりが目で追える)、その後は押している時間に合わせて速く (1 コマに最大 60 回)
    const held = now - t0;
    const per = held < 1500 ? (now - last >= 60 ? 1 : 0) : Math.min(60, 1 + Math.floor((held - 1500) / 150));
    if (per > 0) last = now;
    for (let i = 0; i < per; i++) {
      const before = s.log.value[s.log.value.length - 1];
      s.use(key.value, { quiet: true });
      const after = s.log.value[s.log.value.length - 1];
      // 打てなかった (棚の決まりで打てない) 時は止める
      if (after === before) { finish(false, s.miss.value?.reason ?? null); return; }
      live.value.uses++;
      if (after?.out.applied) live.value.applied++;
      if (aimDone(s.item.value!, targets.value)) { finish(true, null); return; }
      if (live.value.uses >= CAP) { finish(false, tr(`${CAP.toLocaleString()} 回で止めました`, `Stopped at ${CAP.toLocaleString()} uses`)); return; }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}
/** 指を離した時 (付く前に止めた) */
function stopSpam(): void {
  if (spamming.value) finish(false, null);
}
function finish(hit: boolean, reason: string | null): void {
  cancelAnimationFrame(raf);
  const l = live.value;
  live.value = null;
  spamming.value = false;
  if (!l) return;
  const st = stats.value && statsFor.value === sig() ? stats.value : null;
  result.value = { sig: sig(), uses: l.uses, applied: l.applied, hit, reason, rank: hit && st ? rankOf(st, l.uses) : null };
  // 100 人の結果がまだ無ければ、スパムの前の状態から出して運を比べる
  if (hit && !st && startItem) {
    simulate(startItem);
    const stop = watch(stats, (v) => { if (v && result.value?.hit) { result.value = { ...result.value, rank: rankOf(v, result.value.uses) }; stop(); } });
  }
  if (hit || !reason) logRecord("emu_spam", { base: s.item.value?.base, key: key.value, aims: targets.value.map((t) => `${t.modId}#${t.minTierIndex}`), uses: l.uses, hit });
}
/** スパムの前の状態に丸ごと戻す (工程・お告げも) */
function undoSpam(): void {
  if (!snap) return;
  s.restore(snap);
  s.itemLevel.value = snapIlvl;
  snap = null;
  result.value = null;
}
/**
 * ここから開始 (2026-10-16 オーナー「確率機の後、ここから開始ボタンでその状態からエミュレーター開始。工程や費用は引き継ぎで、スパムの前の分も」)。
 * スパムはステージで 1 回ずつ打っているので、工程・費用 (スパムの前の手も) はもう入っている。確率機を閉じて、狙いも外して普段の画面へ
 */
function startHere(): void {
  snap = null;
  result.value = null;
  spamKey.value = null;
  s.aims.value = [];
  s.aimPicker.value = null;
  void nextTick(() => scrollToTop(document.querySelector("[data-stage-card]") as HTMLElement | null, "smooth"));
}
/**
 * スマホ: 押している間スパムのボタンは、いつもの「使う」と同じ画面の下の帯に出す (2026-10-16 オーナー「いつものつける時の動作で、
 * つけるボタン押しっぱなしで反応」)。確率機から来た時 (spamKey) か、回している・結果がある時だけ。何か持っている時は「使う」の帯を優先
 */
const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
const onResize = (): void => { phone.value = window.innerWidth < 768; };
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
const barShown = computed(() => phone.value && !s.held.value && keys.value.length > 0 && (!!spamKey.value || spamming.value || !!result.value));
const canSpam = computed(() => keys.value.length > 0 && targets.value.length > 0 && !!s.item.value && !aimDone(s.item.value, targets.value));
const shownUses = computed(() => live.value?.uses ?? result.value?.uses ?? 0);
const shownApplied = computed(() => live.value?.applied ?? result.value?.applied ?? 0);
</script>

<template>
  <!-- 「次の手で狙う」を押しただけの時は出さない。アイテムの下の「カオススパム確率機へ」から来た時 (spamKey) と、回している・結果がある時だけ (2026-10-16 オーナー) -->
  <div v-if="s.aims.value.length && (spamKey || spamming || result)" ref="root" data-chaos-spam class="rounded-md bg-black/25 p-2 ring-1 ring-white/10">
    <div class="flex flex-wrap items-center gap-2">
      <b class="text-[13px] text-[var(--exile-color-text-title)]">{{ tr("カオススパム", "Chaos spam") }}</b>
      <!-- ② カオス・上級・完全 -->
      <span v-if="keys.length" class="flex gap-1">
        <button v-for="k in keys" :key="k" type="button" class="g-tab !min-h-[28px] !gap-1 !px-2 !text-[12px]" :class="key === k ? 'on' : ''" :disabled="spamming" :title="nameOf(k)" @click="key = k"><img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="size-5 object-contain" />{{ k === "chaos" ? tr("普通", "Normal") : k === "chaos_greater" ? tr("上級", "Greater") : tr("完全", "Perfect") }}</button>
      </span>
      <!-- アイテムレベル (狙いの段が付く一番低い物から) -->
      <span class="flex items-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("アイテムレベル", "Item level") }}
        <button v-for="lv in ILVLS" :key="lv" type="button" class="g-tab !min-h-[28px] !px-2 !text-[12px] tabular-nums" :class="ilvl === lv ? 'on' : ''" :disabled="spamming || lv < floor" :title="lv < floor ? tr(`狙いの段はアイテムレベル ${floor} から`, `The target tier needs item level ${floor}`) : undefined" @click="ilvl = lv">{{ lv }}</button>
      </span>
      <HelpTip :title="tr('カオススパム', 'Chaos spam')" :width="320">
        <p>{{ tr("狙いの MOD が全部揃うまで、同じカオスを打ち続けます。外れても、その結果に続けて打ちます (今の MOD が消えても、狙いが揃えば当たり)。", "Keeps using the same Chaos Orb until all target mods are on. A miss keeps going from the result (a hit even if current mods were removed).") }}</p>
        <p class="mt-1">{{ tr(`「${SPAM_PEOPLE} 人がスパムしたら」は、今の状態から ${SPAM_PEOPLE} 人が同じように打った時に、何回で付いたか。止まった後に、今回の自分の回数と比べて運を出します。`, `"If ${SPAM_PEOPLE} people spammed" shows how many uses it took ${SPAM_PEOPLE} people starting from the current state. After you stop, your count is compared with theirs.`) }}</p>
        <p class="mt-1">{{ tr("アイテムレベルで付く段が変わるので、確率も変わります。最初は狙いの MOD の T1 が出る一番低いアイテムレベルです (一番付きやすい)。回す時は今のアイテムをそのアイテムレベルにします (スパムの前に戻すと元に戻ります)。", "Item level changes which tiers can roll, so it changes the odds. It starts at the lowest item level where the target mod's top tier can roll (the best odds). Spamming sets the item to that item level (Undo the spam restores it).") }}</p>
        <p class="mt-1 text-[var(--exile-color-text-secondary)]">{{ tr("ボタンを押している間だけ打ちます。押し続けると速くなり、狙いが出たら自動で止まります。戻す時は「スパムの前に戻す」。", "Uses only while the button is held, faster the longer you hold, and stops automatically on a hit. Use “Undo the spam” to go back.") }}</p>
      </HelpTip>
    </div>
    <p v-if="!keys.length" class="mt-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("今の状態ではカオスを打てません (レアのアイテムに使えます)", "Chaos Orbs can't be used on the item right now (Rare items only)") }}</p>
    <template v-else>
      <!-- ③ 100 人の結果 -->
      <div class="mt-1.5 text-[12px]">
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ result?.hit ? tr(`${SPAM_PEOPLE} 人がスパムの前の状態からスパムしたら`, `If ${SPAM_PEOPLE} people spammed from before your spam`) : tr(`${SPAM_PEOPLE} 人が今の状態からスパムしたら`, `If ${SPAM_PEOPLE} people spammed from here`) }}<template v-if="!stats"> · {{ tr("計算中…", "Calculating…") }} {{ progress }} / {{ SPAM_PEOPLE }}</template></p>
        <dl v-if="stats" class="mt-0.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("半分の人", "Half of them") }}</dt>
          <dd class="tabular-nums">{{ fmt(median) }}<template v-if="median != null && cost(median)"> · {{ cost(median) }}</template></dd>
          <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }}</dt>
          <dd class="tabular-nums">{{ fmt(unlucky) }}<template v-if="unlucky != null && cost(unlucky)"> · {{ cost(unlucky) }}</template></dd>
          <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("一番早い / 遅い", "Fastest / slowest") }}</dt>
          <dd class="tabular-nums">{{ stats.tries.length ? `${fmt(stats.tries[0]!)} / ${fmt(stats.tries[stats.tries.length - 1]!)}` : "—" }}<template v-if="stats.failed"> · {{ tr(`${stats.failed} 人は付かなかった`, `${stats.failed} never hit`) }}</template></dd>
        </dl>
      </div>
      <!-- ③ 自分でスパム (押している間) -->
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <button v-if="!barShown" type="button" data-chaos-spam-hold class="g-btn-red sm select-none touch-none" :disabled="!canSpam" @pointerdown.prevent="startSpam" @pointerup="stopSpam" @pointercancel="stopSpam" @contextmenu.prevent>{{ spamming ? tr("スパム中… (離すと止まる)", "Spamming… (release to stop)") : result && !result.hit && result.sig === sig() ? tr("押して続ける", "Hold to continue") : tr("押している間スパム", "Hold to spam") }}</button>
        <span v-if="spamming || result" class="tabular-nums text-[12px]">{{ tr(`${shownUses.toLocaleString()} 回`, `${shownUses.toLocaleString()} uses`) }}<template v-if="cost(shownApplied)"> · {{ cost(shownApplied) }}</template></span>
        <button v-if="result && !spamming" type="button" class="g-btn sm ml-auto" @click="undoSpam">{{ tr("スパムの前に戻す", "Undo the spam") }}</button>
        <button v-if="result && !spamming" type="button" data-chaos-spam-start class="g-btn sm" :title="tr('工程と費用 (スパムの前の手も) はそのままで、普段のエミュレーターに戻ります', 'Back to the emulator with the steps and cost (including before the spam) kept')" @click="startHere">{{ tr("ここから開始", "Continue from here") }}</button>
      </div>
      <!-- ④ 運試し -->
      <p v-if="result && !spamming" class="mt-1.5 text-[13px]">
        <template v-if="result.hit">
          <b class="text-emerald-300">{{ tr(`${result.uses.toLocaleString()} 回目で付きました！`, `Hit on use ${result.uses.toLocaleString()}!`) }}</b>
          <template v-if="result.rank != null"> {{ tr(`今回は ${SPAM_PEOPLE} 人中 上位 ${result.rank}% の運でした`, `That's top ${result.rank}% luck among ${SPAM_PEOPLE} people`) }}<span class="ml-1 text-[12px]" :class="result.rank <= 50 ? 'text-emerald-300' : 'text-rose-300'">{{ result.rank <= 10 ? tr("(かなりの強運)", "(very lucky)") : result.rank <= 50 ? tr("(運がいい方)", "(lucky)") : result.rank <= 90 ? tr("(運が悪い方)", "(unlucky)") : tr("(かなりの沼)", "(very unlucky)") }}</span></template>
          <template v-else> {{ tr("運を計算中…", "Comparing your luck…") }}</template>
        </template>
        <template v-else>{{ result.reason ?? tr(`${result.uses.toLocaleString()} 回打って、まだ付いていません`, `${result.uses.toLocaleString()} uses, not hit yet`) }}</template>
      </p>
    </template>
    <!-- スマホ: 画面の下の帯 (「使う」の帯と同じ場所と見た目)。押しっぱなしでスパム -->
    <Teleport to="body">
      <div v-if="barShown" data-chaos-spam-bar class="fixed inset-x-0 bottom-0 z-[150] border-t border-amber-400/40 bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
        <p v-if="spamming || result" class="mb-1 truncate text-[12px] font-bold" :class="result?.hit ? 'text-emerald-300' : 'text-white/80'">
          <template v-if="result?.hit && !spamming">{{ tr(`${result.uses.toLocaleString()} 回目で付きました！`, `Hit on use ${result.uses.toLocaleString()}!`) }}<template v-if="result.rank != null"> {{ tr(`上位 ${result.rank}%`, `Top ${result.rank}%`) }}</template></template>
          <template v-else>{{ tr(`${shownUses.toLocaleString()} 回`, `${shownUses.toLocaleString()} uses`) }}<template v-if="cost(shownApplied)"> · {{ cost(shownApplied) }}</template></template>
        </p>
        <div class="flex items-center gap-2">
          <img v-if="iconOf(key)" :src="iconOf(key)" alt="" class="h-9 w-9 object-contain" />
          <b class="min-w-0 flex-1 line-clamp-2 text-[12px] leading-tight text-amber-100">{{ nameOf(key) }}</b>
          <button v-if="result && !spamming" type="button" class="g-btn sm min-h-11" @click="undoSpam">{{ tr("戻す", "Undo") }}</button>
          <button v-if="result && !spamming" type="button" class="g-btn sm min-h-11" @click="startHere">{{ tr("ここから開始", "Continue") }}</button>
          <button type="button" data-chaos-spam-hold class="min-h-11 select-none touch-none rounded-lg bg-amber-500/30 px-3 py-2 font-bold text-amber-50 ring-1 ring-amber-400/70 active:bg-amber-500/50 disabled:opacity-35" :disabled="!canSpam && !spamming" @pointerdown.prevent="startSpam" @pointerup="stopSpam" @pointercancel="stopSpam" @contextmenu.prevent>{{ spamming ? tr("スパム中…", "Spamming…") : tr("押しっぱなしで使う", "Hold to use") }}</button>
          <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/25 text-[22px] leading-none opacity-80" :title="tr('閉じる', 'Close')" @click="spamKey = null; result = null">×</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

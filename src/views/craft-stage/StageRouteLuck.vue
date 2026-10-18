<!--
  StageRouteLuck.vue — スパムシミュレーターの運試し (2026-10-19 オーナー「一番安い欄に運試しボタン、カオススパム計算機の運試しで。
  全スパムで安い奴がここに出るので、それでスパム挙動に。全ての部分で安い場合のスパム運試し。シェアは例の感じで」)。
  一番安い道 (row) の決まりで、100 人と同じ始めの状態から自分で打つ。打つのは route-race.ts の routeRun (100 人と同じ打ち手)。
  エミュレーターのアイテムには触らない (この欄の中だけのアイテム)。押している間打ち、狙いが付いたら止まって 100 人の手数と比べる。
  かなりの強運 (上位 10%) は計算機と同じ銅色の演出と音 (styles/spam-lucky.css)。X のシェアは計算機と同じカード (/s/<id>) に、題と主のカレンシーの絵を足す
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { routeKey, routeRun, type RaceRow, type RaceTarget, type RouteRun } from "../../services/craft-stage/route-race";
import { medianOf, rankOf, unluckyOf, type SpamStats } from "../../services/craft-stage/chaos-spam";
import { mulberry32 } from "../../services/htc/rng";
import { fillModText } from "../../services/htc/mod-text";
import { baseArtFile } from "../../services/craft-stage/base-art";
import { displayCurrency } from "../../state/display-currency";
import { luck, packCard, rankWord, sendShare, shareOrigin, shortIdOf } from "./use-spam-share";
import { playSfx } from "../../utils/sfx";
import { track } from "../../utils/track";
import { logRecord } from "../../utils/log-record";
import { isEn, tr } from "../../i18n/lang";
import type { StageItem } from "../../services/craft-stage/types";

const props = defineProps<{ row: RaceRow; target: RaceTarget; ilvl: number; label: string; routeName: string }>();
const emit = defineEmits<{ close: [] }>();

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
  run = routeRun(s.data.value!, s.base.value, props.ilvl, props.target, props.row.route, props.row.grade, mulberry32((Math.random() * 2 ** 31) | 0), priceOf);
  sync();
  result.value = null;
}
function sync(): void { item.value = run?.item ?? null; n.value = run?.n ?? 0; cost.value = run?.cost ?? 0; last.value = run?.last ?? null; }
watch(() => [props.row, props.target, props.ilvl], fresh, { immediate: true });

let raf = 0, t0 = 0, lastT = 0;
const CAP = 20_000;
function start(e: PointerEvent): void {
  if (spamming.value || !run || run.hit()) return;
  try { (e.currentTarget as Element | null)?.setPointerCapture?.(e.pointerId); } catch { /* 無くてよい */ }
  result.value = null;
  spamming.value = true;
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
  if (!run) return;
  const hit = run.hit();
  result.value = { hit, n: run.n, cost: run.cost, rank: hit ? rankOf(stats.value, run.n) : null, reason };
  if (hit || reason) {
    track("spam:run", hit ? "hit" : "stop");
    logRecord("emu_spam", { base: s.base.value, key: mainKey.value, route: props.row.route, aims: [`${props.target.modId}#${props.target.minTierIndex}`], uses: run.n, hit });
  }
}
onBeforeUnmount(() => cancelAnimationFrame(raf));

// かなりの強運 (上位 10% 以内) は計算機と同じ音と銅色の演出
const isLucky = computed(() => !!result.value?.hit && result.value.rank != null && result.value.rank <= 10);
watch(isLucky, (v) => { if (v) playSfx("rare", 1.5); });

/** アイテムの MOD の行 (狙いは緑) */
const lines = computed(() => {
  const it = item.value, d = s.data.value;
  if (!it || !d) return [];
  return [...it.prefixes, ...it.suffixes].map((m) => {
    const mod = d.mods.get(m.modId);
    const hit = m.modId === props.target.modId && m.tierIndex >= props.target.minTierIndex;
    return { key: `${m.side}:${m.modId}`, text: mod ? fillModText(mod, m.values.map((v) => [v, v])).replace(/\n/g, " / ") : m.modId, tier: m.tierName, side: m.side, hit };
  });
});
const rarityColor = computed(() => (item.value?.rarity === "rare" ? "text-[var(--color-rarity-rare)]" : item.value?.rarity === "magic" ? "text-[var(--color-rarity-magic)]" : "text-[var(--exile-color-text-primary)]"));
const money = (x: number): string => displayCurrency.money(x);
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
    { route: { r: props.row.route, g: props.row.grade, m: props.target.modId, t: props.target.minTierIndex, i: props.ilvl } },
    tr(`スパムシミュレーター · ${props.routeName}`, `Spam simulator · ${props.routeName}`),
    iconOf(mainKey.value) || null,
  ]);
  shareCode = code;
  shareUrl.value = `${shareOrigin()}/s/${await shortIdOf(code)}`;
});
const shareText = computed(() => {
  const r = result.value;
  if (!r?.hit) return "";
  const luckLine = r.rank != null ? tr(`100 人中 ${rankWord(r.rank)} の運 (${luck(r.rank)})`, `${rankWord(r.rank)} luck among 100 people (${luck(r.rank)})`) : "";
  return tr(
    `${props.routeName}で ${baseName.value} に ${props.label} を ${r.n.toLocaleString()} 手 (${money(r.cost)}) で付けた！ ${luckLine}\n#PoE2 #ExileDesk`,
    `${props.routeName}: ${props.label} on ${baseName.value} in ${r.n.toLocaleString()} uses (${money(r.cost)})! ${luckLine}\n#PoE2 #ExileDesk`,
  );
});
const xUrl = computed(() => `https://x.com/intent/post?text=${encodeURIComponent(shareText.value)}&url=${encodeURIComponent(shareUrl.value)}`);
function shareX(e: MouseEvent): void {
  sendShare(e, { code: shareCode, web: xUrl.value, text: shareText.value, url: shareUrl.value, log: { base: s.base.value, rank: result.value?.rank ?? null, route: props.row.route } });
}
</script>

<template>
  <div data-route-luck class="g-section mt-4 grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <!-- 左: この欄のアイテム (始めの状態から、打つたびに変わる) -->
    <div class="min-w-0 rounded-md border border-[var(--exile-color-border-brass)]/40 bg-black/50 px-3 py-2 text-center shadow-[inset_0_0_24px_rgba(0,0,0,0.7)]">
      <p class="text-[13px] font-bold" :class="rarityColor">{{ s.item.value?.baseJa ?? s.base.value }}</p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr(`アイテムレベル ${ilvl}`, `Item level ${ilvl}`) }}</p>
      <div class="my-1.5 h-px bg-gradient-to-r from-transparent via-[var(--exile-color-border-brass)]/50 to-transparent" />
      <ul class="flex min-h-[4.5rem] flex-col justify-center gap-0.5 text-[12px]">
        <li v-for="l in lines" :key="l.key" class="flex items-center justify-center gap-1.5" :class="l.hit ? 'font-bold text-emerald-300' : 'text-[#8888ff]'">
          <span class="min-w-0">{{ l.text }}</span><span class="shrink-0 text-[10px] opacity-60">{{ l.tier }}</span>
        </li>
        <li v-if="!lines.length" class="text-[11px] opacity-50">{{ tr("MOD なし", "No mods") }}</li>
      </ul>
      <p class="mt-1 flex h-5 items-center justify-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
        <template v-if="last">{{ tr("今打った", "Last") }}: <img :src="iconOf(last.key)" alt="" class="size-4 object-contain" />{{ nameOf(last.key) }}<img v-for="o in last.omens" :key="o" :src="iconOf(o)" alt="" class="size-4 object-contain" /></template>
        <template v-else>{{ tr("始めの状態", "Start state") }}</template>
      </p>
    </div>

    <!-- 右: 押すボタン・回数・結果 -->
    <div class="min-w-0">
      <p class="flex items-center gap-2 text-[12px] text-[var(--exile-color-text-secondary)]">
        <img :src="iconOf(mainKey)" alt="" class="size-6 object-contain" />{{ tr(`${routeName}の運試し (100 人と同じ始めの状態から)`, `${routeName} luck test (same start as the 100 people)`) }}
        <button type="button" class="g-btn sm ml-auto" :disabled="spamming" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
      </p>
      <template v-if="result?.hit && !spamming">
        <div v-if="isLucky" :key="`lucky-${result.n}`" data-route-lucky class="spam-lucky">
          <span class="spam-lucky-line" aria-hidden="true" />
          <p class="spam-lucky-kicker">{{ tr("かなりの強運", "Exceptional luck") }}</p>
          <p class="spam-lucky-rank"><span class="spam-lucky-top">TOP</span><span class="spam-lucky-num">{{ result.rank }}</span><span class="spam-lucky-pct">%</span></p>
          <p class="spam-lucky-sub">{{ tr(`100 人の中で ${result.n.toLocaleString()} 手目に付いた`, `Hit on use ${result.n.toLocaleString()} among 100 people`) }}</p>
          <span class="spam-lucky-line" aria-hidden="true" />
        </div>
        <p v-else class="mt-2 text-[16px] font-bold text-emerald-300">{{ tr(`${result.n.toLocaleString()} 手目で付きました！`, `Hit on use ${result.n.toLocaleString()}!`) }}</p>
        <template v-if="result.rank != null">
          <p v-if="!isLucky" class="mt-0.5 text-[13px]">{{ tr(`100 人中 ${rankWord(result.rank)} の運`, `${rankWord(result.rank)} luck among 100 people`) }} <b :class="result.rank <= 50 ? 'text-emerald-300' : 'text-rose-300'">{{ luck(result.rank) }}</b></p>
          <div class="relative mt-1.5 h-2 max-w-[320px] rounded-full bg-gradient-to-r from-emerald-500/60 via-amber-400/50 to-rose-500/60">
            <span class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#14110d]" :style="{ left: `${result.rank}%` }" />
          </div>
        </template>
        <p class="mt-1 tabular-nums text-[var(--exile-color-text-secondary)]">{{ tr(`${result.n.toLocaleString()} 手`, `${result.n.toLocaleString()} uses`) }} · {{ money(result.cost) }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <a data-route-share :href="xUrl" target="_blank" rel="noopener" class="g-btn-red sm inline-flex items-center !no-underline" @click="shareX">{{ tr("X でシェア", "Share on X") }}</a>
          <button type="button" data-route-again class="g-btn sm" @click="fresh">{{ tr("もう一度 (始めの状態から)", "Again (from the start)") }}</button>
        </div>
      </template>
      <template v-else>
        <button type="button" data-route-hold class="g-btn-red mt-2 min-h-11 w-full max-w-[320px] select-none touch-none px-2 text-[14px]" @pointerdown.prevent="start" @pointerup="stop" @pointercancel="stop" @contextmenu.prevent>{{ holdLabel }}</button>
        <p class="mt-1.5 tabular-nums text-[14px]"><b>{{ tr(`${n.toLocaleString()} 手`, `${n.toLocaleString()} uses`) }}</b><span class="text-[var(--exile-color-text-secondary)]"> · {{ money(cost) }}</span></p>
        <p v-if="result && !spamming" class="mt-0.5 text-[var(--exile-color-text-secondary)]">{{ result.reason ?? tr("まだ付いていません。もう一度押すと続きから", "Not hit yet. Hold again to continue") }}</p>
        <button v-if="result && !spamming" type="button" class="g-btn sm mt-1" @click="fresh">{{ tr("始めの状態に戻す", "Back to the start") }}</button>
      </template>
      <p class="mt-2 text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ tr("100 人", "100 people") }}: {{ tr("半分の人", "Half") }} {{ median == null ? "—" : tr(`${median.toLocaleString()} 手`, `${median.toLocaleString()} uses`) }} · {{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }} {{ unlucky == null ? "—" : tr(`${unlucky.toLocaleString()} 手`, `${unlucky.toLocaleString()} uses`) }}</p>
    </div>
  </div>
</template>

<style src="../../styles/spam-lucky.css"></style>

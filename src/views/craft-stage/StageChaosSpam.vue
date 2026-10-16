<!--
  StageChaosSpam.vue — カオススパムモード (2026-10-16 オーナーの手書きのメモ)

  ① 狙う MOD は「次の手で狙う」と同じ (最大 6 つ、全部揃って当たり)
  ② カオス・上級・完全のどれかを選ぶ
  ③ 100 人が当たるまでスパムした時の回数 (半分の人・運が悪い 10 人に 1 人・一番良い / 悪い人) + 自分でもスパム (押している間打ち続け、狙いが出たら自動で止まる)
  ④ 止まったら、100 人の結果と比べて今回の運を出す (「今回は 100 人中 上位 ◯%」、半分より遅ければ「下位 ◯%」)

  打つのはステージと同じ s.use (1 回ずつ工程に入る)。工程は 50 手で古い方が消えるので、戻す時は「スパムの前に戻す」で丸ごと戻す (snapshot / restore)。
  分析の記録は 1 回ごとには送らず、スパムの終わりに 1 件だけ (emu_spam)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { spamAims, spamKey, spamPending, spamming } from "../../state/chaos-spam";
import { centerOnScreen, scrollToTop } from "../../utils/keep-place";
import { displayCurrency } from "../../state/display-currency";
import { aimDone, type AimTarget } from "../../services/craft-stage/aim-odds";
import type { StageItem } from "../../services/craft-stage/types";
import { medianOf, rankOf, spamOne, unluckyOf, SPAM_KEYS, SPAM_PEOPLE, type SpamStats } from "../../services/craft-stage/chaos-spam";
import { mulberry32 } from "../../services/htc/rng";
import { logRecord } from "../../utils/log-record";
import HelpTip from "../../components/ui/HelpTip.vue";
import { isEn, tr } from "../../i18n/lang";
import { aimLabel } from "../../services/craft-stage/mod-list";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { openExternal } from "../../services/trade2/open-external";
import { baseArtFile } from "../../services/craft-stage/base-art";
import { playSfx } from "../../utils/sfx";
import { boardOn } from "../../services/board/board-api";

const targets = computed<AimTarget[]>(() => spamAims.value.map((a) => ({ modId: a.modId, minTierIndex: a.minTierIndex })));
/** 今打てるカオス (普通・上級・完全。アイテムレベルが足りない物などは出さない) */
const keys = computed(() => (s.item.value ? SPAM_KEYS.filter((k) => s.usableBare(k) == null) : []));
const key = ref<string>("chaos");
watch(keys, (ks) => { if (ks.length && !ks.includes(key.value as (typeof SPAM_KEYS)[number])) key.value = ks[0]!; }, { immediate: true });
/**
 * アイテムレベル (2026-10-16 オーナー「アイテムレベル選べるようにせなね。下限は指定の MOD を下限として、そこから一番近いベースのアイテムレベル、あとは変えれる」)。
 * 付く段はアイテムレベルで決まる (段の ilvl 以下だけ) ので確率が変わる (金の指輪の火耐性 T2 以上: 75 は 0.57%、82 は 1.19%)。
 * 下限 = 選んだ段が全部付くアイテムレベル (狙いが複数なら一番高い物)。既定は今のアイテムのアイテムレベル、下限より低ければ下限以上で一番近い段 (73 なら 75)。
 * 選べるのはエミュレーターと同じ 45 / 65 / 75 / 82 / 86
 */
const ILVLS = [45, 65, 75, 82, 86];
const floor = computed(() => Math.max(1, ...targets.value.map((t) => s.data.value?.mods.get(t.modId)?.tiers[t.minTierIndex]?.ilvl ?? 1)));
const ilvl = ref(82);
// 既定は今のアイテムのアイテムレベル (エミュレーターで選んでいる物)。それが下限より低い時だけ、下限以上で一番近い段に上げる
// (2026-10-16 オーナー「導線的におかしくないように」: エミュレーターが 65 なのに確率機が 45 で開き、回すと 45 に下がっていた)
watch([floor, () => s.itemLevel.value], ([f]) => {
  if (spamming.value) return;
  const now = s.itemLevel.value;
  ilvl.value = ILVLS.includes(now) && now >= f ? now : ILVLS.find((x) => x >= Math.max(f, now)) ?? ILVLS[ILVLS.length - 1]!;
}, { immediate: true });
/** そのアイテムレベルにした今のアイテム (計算と自分のスパムの始まり) */
const atIlvl = (it: StageItem | null): StageItem | null => (it && it.itemLevel !== ilvl.value ? { ...it, itemLevel: ilvl.value } : it);
/** アイテムの下の「カオススパム確率機へ」で持っていたカオスの種類で開く */
watch(spamKey, (k) => { if (k && SPAM_KEYS.includes(k as (typeof SPAM_KEYS)[number])) key.value = k; }, { immediate: true });
/** そのボタンから来た時: 狙いが決まったら、この欄を画面の真ん中へ */
const root = ref<HTMLElement | null>(null);
function arrive(): void {
  if (!spamPending.value || !spamAims.value.length) return;
  spamPending.value = false;
  // 帯 (スマホ) が出てから測る。100 人の計算が済むと欄が伸びるので、済んだらもう一度
  void nextTick(() => requestAnimationFrame(() => centerOnScreen(root.value)));
  // 計算が出直さない時 (同じ狙い) に後から急に送らないよう、待つのは少しの間だけ
  recenter = true;
  setTimeout(() => { recenter = false; }, 3000);
}
onMounted(arrive);
watch([spamPending, () => spamAims.value], arrive);

/** 自分のスパムの結果 (④ の運試し)。sig = 狙いとカオスの種類 (変わったら別のスパム) */
interface SpamResult { sig: string; uses: number; applied: number; hit: boolean; reason: string | null; rank: number | null }
const result = ref<SpamResult | null>(null);

/** スパムの前の状態 (スパムの前に戻す用)。下の watch (immediate) より前に置く */
let snap: ReturnType<typeof s.snapshot> | null = null;
/** スパムが終わった時のアイテム (これから変わったら結果は古い) */
let resultItem: typeof s.item.value = null;
// ---- ③ 100 人の結果 (今の状態から。回している間は出し直さない) ----
const stats = ref<SpamStats | null>(null);
const statsFor = ref<string>("");
let recenter = false;
watch(() => stats.value, (v) => { if (v && recenter) { recenter = false; void nextTick(() => centerOnScreen(root.value)); } });
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
  // スパムの後にアイテムが変わっていなければ結果をそのまま (付いた直後・途中で離した時。続けて押すと回数を足すので、比べるのはスパムを始めた時の 100 人のまま)
  if (result.value?.sig === sig() && s.item.value === resultItem) return;
  // 別の手を打った・1 手戻した・白に戻した・ベースを変えた時は、前のスパムの結果は消す
  // (2026-10-16 オーナー「確率機の後、別のベースに変えたら確率機の前の結果のまま表示される」)
  result.value = null;
  snap = null;
  simulate();
}, { immediate: true });
/**
 * 確率機を閉じる (× ・ベースを変えた時)。狙いも外す: 残すと普段の「次の手で狙う」の一覧が出てしまう
 * (2026-10-16 オーナー「また次の手で狙うが表示されてる」)
 */
function closeSpam(): void {
  stopSpam();
  result.value = null;
  snap = null;
  spamKey.value = null;
  spamAims.value = [];
}
/** ベースを変えたら確率機を閉じる (狙いはそのベースの MOD) */
watch(() => s.base.value, () => { if (spamKey.value || result.value || spamAims.value.length) closeSpam(); });
onBeforeUnmount(() => { gen++; clearTimeout(timer); stopSpam(); });

const cost = (n: number): string => (priceOf(key.value) > 0 ? displayCurrency.money(n * priceOf(key.value)) : "");
const fmt = (n: number | null): string => (n == null ? tr("付かない人が多い", "Most never hit") : tr(`${n.toLocaleString()} 回`, `${n.toLocaleString()} uses`));
const median = computed(() => (stats.value ? medianOf(stats.value) : null));
const unlucky = computed(() => (stats.value ? unluckyOf(stats.value) : null));

// ---- ③ 自分でスパム (押している間) ----
const live = ref<{ uses: number; applied: number } | null>(null);
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
  resultItem = s.item.value;
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
  spamAims.value = [];
  s.aimPicker.value = null;
  void nextTick(() => scrollToTop(document.querySelector("[data-stage-card]") as HTMLElement | null, "smooth", "nearest"));
}
/**
 * スマホ: 押している間スパムのボタンは、いつもの「使う」と同じ画面の下の帯に出す (2026-10-16 オーナー「いつものつける時の動作で、
 * つけるボタン押しっぱなしで反応」)。確率機から来た時 (spamKey) か、回している・結果がある時だけ。何か持っている時は「使う」の帯を優先
 */
const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
const onResize = (): void => { phone.value = window.innerWidth < 768; };
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
const barShown = computed(() => phone.value && !boardOn.value && !s.held.value && keys.value.length > 0 && (!!spamKey.value || spamming.value || !!result.value));
const canSpam = computed(() => keys.value.length > 0 && targets.value.length > 0 && !!s.item.value && !aimDone(s.item.value, targets.value));
/** 運の言葉 (PC の欄とスマホの帯で同じ) */
const luck = (r: number): string => (r <= 10 ? tr("かなりの強運", "very lucky") : r <= 50 ? tr("運がいい方", "lucky") : r <= 90 ? tr("運が悪い方", "unlucky") : tr("かなりの沼", "very unlucky"));
/** 順位の言葉: 半分より早ければ「上位」、遅ければ「下位」(85% → 下位 15%。2026-10-16 オーナー「運悪いのに上位はおかしい」) */
const rankWord = (r: number): string => (r <= 50 ? tr(`上位 ${r}%`, `top ${r}%`) : tr(`下位 ${Math.max(1, 100 - r)}%`, `bottom ${Math.max(1, 100 - r)}%`));
/** 押すボタンの文字 (PC の欄とスマホの帯で同じ。離した後は「押して続ける」) */
const holdLabel = computed(() => (spamming.value ? tr("スパム中… (離すと止まる)", "Spamming… (release to stop)") : result.value && !result.value.hit && result.value.sig === sig() ? tr("押して続ける", "Hold to continue") : tr("押している間スパム", "Hold to spam")));
/**
 * シェア (2026-10-16 オーナー「確率機はシェア機能追加。自慢目的、URL と共に宣伝」「押したらそのまま X に」「画像付き」)。
 * 押すと X の投稿画面へ (アプリは外のブラウザで)。URL は /s/spam (server/web/og-card.js): X はそこから結果のカードの絵を出し、
 * 押した人はそのベースのエミュレーターへ。結果は全部 URL に入れる (サーバーは何も保存しない)
 */
const inApp = isTauriRuntime();
/** 中身を縮めて URL に (server/web/og-card.js の PACK と同じ並び: [l, b, bn, m, n, a, r, md, u, c] を deflate → base64url) */
async function packCard(v: Array<string | number | null>): Promise<string> {
  const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(v)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const shareUrl = ref("");
watch([result, () => stats.value, isEn], async () => {
  const r = result.value;
  if (!r?.hit) { shareUrl.value = ""; return; }
  const st = stats.value && statsFor.value === sig() ? stats.value : null;
  const code = await packCard([
    isEn.value ? "en" : "ja",
    s.base.value,
    isEn.value ? s.base.value : (s.item.value?.baseJa ?? s.base.value),
    spamAims.value.map((a) => aimLabel(s.data.value, a)).join(tr("・", ", ")),
    r.uses,
    baseArtFile(s.base.value),
    r.rank,
    st ? medianOf(st) : null,
    st ? unluckyOf(st) : null,
    cost(r.applied) || null,
  ]);
  shareUrl.value = `${inApp ? "https://exiledesk.com" : location.origin}/s/${code}`;
  // カードの絵を先に作らせておく (X が読みに来た時に作り始めると、出るまで待たされた。2026-10-16)
  try { void fetch(`${inApp ? "https://exiledesk.com" : location.origin}/og/${code}.png`, { mode: "no-cors" }); } catch { /* 作れなくても X が来た時に作る */ }
}, { immediate: true });
const shareText = computed(() => {
  const r = result.value;
  if (!r?.hit) return "";
  const base = isEn.value ? s.base.value : (s.item.value?.baseJa ?? s.base.value);
  const mods = spamAims.value.map((a) => aimLabel(s.data.value, a)).join(tr("・", ", "));
  const luckLine = r.rank != null ? tr(`${SPAM_PEOPLE} 人中 ${rankWord(r.rank)} の運 (${luck(r.rank)})`, `${rankWord(r.rank)} luck among ${SPAM_PEOPLE} people (${luck(r.rank)})`) : "";
  return tr(
    `カオススパムで ${base} に ${mods} を ${nameOf(key.value)} ${r.uses.toLocaleString()} 回で付けた！ ${luckLine}\n#PoE2 #ExileDesk`,
    `Chaos spammed ${mods} onto ${base} in ${r.uses.toLocaleString()} ${nameOf(key.value)} uses! ${luckLine}\n#PoE2 #ExileDesk`,
  );
});
/** X の投稿画面 (文の最後に URL が付く) */
const xUrl = computed(() => `https://x.com/intent/post?text=${encodeURIComponent(shareText.value)}&url=${encodeURIComponent(shareUrl.value)}`);
/** スマホ (iPhone・Android) */
const mobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
function shareX(e: MouseEvent): void {
  logRecord("emu_spam_share", { to: mobile ? "x-app" : "x", base: s.base.value, rank: result.value?.rank ?? null });
  if (inApp) {
    e.preventDefault();
    void openExternal(xUrl.value);
    return;
  }
  if (!mobile) return;
  // スマホは X のアプリを直接開く (2026-10-16 オーナー「スマホ版はそのままアプリに飛ばそうか、これウェブに飛ぶね」)。
  // アプリが無くて開けなかった時 (1.5 秒たってもページが見えたまま) は Web の投稿画面へ
  e.preventDefault();
  const web = xUrl.value;
  let left = false;
  const onHide = (): void => { if (document.visibilityState === "hidden") left = true; };
  document.addEventListener("visibilitychange", onHide);
  setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!left && document.visibilityState === "visible") location.href = web;
  }, 1500);
  location.href = `twitter://post?message=${encodeURIComponent(`${shareText.value}\n${shareUrl.value}`)}`;
}
/**
 * かなりの強運 (100 人中 上位 10% 以内) で付いた時は、珍しい段と同じ音 (フィルターの通知音 6) と光 (2026-10-16 オーナー
 * 「確率機で運がめっちゃいい人にはちゃんと音出してあげてね、あの例の神演出で」)。運は 100 人の計算が済んでから出るので、出た時に 1 回だけ
 */
const lucky = ref(0);
let luckyFor: unknown = null;
watch(() => result.value?.rank, (r) => {
  const res = result.value;
  if (!res?.hit || r == null || r > 10 || luckyFor === res) return;
  luckyFor = res;
  playSfx("rare", 1.5);
  lucky.value++;
});
/** かなりの強運 (上位 10% 以内) */
const isLucky = computed(() => !!result.value?.hit && result.value.rank != null && result.value.rank <= 10);
const shownUses = computed(() => live.value?.uses ?? result.value?.uses ?? 0);
const shownApplied = computed(() => live.value?.applied ?? result.value?.applied ?? 0);
</script>

<template>
  <!-- 「次の手で狙う」を押しただけの時は出さない。アイテムの下の「カオススパム確率機へ」から来た時 (spamKey) と、回している・結果がある時だけ (2026-10-16 オーナー) -->
  <!--
    確率機は「次の手で狙う」とは別の欄・別の狙い (spamAims。2026-10-16 オーナー「カオススパム確率機と狙うは別ルートとして扱って」)。
    PC: 左に 100 人の結果、右に押すボタンと自分の結果。スマホは縦に積み、押すボタンは下の帯
  -->
  <section v-if="spamKey || spamming || result" ref="root" data-chaos-spam class="g-panel scroll-mt-2 p-2 text-[12px]">
    <header class="g-sec-head">
      <b class="g-sec-title">{{ tr("カオススパム", "Chaos spam") }}</b>
      <span class="flex min-w-0 flex-wrap gap-1 max-md:order-last max-md:w-full">
        <span v-for="a in spamAims" :key="a.modId" class="inline-flex items-center gap-1 rounded bg-[rgba(136,136,255,0.14)] py-0.5 pl-1.5 text-[12px] text-[var(--color-rarity-magic)]">{{ aimLabel(s.data.value, a) }}<button type="button" class="g-plain grid size-7 place-items-center opacity-60 hover:opacity-100" :disabled="spamming" :title="tr('この MOD を外す', 'Remove this mod')" @click="spamAims = spamAims.filter((x) => x.modId !== a.modId)">×</button></span>
        <button type="button" class="g-plain inline-flex min-h-7 items-center gap-1 rounded border border-dashed border-white/25 px-2 text-[12px] text-[var(--exile-color-text-secondary)] hover:bg-white/5" :disabled="spamming" @click="s.aimPicker.value = { seed: null, spam: true }">+ {{ spamAims.length ? tr("足す・変える", "Add / change") : tr("狙う MOD を選ぶ", "Choose mods") }}</button>
      </span>
      <button type="button" class="ml-auto grid size-8 place-items-center rounded text-[var(--exile-color-text-tertiary)] hover:bg-white/10 hover:text-[var(--exile-color-text-primary)]" :disabled="spamming" :title="tr('確率機を閉じる', 'Close the calculator')" @click="closeSpam">×</button>
    </header>
    <p v-if="!spamAims.length" class="py-2 text-[var(--exile-color-text-secondary)]">{{ tr("狙う MOD を選ぶと、100 人がスパムした時の回数が出ます", "Choose target mods to see how many uses 100 people needed") }}</p>
    <div v-else>
    <!-- ② カオスの種類・アイテムレベル -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span v-if="keys.length" class="flex items-center gap-1">
        <button v-for="k in keys" :key="k" type="button" class="g-tab !min-h-[30px] !gap-1 !px-2 !text-[12px]" :class="key === k ? 'on' : ''" :disabled="spamming" :title="nameOf(k)" @click="key = k"><img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="size-5 object-contain" />{{ k === "chaos" ? tr("普通", "Normal") : k === "chaos_greater" ? tr("上級", "Greater") : tr("完全", "Perfect") }}</button>
      </span>
      <span class="flex items-center gap-1">
        <span class="mr-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("アイテムレベル", "Item level") }}</span>
        <button v-for="lv in ILVLS" :key="lv" type="button" class="g-tab !min-h-[30px] !px-2 !text-[12px] tabular-nums" :class="ilvl === lv ? 'on' : ''" :disabled="spamming || lv < floor" :title="lv < floor ? tr(`狙いの段はアイテムレベル ${floor} から`, `The target tier needs item level ${floor}`) : undefined" @click="ilvl = lv">{{ lv }}</button>
      </span>
      <HelpTip :title="tr('カオススパム', 'Chaos spam')" :width="320">
        <p>{{ tr("狙いの MOD が全部揃うまで、同じカオスを打ち続けます。外れても、その結果に続けて打ちます (今の MOD が消えても、狙いが揃えば当たり)。", "Keeps using the same Chaos Orb until all target mods are on. A miss keeps going from the result (a hit even if current mods were removed).") }}</p>
        <p class="mt-1">{{ tr(`「${SPAM_PEOPLE} 人がスパムしたら」は、今の状態から ${SPAM_PEOPLE} 人が同じように打った時に、何回で付いたか。止まった後に、今回の自分の回数と比べて運を出します。`, `"If ${SPAM_PEOPLE} people spammed" shows how many uses it took ${SPAM_PEOPLE} people starting from the current state. After you stop, your count is compared with theirs.`) }}</p>
        <p class="mt-1">{{ tr("アイテムレベルで付く段が変わるので、確率も変わります。最初は今のアイテムのアイテムレベルです (選んだ MOD が付かない時は、付く一番近いアイテムレベル)。回す時は今のアイテムをそのアイテムレベルにします (スパムの前に戻すと元に戻ります)。", "Item level changes which tiers can roll, so it changes the odds. It starts at the item's current item level (raised to the nearest level where all target mods can roll if needed). Spamming sets the item to that item level (Undo the spam restores it).") }}</p>
        <p class="mt-1 text-[var(--exile-color-text-secondary)]">{{ tr("ボタンを押している間だけ打ちます。押し続けると速くなり、狙いが出たら自動で止まります。戻す時は「スパムの前に戻す」。", "Uses only while the button is held, faster the longer you hold, and stops automatically on a hit. Use “Undo the spam” to go back.") }}</p>
      </HelpTip>
    </div>
    <p v-if="!keys.length" class="mt-2 text-[var(--exile-color-text-secondary)]">{{ tr("今の状態ではカオスを打てません (レアのアイテムに使えます)", "Chaos Orbs can't be used on the item right now (Rare items only)") }}</p>
    <div v-else class="g-section mt-2 grid gap-x-6 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <!-- ③ 100 人の結果 -->
      <div class="min-w-0">
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ result ? tr(`${SPAM_PEOPLE} 人がスパムの前の状態からスパムしたら`, `If ${SPAM_PEOPLE} people spammed from before your spam`) : tr(`${SPAM_PEOPLE} 人が今の状態からスパムしたら`, `If ${SPAM_PEOPLE} people spammed from here`) }}<template v-if="!stats"> · {{ tr("計算中…", "Calculating…") }} {{ progress }} / {{ SPAM_PEOPLE }}</template></p>
        <dl v-if="stats" class="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("半分の人", "Half of them") }}</dt>
          <dd class="tabular-nums"><b>{{ fmt(median) }}</b><span v-if="median != null && cost(median)" class="text-[var(--exile-color-text-secondary)]"> · {{ cost(median) }}</span></dd>
          <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("運が悪い 10 人に 1 人", "Unluckiest 1 in 10") }}</dt>
          <dd class="tabular-nums"><b>{{ fmt(unlucky) }}</b><span v-if="unlucky != null && cost(unlucky)" class="text-[var(--exile-color-text-secondary)]"> · {{ cost(unlucky) }}</span></dd>
          <dt class="text-[var(--exile-color-text-secondary)]">{{ tr("一番早い / 遅い", "Fastest / slowest") }}</dt>
          <dd class="tabular-nums">{{ stats.tries.length ? `${fmt(stats.tries[0]!)} / ${fmt(stats.tries[stats.tries.length - 1]!)}` : "—" }}<template v-if="stats.failed"> · {{ tr(`${stats.failed} 人は付かなかった`, `${stats.failed} never hit`) }}</template></dd>
        </dl>
      </div>
      <!-- ③ 自分でスパム・④ 運試し -->
      <div class="min-w-0">
        <template v-if="result?.hit && !spamming">
          <!--
            かなりの強運 (上位 10% 以内): 落ち着いた銅色の演出 (2026-10-16 オーナー「少し見た目オシャレな感じで、かつ大人の感じで」)。
            細い銅色の線が中央から伸び、TOP の数字が銅色の字で浮かび上がって光が 1 回だけ走る。派手な色や柱は使わない。key を変えて毎回動かす
          -->
          <div v-if="isLucky" :key="`lucky-${lucky}`" data-chaos-spam-lucky class="spam-lucky">
            <span class="spam-lucky-line" aria-hidden="true" />
            <p class="spam-lucky-kicker">{{ tr("かなりの強運", "Exceptional luck") }}</p>
            <p class="spam-lucky-rank"><span class="spam-lucky-top">TOP</span><span class="spam-lucky-num">{{ result.rank }}</span><span class="spam-lucky-pct">%</span></p>
            <p class="spam-lucky-sub">{{ tr(`${SPAM_PEOPLE} 人の中で ${result.uses.toLocaleString()} 回目に付いた`, `Hit on use ${result.uses.toLocaleString()} among ${SPAM_PEOPLE} people`) }}</p>
            <span class="spam-lucky-line" aria-hidden="true" />
          </div>
          <p v-else class="text-[16px] font-bold text-emerald-300">{{ tr(`${result.uses.toLocaleString()} 回目で付きました！`, `Hit on use ${result.uses.toLocaleString()}!`) }}</p>
          <template v-if="result.rank != null">
            <p v-if="!isLucky" class="mt-0.5 text-[13px]">{{ tr(`${SPAM_PEOPLE} 人中 ${rankWord(result.rank)} の運`, `${rankWord(result.rank)} luck among ${SPAM_PEOPLE} people`) }} <b :class="result.rank <= 50 ? 'text-emerald-300' : 'text-rose-300'">{{ luck(result.rank) }}</b></p>
            <!-- 100 人の中の位置 (左が早い) -->
            <div class="relative mt-1.5 h-2 max-w-[320px] rounded-full bg-gradient-to-r from-emerald-500/60 via-amber-400/50 to-rose-500/60">
              <span class="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#14110d]" :style="{ left: `${result.rank}%` }" />
            </div>
          </template>
          <p v-else class="mt-0.5 text-[var(--exile-color-text-secondary)]">{{ tr("運を計算中…", "Comparing your luck…") }}</p>
          <p class="mt-1 tabular-nums text-[var(--exile-color-text-secondary)]">{{ tr(`${result.uses.toLocaleString()} 回`, `${result.uses.toLocaleString()} uses`) }}<template v-if="cost(result.applied)"> · {{ cost(result.applied) }}</template></p>
        </template>
        <template v-else>
          <button v-if="!barShown" type="button" data-chaos-spam-hold class="g-btn-red min-h-11 select-none touch-none px-2 text-[14px]" :disabled="!canSpam" @pointerdown.prevent="startSpam" @pointerup="stopSpam" @pointercancel="stopSpam" @contextmenu.prevent>{{ holdLabel }}</button>
          <p v-if="spamming || result" class="mt-1.5 tabular-nums text-[14px]"><b>{{ tr(`${shownUses.toLocaleString()} 回`, `${shownUses.toLocaleString()} uses`) }}</b><span v-if="cost(shownApplied)" class="text-[var(--exile-color-text-secondary)]"> · {{ cost(shownApplied) }}</span></p>
          <p v-if="result && !spamming" class="mt-0.5 text-[var(--exile-color-text-secondary)]">{{ result.reason ?? tr("まだ付いていません。もう一度押すと続きから", "Not hit yet. Hold again to continue") }}</p>
        </template>
        <!-- 自慢 (付いた時だけ。押すとそのまま X へ) -->
        <div v-if="result?.hit && !spamming" data-chaos-spam-share class="mt-2">
          <a :href="xUrl" target="_blank" rel="noopener" class="g-btn-red sm inline-flex items-center !no-underline" @click="shareX">{{ tr("X でシェア", "Share on X") }}</a>
        </div>
        <div v-if="result && !spamming && !barShown" class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="g-btn sm" @click="undoSpam">{{ tr("スパムの前に戻す", "Undo the spam") }}</button>
          <button type="button" data-chaos-spam-start class="g-btn sm" :title="tr('工程と費用 (スパムの前の手も) はそのままで、普段のエミュレーターに戻ります', 'Back to the emulator with the steps and cost (including before the spam) kept')" @click="startHere">{{ tr("ここから開始", "Continue from here") }}</button>
        </div>
      </div>
    </div>
    </div>
    <!-- スマホ: 画面の下の帯 (「使う」の帯と同じ場所と見た目)。押しっぱなしでスパム -->
    <Teleport to="body">
      <div v-if="barShown" data-chaos-spam-bar data-bottom-bar class="fixed inset-x-0 bottom-0 z-[150] border-t border-amber-400/40 bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
        <p v-if="spamming || result" class="mb-1 truncate text-[12px] font-bold" :class="result?.hit ? 'text-emerald-300' : 'text-white/80'">
          <template v-if="result?.hit && !spamming">{{ tr(`${result.uses.toLocaleString()} 回目で付きました！`, `Hit on use ${result.uses.toLocaleString()}!`) }}<template v-if="result.rank != null"> {{ rankWord(result.rank) }} ({{ luck(result.rank) }})</template></template>
          <template v-else>{{ tr(`${shownUses.toLocaleString()} 回`, `${shownUses.toLocaleString()} uses`) }}<template v-if="cost(shownApplied)"> · {{ cost(shownApplied) }}</template><template v-if="!spamming && result?.reason"> · {{ result.reason }}</template></template>
        </p>
        <!-- 止まった後の 戻す / ここから開始 は 1 段上に (横に並べると押すボタンが 3 行に潰れる) -->
        <div v-if="result && !spamming" class="mb-1.5 flex justify-end gap-2">
          <button type="button" class="g-btn sm min-h-10" @click="undoSpam">{{ tr("スパムの前に戻す", "Undo the spam") }}</button>
          <button type="button" class="g-btn sm min-h-10" @click="startHere">{{ tr("ここから開始", "Continue from here") }}</button>
        </div>
        <div class="flex items-center gap-2">
          <img v-if="iconOf(key)" :src="iconOf(key)" alt="" class="h-9 w-9 object-contain" />
          <b class="min-w-0 flex-1 line-clamp-2 text-[12px] leading-tight text-amber-100">{{ nameOf(key) }}</b>
          <button type="button" data-chaos-spam-hold class="g-btn-red min-h-11 shrink-0 whitespace-nowrap select-none touch-none px-1 text-[13px]" :disabled="!canSpam && !spamming" @pointerdown.prevent="startSpam" @pointerup="stopSpam" @pointercancel="stopSpam" @contextmenu.prevent>{{ spamming ? tr("スパム中…", "Spamming…") : result && !result.hit && result.sig === sig() ? tr("押して続ける", "Hold to continue") : tr("押しっぱなしで使う", "Hold to use") }}</button>
          <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/25 text-[22px] leading-none opacity-80" :title="tr('閉じる', 'Close')" @click="closeSpam">×</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
/* かなりの強運 (上位 10% 以内) の演出。銅色 1 色 (#b87333) と、字の中だけ銅の光のグラデーション (2026-10-16 オーナー「やっぱオレンジかな、全体的に暗めの」「銅色の光って大人っぽい」) */
.spam-lucky {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 320px;
  padding: 10px 12px 12px;
  background: radial-gradient(ellipse at 50% 55%, rgba(150, 82, 40, 0.22), rgba(150, 82, 40, 0) 70%);
  animation: spam-lucky-in 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.spam-lucky-line {
  display: block;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, rgba(184, 115, 51, 0), rgba(184, 115, 51, 0.9) 50%, rgba(184, 115, 51, 0));
  transform: scaleX(0);
  animation: spam-lucky-line 1.1s cubic-bezier(0.2, 0.7, 0.2, 1) 0.15s forwards;
}
.spam-lucky-kicker {
  margin-top: 8px;
  font-family: var(--exile-font-family-antique);
  font-size: 12px;
  letter-spacing: 0.5em;
  padding-left: 0.5em;
  color: #b87333;
  opacity: 0;
  animation: spam-lucky-fade 0.8s ease-out 0.45s forwards;
}
.spam-lucky-rank {
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1;
  margin-top: 2px;
}
.spam-lucky-top {
  font-family: var(--exile-font-family-antique);
  font-size: 13px;
  letter-spacing: 0.3em;
  color: #9c7a62;
}
.spam-lucky-num,
.spam-lucky-pct {
  font-family: var(--exile-font-family-antique);
  background: linear-gradient(105deg, #5e2f16 0%, #c4814a 35%, #f6d2b0 50%, #c4814a 65%, #5e2f16 100%);
  background-size: 250% 100%;
  background-position: 100% 0;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: spam-lucky-shine 1.6s ease-in-out 0.5s forwards;
}
.spam-lucky-num { font-size: 52px; }
.spam-lucky-pct { font-size: 26px; }
.spam-lucky-sub {
  margin: 4px 0 8px;
  font-size: 12px;
  color: #9c7a62;
  opacity: 0;
  animation: spam-lucky-fade 0.8s ease-out 0.8s forwards;
}
@keyframes spam-lucky-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes spam-lucky-line { to { transform: scaleX(1); } }
@keyframes spam-lucky-fade { to { opacity: 1; } }
@keyframes spam-lucky-shine { to { background-position: 0% 0; } }
@media (prefers-reduced-motion: reduce) {
  .spam-lucky, .spam-lucky-line, .spam-lucky-kicker, .spam-lucky-sub, .spam-lucky-num, .spam-lucky-pct { animation: none; opacity: 1; transform: none; }
}
</style>

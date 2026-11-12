<!--
  DailyPlay.vue — 挑戦のページ (D-30〜D-36)。お題を開いて 1 時間。順番: 始め方とフラクチャー予定の MOD を選ぶ (D-37j) → シミュの木 → 100 人回す → 提出。
  木は SimTreePage をそのまま中に置き、上の帯だけここの物 (D-31)。外す部品は daily-skin.css が隠す (D-90。シミュ部長の切り出しまでの形、D-41)。
  木はこのブラウザに覚え、開き直すと戻る。時間はスタートからの実際の時計で、ページを閉じても進む (D-32)。挑戦は 1 日 1 回で始め直せない (D-33)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { craftStage as s } from "../../state/craft-stage";
import { treeStep } from "../../web/page";
import { goDaily } from "./daily-open";
import { usePhone } from "../../utils/use-phone";
import SimTreePage from "../simulator/tree/SimTreePage.vue";
import { useTree } from "../simulator/tree/use-tree";
import { recipeCardOf } from "../simulator/recipe-card";
import { fitDailySide } from "./daily-side-fit";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import type { StartFrom, TreeDoc } from "../../services/simulator/tree/tree-model";
import { fillTopicDoc } from "./daily-aims";
import { liveAct, liveDoc, liveStart, liveStop } from "./daily-live";
import { fourOnlyOn, metBoxes, markMet, perBoxOn, topicPrice, unmetDone } from "./daily-cost";
import { treeRunRig } from "../simulator/tree/use-tree-run";
import DailyPlayBar from "./DailyPlayBar.vue";
import DailyFracPick from "./DailyFracPick.vue";
import DailySubmitAsk from "./DailySubmitAsk.vue";
import DailyGiveUpAsk from "./DailyGiveUpAsk.vue";
import DailyRestartAsk from "./DailyRestartAsk.vue";
import ModeTabs from "../../components/for-share/ModeTabs.vue";
import { dailyRecipeName, dailyUnsaved, saveDailyCopy } from "./daily-save";
import { askLeave, closeDailyPage, setLayerLeaveGuard } from "../../web/page";
import { DEV_RUN, DEV_RUN0, devState, devTry } from "./daily-dev-states";
import { DEV_BUILD, flag } from "../../web/release-flags";
/** 新しい始め方 (白から確定フラクチャー + フラクチャー無し、D-03) を出す日か。開発版は今日のお題でも出す (11-11 オーナー「開発版で触って挙動確認するわ。今日のデイリー出してくれ開発に」)、本番は FOUR_ONLY_FROM から */
const fourOnlyHere = (id: string): boolean => DEV_BUILD || fourOnlyOn(id);
import "./daily-play.css";
import { getTry, leftMs, SOLVE_RATE, startTry, TIME_LIMIT_MS, updateTry, type DailyTopic, type DailyTry, type StartError } from "./daily-api";

const props = defineProps<{ topic: DailyTopic }>();
const t = useTree();
/** 開発版だけ: 状態ごとに開く見本 (daily-dev-states.ts)。この間はサーバーにも端末の控えにも書かない */
const dev = devState();
const devNoAims = ref(false);
/** サーバーの返りが来るまでは null (端末の写しを先に出すと古い時刻が見える) */
const tryOf = ref<DailyTry | null>(null);
const treeOn = ref(false);
const art = computed(() => baseArt(props.topic.base));

/** 時計は 1 秒ごとに読み直すだけ (残りはスタートの時刻から数える) */
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
// 端末の時計がサーバーより遅いと 60:01 のように 1 時間を超えて見えるので、上は 1 時間で止める
const left = computed(() => Math.min(TIME_LIMIT_MS, tryOf.value ? leftMs(tryOf.value, now.value) : TIME_LIMIT_MS));
/** 時間切れか諦めた (D-37b)。木は見るだけ */
const over = computed(() => left.value <= 0 || !!tryOf.value?.ended);
const clock = computed(() => { const s2 = Math.max(0, Math.ceil(left.value / 1000)); const m = Math.floor(s2 / 60); return `${String(m).padStart(2, "0")}:${String(s2 % 60).padStart(2, "0")}`; });
/** 残りの割合 (導火線の長さ、D-60b) */
const fuse = computed(() => Math.max(0, Math.min(1, left.value / TIME_LIMIT_MS)));
const heat = computed(() => (left.value < 60_000 ? "last" : left.value < 600_000 ? "near" : ""));

/** スタートを押してここへ来た時に挑戦が始まる (POST /daily/start)。データが来るまで待つ。今日でない・14:50 を過ぎた時はサーバーが断る。始めていれば同じ挑戦が返る */
const refused = ref<StartError | null>(null);
let starting = false;
async function begin(): Promise<void> {
  // 端末の写しがあってもサーバーに聞く (時刻・終わった印の正はサーバー。写しは別の名前・置き場の作り直しで古くなる)。始めていれば同じ挑戦が返る
  if (starting || !s.data.value) return;
  if (dev) { devOpen(); return; }
  starting = true;
  const r = await startTry(props.topic.id);
  starting = false;
  if (typeof r === "string") { refused.value = r; return; }
  tryOf.value = r;
  if (r.fractured && !treeOn.value) openTree();
}
/** 開発版の見本を開く (一度だけ)。窓の状態はここで開く */
let devDone = false;
function devOpen(): void {
  if (devDone || !dev) return;
  devDone = true;
  const x = devTry(props.topic, dev);
  if (!x) { devNoAims.value = true; return; }
  tryOf.value = x;
  if (x.fractured) openTree();
  void nextTick(() => setTimeout(() => {
    if (dev === "submit") asking.value = { ...DEV_RUN };
    if (dev === "done") { doneShown.value = { ...DEV_RUN }; asking.value = { ...DEV_RUN }; }
    if (dev === "submit0") asking.value = { ...DEV_RUN0 };
    if (dev === "done0") { doneShown.value = { ...DEV_RUN0 }; asking.value = { ...DEV_RUN0 }; }
    if (dev === "leave") askLeave(() => goDaily({ view: "list" }), () => saveDailyCopy(props.topic, dailyRecipeName(props.topic), t.doc.value));
  }, 300));
}
/** スマホの幅では挑戦しない (D-70)。URL を開いても始めず (時計を動かさない)、一覧へ戻る口だけ出す。幅が広がれば始める */
const phone = usePhone();
watch([() => s.data.value, phone], () => { if (!phone.value) void begin(); }, { immediate: true });

/** 始め方とフラクチャー予定の MOD を選ぶ画面 (D-37c・D-37j、DailyFracPick)。諦めた後は選ばない */
const picking = computed(() => !!tryOf.value && !tryOf.value.fractured && !tryOf.value.ended);

/** お題の木を開く。覚えた木があればそれを、無ければお題から白紙で */
function openTree(): void {
  const x = tryOf.value;
  if (!x?.fractured) return;
  treeStep.value = "tree";
  const saved = x.tree ? (JSON.parse(x.tree) as TreeDoc) : null;
  if (saved) t.open(saved);
  else { t.startTreeWith(props.topic.base, props.topic.ilvl); t.edit((d) => fillTopicDoc(d, x.aims, x.fractured!, x.from)); }
  treeOn.value = true;
  // 挑戦中の木と動作の控えをサーバーへ (D-57b)。見本・終わった挑戦では送らない
  if (!dev && !x.ended) liveStart(props.topic.id, x.startedAt);
}
/**
 * スタートからやり直す (D-37j、11-10 オーナー「タイマーは進むけどスタートのやり直しができるボタンを最初のカードに」)。
 * 木・始め方・MOD の覚えを消して 1 段目 (始め方) へ。時刻はサーバーの始めた時刻のままなので残り時間は進む。終わった挑戦では出さない
 */
const restarting = ref(false);
/** 差し込み先 = スタートの箱 (下の段を持つ箱)。木の箱は後から描かれ、描き直しで替わることもあるので、出た物を見張って拾う (Teleport は先にある所にしか置けない) */
const startBox = ref<HTMLElement | null>(null);
let startObs: MutationObserver | null = null;
watch(treeOn, (on) => {
  startObs?.disconnect(); startObs = null; startBox.value = null;
  const root = document.querySelector<HTMLElement>("[data-daily-play]");
  if (!on || !root) return;
  const find = (): void => { const el = root.querySelector<HTMLElement>("[data-tree-box]:has([data-tree-start-under])"); if (el !== startBox.value) startBox.value = el; };
  find();
  startObs = new MutationObserver(find);
  startObs.observe(root, { childList: true, subtree: true });
}, { immediate: true, flush: "post" });
onBeforeUnmount(() => startObs?.disconnect());
function restart(): void {
  restarting.value = false;
  if (!tryOf.value || over.value) return;
  clearTimeout(saveT);
  liveAct("restart");
  treeOn.value = false;
  if (dev) { tryOf.value = { ...tryOf.value, fractured: undefined, from: undefined, tree: undefined }; return; }
  updateTry(props.topic.id, { fractured: undefined, from: undefined, tree: undefined });
  const x = getTry(props.topic.id);
  if (x) tryOf.value = { ...x };
}
function pick(modId: string, from: StartFrom): void {
  if (dev && tryOf.value) { tryOf.value = { ...tryOf.value, fractured: modId, from }; openTree(); return; }
  updateTry(props.topic.id, { fractured: modId, from });
  tryOf.value = getTry(props.topic.id);
  openTree();
  liveAct("pick", { mod: modId, from });
}

// 完成形のカードはいつも開く (デイリーでは畳むボタンを隠しているので、畳んだまま開けなくなっていた、11-09)。開く物はシミュのカードの畳みの印 (この端末の覚え) を押すだけ
watch(treeOn, (on) => { if (on) setTimeout(() => void nextTick(() => document.querySelector<HTMLButtonElement>('[data-daily-play] [data-tree-goal-fold][aria-expanded="false"]')?.click()), 0); }, { immediate: true });
// 前提は変えられない (D-34): 完成形・始まりの窓を開かせず、1 つ戻すで白紙へ抜けた時は戻す
watch(() => t.goalPage.value, (p) => { if (treeOn.value && p) t.goalPage.value = 0; });
watch(() => t.startPage.value, (p) => { if (treeOn.value && p) t.startPage.value = false; });
let saveT = 0;
watch(() => t.doc.value, (d) => {
  if (!treeOn.value) return;
  if (d.base !== props.topic.base || !d.memoAims?.length) { openTree(); return; }
  // 完成形と同じ形の箱は自動で完成 (D-35b ②)。付けた後の木でもう一度ここへ来る (その時は付ける物が無い)
  const data = s.data.value;
  if (data && tryOf.value && !over.value && metBoxes(data, d, tryOf.value.aims).length) { t.edit((x) => { markMet(data, x, tryOf.value!.aims); }); return; }
  clearTimeout(saveT);
  if (!dev) saveT = window.setTimeout(() => updateTry(props.topic.id, { tree: JSON.stringify(toRecipeV1(d)) }), 500);
  if (!dev) liveDoc(d);
});
let rigKey = "";
// 100 人回す・穴チェックはお題に固定した種と相場の写しで、始めの値段は 0 (D-34・D-58、シミュの S-70c)。16:00 の検算 (runCost) と同じ数になる。写しが無い開発の見本は普段のまま
watch([treeOn, tryOf, () => s.data.value], ([on, x, data]) => {
  const price = on && x?.seed != null && data ? topicPrice(data, { base: props.topic.base, ilvl: props.topic.ilvl, prices: x.prices }) : null;
  if (!price) { if (treeRunRig.value) treeRunRig.value = null; rigKey = ""; return; }
  // 同じ種・同じ写しなら入れ直さない (挑戦の控えは読み直すたびに別の物になる。入れ直すと回した結果が消える)
  const key = `${x!.seed}|${JSON.stringify(x!.prices)}`;
  if (treeRunRig.value && key === rigKey) return;
  rigKey = key;
  treeRunRig.value = { seed: x!.seed!, price, startCost: 0, perBox: perBoxOn(props.topic.id) }; // 箱ごとの乱数は D-58b の日から (検算と同じ)
}, { immediate: true });
onBeforeUnmount(() => { treeRunRig.value = null; });
// 別の場所の木を持ち込まない (D-36): 貼り付けは入力欄の外では届かせない
const noPaste = (e: ClipboardEvent): void => { if (!(e.target as HTMLElement | null)?.closest?.("input, textarea")) e.stopPropagation(); };
window.addEventListener("paste", noPaste, true);
// 離れる時にレシピへの保存をすすめる (D-36c)。聞くのは時間内で諦めていない間に、レシピに保存していない変更がある時だけ。自分のページへの移り (読み込み直し) は聞かない。
// 置き場は web/page.ts の外の層の確かめ (一覧へ戻る・ブラウザの戻る / 進む・上のタブ・閉じる / 読み直す、U-28)。置くのは mount の時 (作り直しの時、古い画面が外した後に置く)
const here = `page=daily-start&q=${props.topic.id}`;
onMounted(() => setLayerLeaveGuard({
  ask: (to) => to !== here && treeOn.value && left.value > 0 && !getTry(props.topic.id)?.ended && dailyUnsaved(props.topic.id, t.doc.value),
  save: () => saveDailyCopy(props.topic, dailyRecipeName(props.topic), t.doc.value),
}));
onBeforeUnmount(() => { liveStop(true); clearInterval(tick); clearTimeout(saveT); window.removeEventListener("paste", noPaste, true); setLayerLeaveGuard(null); });

/** 今の木の 100 人の結果 (recipe-card の控え。組み替えると消える) */
const run = computed((): { rate: number; cost: number | null } | null => {
  if (!treeOn.value) return null;
  const c = recipeCardOf(t.doc.value);
  if (c.n !== 100 || c.p == null) return null;
  if (c.c != null) return { rate: c.p, cost: c.c };
  // 完成 0 人は費用が無い (—) が、そのまま提出できる (D-35d、11-10 オーナー「完成率０でも別にいいと思う」)。順位には載らない
  return flag("dailyZero") && c.p === 0 ? { rate: 0, cost: null } : null;
});
// 100 人回した結果も動作の列へ (D-57b)
watch(run, (r) => { if (r && !dev) liveAct("run", { rate: r.rate, cost: r.cost }); });
/** お題の狙いを満たさない完成の箱 (D-35b)。あれば提出できない (シミュでは完成は人が決めるが、デイリーで完成に数えるのは狙いを満たした品だけ) */
const unmet = computed(() => (treeOn.value && s.data.value && tryOf.value ? unmetDone(s.data.value, t.doc.value, tryOf.value.aims) : []));
/** 提出の確かめと結果の窓 (D-35c)。出したら挑戦は終わり */
const asking = ref<{ cost: number | null; rate: number } | null>(null);
/** 開発版の見本の「終わった後の結果」(dev=done) */
const doneShown = ref<{ cost: number | null; rate: number } | null>(null);
function submit(): void {
  const r = run.value;
  if (!r || over.value || unmet.value.length) return;
  asking.value = { ...r };
}
/** 出した: 挑戦は終わり (木は見るだけ・札も窓も出ない)。控えの中身は daily-api が書き替えたので写し直して画面に効かせる */
function submitted(): void {
  if (dev && tryOf.value && asking.value) { tryOf.value = { ...tryOf.value, ended: true, submitted: true, last: { ...asking.value, cost: asking.value.cost ?? 0, ms: 0, at: Date.now() } }; return; }
  const x = getTry(props.topic.id);
  if (x) tryOf.value = { ...x };
}
/** 提出・諦めるは木の右の欄の完成形のカードの下 (D-37m、11-10 オーナー「諦めると提出するは完成形カードの下に配置でいいかもね」)。
 *  右の欄を閉じた時 (シミュの v-show で隠れる) は木の枠の右上の「完成形」の下へ移す。閉じたかは欄の style を見る (シミュの部品は触らない) */
const sideShut = ref(false);
const giving = ref(false);
let sideObs: MutationObserver | null = null;
let sideFit: (() => void) | null = null;
watch(treeOn, (on) => {
  sideObs?.disconnect(); sideObs = null; sideFit?.(); sideFit = null;
  if (!on) return;
  void nextTick(() => {
    const side = document.querySelector<HTMLElement>("[data-daily-play] [data-tree-side]");
    if (!side) return;
    const look = (): void => { sideShut.value = side.style.display === "none"; };
    look();
    sideObs = new MutationObserver(look);
    sideObs.observe(side, { attributes: true, attributeFilter: ["style"] });
    sideFit = fitDailySide(side); // 欄の高さに収める (カードの倍率・ミニマップ、D-37m)
  });
}, { immediate: true, flush: "post" });
onBeforeUnmount(() => { sideObs?.disconnect(); sideFit?.(); });
const actsTo = computed(() => (sideShut.value ? "[data-daily-play] [data-tree-frame]" : "[data-daily-play] [data-tree-side]"));
/** 上の切り替えタブ (D-37g、11-09)。エミュは木のページを閉じた後にデイリーのページも閉じる。シミュ β・デイリーはタブが自分で移る (どれも離れる時の窓 D-36c を通る) */
function onTab(m: "hand" | "sim"): void { if (m === "hand") closeDailyPage(); }
/** 提出して終わった挑戦の一言 (今の記録は端末の控え = サーバーの返り) */
function submittedNote(): string {
  const r = tryOf.value?.last;
  if (!r) return tr("提出した挑戦。木は見るだけ。", "Submitted. You can view the tree.");
  return r.rate >= SOLVE_RATE ? tr(`提出した: 完成 1 個あたり ${r.cost} 神 (完成率 ${r.rate}%)。今日の挑戦は終わり、木は見るだけ。`, `Submitted: ${r.cost} div per finished item (${r.rate}% finished). Today's challenge is over; the tree is view-only.`) : tr(`提出した: 完成 0 で順位に載らない記録。今日の挑戦は終わり、木は見るだけ。`, `Submitted: nothing finished, so not ranked. Today's challenge is over; the tree is view-only.`);
}
const REFUSED: Record<StartError, () => string> = {
  closed: () => tr("今日のスタートは 14:50 で締めた。次のお題は 16:00。", "Today's start closed at 14:50. The next challenge opens at 16:00."),
  notToday: () => tr("このお題は今日の物ではないので挑戦できない。", "This isn't today's challenge, so it can't be taken."),
  nick: () => tr("ニックネームを決めてから一覧のスタートを押す。", "Choose a nickname, then press Start on the list."),
  net: () => tr("サーバーにつながらない。少し待って開き直す。", "Couldn't reach the server. Try again in a moment."),
};
</script>

<template>
  <div v-if="phone" data-daily-play data-daily-pc-only class="daily-note">
    <p>{{ tr("挑戦は幅の広い画面 (PC) で。始めた挑戦の時間は止まらない。", "Open on a wider screen (PC) to take the challenge. A started challenge keeps its clock running.") }}</p>
    <button type="button" class="g-btn sm mt-2" data-daily-leave @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
  </div>
  <div v-else data-daily-play :data-daily-heat="heat || undefined" :data-daily-tree="treeOn || undefined">
    <!-- 上の切り替えタブ (D-37g、11-09 オーナー「出るルートが一切ないよね」)。木の中のタブは隠したまま、ここに出す -->
    <ModeTabs class="daily-play-tabs mb-2" :active="null" @pick="onTab" />
    <header class="daily-band">
      <div class="daily-band-topic">
        <img v-if="art" :src="art" alt="" />
        <div class="daily-band-title"><small class="daily-band-what">{{ tryOf?.ended ? tr("今日のお題 (挑戦は終わり)", "Today's challenge (over)") : tr("今日のお題に挑戦中", "Today's challenge") }}</small><p class="daily-band-name" :title="tr(topic.baseJa, topic.base)">{{ tr(topic.baseJa, topic.base) }}</p></div>
        <!-- ボタン 4 つはお題の名前の右 (D-37i を 11-09 に替えた。右の欄を閉じても消えない、オーナー「諦めるもない」「MOD一覧が見切れてる」) -->
        <DailyPlayBar v-if="tryOf" :dev-give-up="dev === 'giveup'" :dev="!!dev" :tree="treeOn" :topic="topic" :id="topic.id" :base="topic.base" :ilvl="topic.ilvl" :aims="tryOf.aims" :fractured="tryOf.fractured" :ended="over" />
        <!-- サーバーの返りの前・断られた時も戻る口は残す (11-05 オーナー「一度続きからにはいったら戻るすべが１つもない」) -->
        <div v-else class="daily-band2" data-daily-band2>
          <div class="daily-band2-btns">
            <button type="button" class="g-btn sm" data-daily-leave @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
          </div>
        </div>
      </div>
      <div class="daily-time" data-daily-time><small>{{ tr("残り時間", "Time left") }}</small><b v-if="tryOf?.ended" data-daily-time-ended>{{ tr("終了", "Over") }}</b><b v-else role="timer" :aria-label="tr(`残り ${clock}`, `${clock} left`)">{{ clock }}</b></div>
      <div class="daily-band-score">
        <div><b data-daily-cost>{{ run && run.cost != null ? `${run.cost} ${tr("神", "div")}` : "—" }}</b><small>{{ tr("完成 1 個あたりの費用", "Cost per finished item") }}</small></div>
        <div><b data-daily-rate>{{ run ? `${run.rate}%` : "—" }}</b><small>{{ tr("完成率", "Finished") }}</small></div>
      </div>
      <div class="daily-fuse" :style="{ '--fuse': fuse }"><i /></div>
    </header>

    <p v-if="refused" data-daily-refused class="daily-note">{{ REFUSED[refused]() }}</p>
    <p v-else-if="over" data-daily-over class="daily-note">{{ tryOf?.submitted ? submittedNote() : tryOf?.ended ? tr("諦めた挑戦。木は見られるが、提出はできない。", "You gave up. You can still view the tree, but not submit.") : tr("時間切れ。木は見られるが、提出はできない。", "Time is up. You can still view the tree, but not submit.") }}</p>
    <p v-else-if="unmet.length" data-daily-unmet class="daily-note">{{ tr(`「完成」の箱のうち ${unmet.length} つがお題の狙いを全部は持っていない。デイリーでは狙いを全部満たした箱だけを完成にでき、このままでは提出できない。`, `${unmet.length} finished box(es) don't have every target. In the daily challenge only boxes with all targets count as finished, so you can't submit yet.`) }}</p>

    <DailySubmitAsk v-if="asking" :id="topic.id" :open="!!asking" :cost="asking.cost" :rate="asking.rate" :shown="doneShown" :dev="!!dev" @close="asking = null" @done="submitted" />
    <p v-if="devNoAims" class="daily-note">{{ tr("開発の見本: このお題の狙いが見えない (締めた日のお題か、この端末で始めたお題の id を q に)。", "Dev sample: this topic's targets aren't visible (use a closed day's id or one you started here).") }}</p>
    <DailyFracPick v-if="picking" :base="topic.base" :ilvl="topic.ilvl" :aims="tryOf!.aims" :initial-from="dev === 'frac' ? 'fractured' : undefined" :four-only="fourOnlyHere(topic.id)" @pick="pick" />
    <SimTreePage v-else-if="treeOn" />
    <p v-else-if="!refused" class="daily-note">{{ tr("読み込み中", "Loading") }}</p>
    <!-- 提出 (主) と諦める (控えめ) は完成形のカードの下。右の欄を閉じた時は木の枠の右上の「完成形」の下 (D-37m) -->
    <Teleport v-if="treeOn && !picking" defer :to="actsTo">
      <div class="daily-acts" data-daily-acts :data-daily-acts-shut="sideShut || undefined">
        <button type="button" class="g-btn-red" data-daily-submit :disabled="!run || over || !!unmet.length" :title="over ? tr('時間切れ', 'Time is up') : unmet.length ? tr('狙いを満たさない完成の箱がある', 'A finished box misses a target') : !run ? tr('100 人回すと提出できる', 'Run 100 crafters to submit') : ''" @click="submit">{{ tr("これで提出", "Submit this") }}</button>
        <button v-if="!over" type="button" class="daily-acts-giveup" data-daily-giveup @click="giving = true">{{ tr("諦める", "Give up") }}</button>
      </div>
    </Teleport>
    <!-- スタートからやり直す (D-37j、11-10): 木のスタートの箱の下。シミュの部品は触らず、スタートの箱 (下の段を持つ箱) の末尾へ差し込む -->
    <Teleport v-if="startBox && treeOn && !picking && !over" :to="startBox">
      <button type="button" class="g-btn sm nodrag mt-1.5 w-full" data-daily-restart @click.stop="restarting = true">{{ tr("スタートからやり直す", "Start over") }}</button>
    </Teleport>
    <DailyRestartAsk :open="restarting" @close="restarting = false" @yes="restart" />
    <DailyGiveUpAsk :id="topic.id" :open="giving" :dev="!!dev" @close="giving = false" @done="giving = false; goDaily({ view: 'list' })" />
  </div>
</template>

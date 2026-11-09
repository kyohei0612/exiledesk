<!--
  DailyPlay.vue — 挑戦のページ (D-30〜D-36)。お題を開いて 1 時間。順番: 始め方とフラクチャー予定の MOD を選ぶ (D-37j) → シミュの木 → 100 人回す → 提出。
  木は SimTreePage をそのまま中に置き、上の帯だけここの物 (D-31)。外す部品は daily-skin.css が隠す (D-90。シミュ部長の切り出しまでの形、D-41)。
  木はこのブラウザに覚え、開き直すと戻る。時間はスタートからの実際の時計で、ページを閉じても進む (D-32)。挑戦は 1 日 1 回で始め直せない (D-33)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { craftStage as s } from "../../state/craft-stage";
import { treeStep } from "../../web/page";
import { goDaily } from "./daily-open";
import { usePhone } from "../../utils/use-phone";
import SimTreePage from "../simulator/tree/SimTreePage.vue";
import { useTree } from "../simulator/tree/use-tree";
import { recipeCardOf } from "../simulator/recipe-card";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import type { StartFrom, TreeDoc } from "../../services/simulator/tree/tree-model";
import { fillTopicDoc } from "./daily-aims";
import { unmetDone } from "./daily-cost";
import DailyPlayBar from "./DailyPlayBar.vue";
import DailyFracPick from "./DailyFracPick.vue";
import "./daily-play.css";
import { getTry, leftMs, SOLVE_RATE, startTry, submitTry, TIME_LIMIT_MS, updateTry, type DailyTopic, type DailyTry, type StartError } from "./daily-api";

const props = defineProps<{ topic: DailyTopic }>();
const t = useTree();
/** サーバーの返りが来るまでは null (端末の写しを先に出すと古い時刻が見える) */
const tryOf = ref<DailyTry | null>(null);
const treeOn = ref(false);
const sent = ref<{ rate: number; cost: number; solved: boolean } | null>(null);
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
  starting = true;
  const r = await startTry(props.topic.id);
  starting = false;
  if (typeof r === "string") { refused.value = r; return; }
  tryOf.value = r;
  if (r.fractured && !treeOn.value) openTree();
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
}
function pick(modId: string, from: StartFrom): void {
  updateTry(props.topic.id, { fractured: modId, from });
  tryOf.value = getTry(props.topic.id);
  openTree();
}

// 前提は変えられない (D-34): 完成形・始まりの窓を開かせず、1 つ戻すで白紙へ抜けた時は戻す
watch(() => t.goalPage.value, (p) => { if (treeOn.value && p) t.goalPage.value = 0; });
watch(() => t.startPage.value, (p) => { if (treeOn.value && p) t.startPage.value = false; });
let saveT = 0;
watch(() => t.doc.value, (d) => {
  if (!treeOn.value) return;
  if (d.base !== props.topic.base || !d.memoAims?.length) { openTree(); return; }
  clearTimeout(saveT);
  saveT = window.setTimeout(() => updateTry(props.topic.id, { tree: JSON.stringify(toRecipeV1(d)) }), 500);
});
// 別の場所の木を持ち込まない (D-36): 貼り付けは入力欄の外では届かせない
const noPaste = (e: ClipboardEvent): void => { if (!(e.target as HTMLElement | null)?.closest?.("input, textarea")) e.stopPropagation(); };
window.addEventListener("paste", noPaste, true);
onBeforeUnmount(() => { clearInterval(tick); clearTimeout(saveT); window.removeEventListener("paste", noPaste, true); });

/** 今の木の 100 人の結果 (recipe-card の控え。組み替えると消える) */
const run = computed(() => { if (!treeOn.value) return null; const c = recipeCardOf(t.doc.value); return c.n === 100 && c.p != null && c.c != null ? { rate: c.p, cost: c.c } : null; });
/** お題の狙いを満たさない完成の箱 (D-35b)。あれば提出できない (シミュでは完成は人が決めるが、デイリーの解決は狙いを満たした品だけ) */
const unmet = computed(() => (treeOn.value && s.data.value && tryOf.value ? unmetDone(s.data.value, t.doc.value, tryOf.value.aims) : []));
const sendFail = ref(false);
async function submit(): Promise<void> {
  const r = run.value;
  if (!r || over.value || unmet.value.length) return;
  const a = await submitTry(props.topic.id, r.cost, r.rate);
  sendFail.value = !a.ok;
  if (!a.ok) return;
  tryOf.value = getTry(props.topic.id);
  sent.value = { ...r, solved: r.rate >= SOLVE_RATE };
}
const best = computed(() => tryOf.value?.best ?? null);
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
    <header class="daily-band">
      <div class="daily-band-topic">
        <img v-if="art" :src="art" alt="" />
        <div class="min-w-0"><small class="daily-band-what">{{ tr("今日のお題に挑戦中", "Today's challenge") }}</small><p class="daily-band-name">{{ tr(topic.baseJa, topic.base) }}</p></div>
      </div>
      <div class="daily-time" data-daily-time><small>{{ tr("残り時間", "Time left") }}</small><b role="timer" :aria-label="tr(`残り ${clock}`, `${clock} left`)">{{ clock }}</b></div>
      <div class="daily-band-score">
        <div><b data-daily-cost>{{ run ? `${run.cost} ${tr("神", "div")}` : "—" }}</b><small>{{ tr("1 個の費用", "Cost per item") }}</small></div>
        <div><b data-daily-rate>{{ run ? `${run.rate}%` : "—" }}</b><small>{{ tr(`完成率 (${SOLVE_RATE}% で解決)`, `Finished (${SOLVE_RATE}% solves)`) }}</small></div>
        <button type="button" class="g-btn-red" data-daily-submit :disabled="!run || over || !!unmet.length" :title="over ? tr('時間切れ', 'Time is up') : unmet.length ? tr('狙いを満たさない完成の箱がある', 'A finished box misses a target') : !run ? tr('100 人回すと提出できる', 'Run 100 crafters to submit') : ''" @click="submit">{{ tr("これで提出", "Submit this") }}</button>
      </div>
      <div class="daily-fuse" :style="{ '--fuse': fuse }"><i /></div>
    </header>
    <!-- 木を開いた後は下の段を右の完成形のカードの下へ、狙いの行は出さない (D-37i)。シミュの右の列へ差し込むだけ -->
    <Teleport v-if="tryOf && treeOn" defer to="[data-tree-side]"><DailyPlayBar side :id="topic.id" :base="topic.base" :ilvl="topic.ilvl" :aims="tryOf.aims" :fractured="tryOf.fractured" :ended="!!tryOf.ended" /></Teleport>
    <DailyPlayBar v-else-if="tryOf" :id="topic.id" :base="topic.base" :ilvl="topic.ilvl" :aims="tryOf.aims" :fractured="tryOf.fractured" :ended="!!tryOf.ended" />
    <!-- サーバーの返りの前・断られた時も戻る口は残す (11-05 オーナー「一度続きからにはいったら戻るすべが１つもない」) -->
    <div v-else class="daily-band2" data-daily-band2>
      <div class="daily-band2-btns ml-auto">
        <button type="button" class="g-btn sm" data-daily-leave @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
      </div>
    </div>

    <p v-if="refused" data-daily-refused class="daily-note">{{ REFUSED[refused]() }}</p>
    <p v-else-if="over" data-daily-over class="daily-note">{{ tryOf?.ended ? tr("諦めた挑戦。木は見られるが、提出はできない。", "You gave up. You can still view the tree, but not submit.") : tr("時間切れ。木は見られるが、提出はできない。", "Time is up. You can still view the tree, but not submit.") }}</p>
    <p v-else-if="unmet.length" data-daily-unmet class="daily-note">{{ tr(`「完成」の箱のうち ${unmet.length} つがお題の狙いを全部は持っていない。デイリーでは狙いを全部満たした箱だけを完成にでき、このままでは提出できない。`, `${unmet.length} finished box(es) don't have every target. In the daily challenge only boxes with all targets count as finished, so you can't submit yet.`) }}</p>
    <p v-else-if="sendFail" data-daily-send-fail class="daily-note">{{ tr("提出が届かなかった。もう一度「これで提出」を押す。", "The submission didn't go through. Press Submit again.") }}</p>
    <p v-else-if="sent" data-daily-sent class="daily-note">
      {{ sent.solved ? tr(`提出した: ${sent.cost} 神 (完成率 ${sent.rate}%)。解決。時間内ならもっと安くできる。`, `Submitted: ${sent.cost} div (${sent.rate}% finished). Solved. You can still go cheaper in time.`) : tr(`提出した: 完成率 ${sent.rate}% で未解決。${SOLVE_RATE}% まで上げる。`, `Submitted: ${sent.rate}% finished, unsolved. Reach ${SOLVE_RATE}%.`) }}
      <span v-if="best">{{ tr(`今の記録 ${best.cost} 神`, `Best ${best.cost} div`) }}</span>
    </p>

    <DailyFracPick v-if="picking" :base="topic.base" :ilvl="topic.ilvl" :aims="tryOf!.aims" @pick="pick" />
    <SimTreePage v-else-if="treeOn" />
    <p v-else-if="!refused" class="daily-note">{{ tr("読み込み中", "Loading") }}</p>
  </div>
</template>

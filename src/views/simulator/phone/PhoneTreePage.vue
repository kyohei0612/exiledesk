<!--
  PhoneTreePage.vue — シミュのスマホ版のツリーのページ (768px 未満、スイッチ simPhone。2026-10-25 オーナー「その間スマホ版つくるか」、案 sim28-phone-quiz-mock)。
  木は描かず質問で進める (use-phone-quiz): ① 何を打つ? → ② 結果ごとにどうする? → 残りの道 → 全部決まったら完成。木は PC と同じ TreeDoc (use-tree) なので PC と行き来できる。
  ベース選び・完成の MOD は PC と同じ TreeGoalPage (TreeOverlays、スマホはページで縦積み)、棚は PC と同じ TreeHandPage。
  木の外の動き (白紙ならベース選びへ・離れる時の確かめ・段の URL) は SimTreePage の script がそのまま受け持つ (スマホでも動いている)
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import TreeRunReport from "../tree/TreeRunReport.vue";
import { RUN_N, useTreeRun } from "../tree/use-tree-run";
import { craftStage as s } from "../../../state/craft-stage";
import ModeTabs from "../../../components/for-share/ModeTabs.vue";
import TreeOverlays from "../tree/TreeOverlays.vue";
import TreeHandPage from "../tree/TreeHandPage.vue";
import TreePanelPage from "../tree/TreePanelPage.vue";
import TreeRecipeBar from "../tree/TreeRecipeBar.vue";
import { applyPick, type OnlyOut } from "../tree/tree-hand-plan";
import { useTree } from "../tree/use-tree";
import { clearHand, setAim, type Aim, type Hand, type HandKind } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { isMiss, outStep, phoneRun, sheet, testedKey, usePhoneQuiz, type Question } from "./use-phone-quiz";
import { routeKeyOf } from "../tree/use-tree-check";
import { stepOf } from "../tree/tree-fail";
import PhoneAsk from "./PhoneAsk.vue";
import PhoneOverview from "./PhoneOverview.vue";
import PhoneBoxSheet from "./PhoneBoxSheet.vue";
import PhoneIssues from "./PhoneIssues.vue";
import { flag } from "../../../web/release-flags";
import { simAct, simOp } from "../../../web/track";
import PhoneMemo from "./PhoneMemo.vue";
import { setMapFold } from "./map-fold";
import { setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { quickSave, unsaved } from "../tree/tree-save";
import { askLeave } from "../../../web/page";
import { useArmed } from "../../../utils/use-armed";

const t = useTree();
/** 下の全体図と箱の重ね窓 (スイッチ phoneMap、10-26 オーナーの選んだ案 B。OK 待ちの間は本番は前の形) */
const MAP = flag("phoneMap");
/** 10-27 昼の直し 6 件 (スイッチ phone1027): 段送りは下の帯へ (上は消す)・↶ 戻すを外す */
const P27 = flag("phone1027");
/** 当たりはその場で次の手 (同じ予約の 3、結果の画面の作りが決まるまで保留。スイッチ phoneResult1027) */
const RES27 = flag("phoneResult1027");
const q = usePhoneQuiz();
/** 棚を開いている箱 / 当たりの MOD を選んでいる箱 */
const handFor = ref<string | null>(null);
const aimFor = ref<string | null>(null);
/**
 * 見た段の行き来 (10-26 夜オーナー「全体を見るは要らない。1 つ前の手へ戻れて、また進めるボタンに」)。見た所を順に覚え、‹ で 1 つ前、› で戻した所から先へ。
 * 「全体を見る」の残りの道の一覧 (PhoneRoutes) はやめた (全体図で見られる)
 */
const trail = ref<Question[]>([]);
const trailAt = ref(-1);
let walking = false;
const qKey = (x: Question | null): string => (x ? `${x.kind}:${x.id}` : "");
watch(() => qKey(q.current.value), () => {
  outStep.value = 0; // 結果は 1 枚目から
  const c = q.current.value;
  if (!c || walking) { walking = false; return; }
  if (qKey(trail.value[trailAt.value] ?? null) === qKey(c)) return;
  trail.value = [...trail.value.slice(0, trailAt.value + 1), c];
  trailAt.value = trail.value.length - 1;
}, { immediate: true });
function setOutStep(n: number): void { outStep.value = n; }
function walk(by: number): void {
  const to = trailAt.value + by, x = trail.value[to];
  if (!x || !t.doc.value.boxes[x.id]) return;
  trailAt.value = to; walking = true;
  q.focus.value = x;
}
/** 今の段と全部の段 (PC の画面の段 stepOf と同じ数え方) */
const stepNow = computed(() => { const c = q.current.value; if (!c) return null; const ids = c.kind === "outs" ? q.outsOf(c.id) : [c.id]; return ids.length ? stepOf(t.doc.value, ids[0]!) : null; });
const stepAll = computed(() => Math.max(1, ...Object.keys(t.doc.value.boxes).map((id) => stepOf(t.doc.value, id))));
/** ツリーのメモを書いている (PhoneMemo) */
const memoEdit = ref(false);
/** 上の帯の平たいボタン (PC の操作の列 TreeTopTools と同じ形: 枠の絵なし・絵 + 短い名前。押す所は 40px、10-26 夜オーナー「上の帯が太い」) */
const FLAT = "flex h-10 min-w-10 shrink-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-md bg-white/[0.04] px-1.5 text-[12px] text-[#d8ccb4] hover:bg-white/10 hover:text-white aria-pressed:bg-amber-400/20 aria-pressed:text-amber-100";
/** 白紙に戻す = PC と同じ (SimTreePage の onClear): スタートと完成形を残して下を消す。作りかけは 3 択、保存済みは 2 回押し */
const clearArm = useArmed();
function onClear(): void {
  const go = (): void => { simOp("clear"); t.reset(); setCurrentTreeRecipe(null); q.reset(); window.scrollTo(0, 0); };
  if (unsaved(t.doc.value)) askLeave(go, () => void quickSave()); else if (clearArm.arm()) go();
}

/** 棚で手を決めた = PC の pickHand と同じ組み替え (tree-hand-plan の applyPick)。続けてその手の結果 (②) を出す */
function pickHand(h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): void {
  const id = handFor.value!;
  simAct("hand", kind);
  /*
   * 外れの箱で、打つ前の箱と同じ手 (例 外れ MOD が付いた後のカオス) を選んだ = 打つ前の箱へ戻るのと同じ (別の箱を作らない)。
   * 10-27 オーナー「カオスオーブ選択で同じ処理扱い、2 段目へ戻るってのと同義としてカウント。ハズレでかつ同じ MOD 群で 1 段上に進むことはない」
   */
  const b = t.doc.value.boxes[id], par = b?.parent ? t.doc.value.boxes[b.parent] : null;
  if (b && par?.hand && isMiss(b) && !b.hand && sameHand(h, par.hand)) {
    handFor.value = null;
    q.setReturn(id, par.id);
    q.focus.value = { kind: "outs", id: par.id };
    return;
  }
  let at = id;
  q.answer((d) => { at = applyPick(d, id, h, kind, aims, pre, only); });
  handFor.value = null;
  q.focus.value = { kind: "outs", id: at };
}
/** 同じ手か (カレンシーとお告げ。狙いの選び方は問わない) */
const sameHand = (x: Hand, y: Hand): boolean => x.currency === y.currency && [...x.omens].sort().join() === [...y.omens].sort().join();
function clearHandOf(): void {
  const id = handFor.value!;
  q.answer((d) => clearHand(d, id));
  handFor.value = null;
  q.focus.value = { kind: "hand", id };
}
/** 棚の「↩ 既にある箱へ戻す」= ② のその結果の行で選ぶ (親の手の結果へ。始まりは戻れない) */
function backOf(): void {
  const id = handFor.value!, p = t.doc.value.boxes[id]?.parent;
  handFor.value = null;
  if (!p) return;
  q.unLater(id);
  q.focus.value = { kind: "outs", id: p };
}
function pickAim(a: Aim): void { const id = aimFor.value!; t.edit((d) => setAim(d, id, a)); aimFor.value = null; }
const total = computed(() => q.questions.value.length);
// 完成形の設定へ行く時に送った位置を覚え、戻ったらそこへ (ページの移り変わりで一番上に戻されるので、描き終えてから戻す)
let keptY = 0;
watch(() => t.goalInline.value, async (on) => {
  if (on) { keptY = window.scrollY; return; }
  await nextTick();
  requestAnimationFrame(() => window.scrollTo(0, keptY));
});

// 100 人回す (PC の SimTreePage と同じ use-tree-run。止まった箱・まとめの箱を押すと、その箱の質問へ)
const run = useTreeRun(t.doc, t.startPrice, t.treePrice, () => {}, () => {});
watch(() => run.walk.value, (w) => { if (w) run.skipWalk(); });
// 結果の行・重ね窓が読む (来た人・止まりの理由、tree-fail の runText)
watch(() => run.result.value, (r) => { phoneRun.value = r ?? null; }, { immediate: true });
const reportOpen = ref(false);
watch(() => !!run.result.value && !run.running.value && !run.halted.value, (on) => { reportOpen.value = on; });
/** 止まった理由 (tree-run の stuckWhy: エンジンの断りの文と、そこへ戻ってきた箱) */
const haltWhy = computed(() => { const h = run.halted.value; return h ? run.result.value?.stuckWhy?.[h.box] ?? null : null; });
const donePct = computed(() => Math.round(((run.result.value?.finished ?? 0) / (run.result.value?.n || 1)) * 100));
const fmt = (x: number): string => (!Number.isFinite(x) ? "—" : x >= 100 ? x.toFixed(0) : x.toFixed(1));
/** 下の帯の主な操作 (今の質問ごと。一覧を出している間は無し) */
const main = computed((): { kind: string; text: string; off?: boolean; go: () => void } | null => {
  const c = q.current.value, b = c ? t.doc.value.boxes[c.id] : null;
  // 一番最初 (始まりの箱) は「始める」(10-26 夜オーナー「スマホの最初の質問『打つ手を選ぶ』は嫌、一番最初は始めるでいい」)。押すと同じく棚
  if (c && b && c.kind === "hand" && !b.hand) return { kind: "hand", text: b.out === "start" ? tr("始める", "Start") : tr("打つ手を選ぶ", "Choose a craft"), go: () => { handFor.value = c.id; } };
  // 手のある箱 (ここで打った手を見ている所) も下は「次へ」= その手の結果へ (10-27 オーナー「画面の下はいつもどおりの次へのまま、UI の統一感」)
  if (c && b && c.kind === "hand" && b.hand) return { kind: "next", text: tr("次へ", "Next"), go: () => { q.focus.value = { kind: "outs", id: c.id }; window.scrollTo(0, 0); } };
  if (c && c.kind === "outs") {
    // 結果は 1 つずつ 1 画面 (10-26 夜オーナー「スマホだとレベルが高すぎる」)。「次へ」= 今の結果を既定の答えで決めて次の結果へ、最後で次の段へ
    const outs = q.outsOf(c.id), k = Math.min(outStep.value, Math.max(0, outs.length - 1));
    // 当たりはその場で次の手を選ぶ (10-27 昼オーナー「当たりの結果なのに次の手を選ぶ (既定) + 次へ になっている」)。完成・次の手の付いた当たりは今まで通り「次へ」
    const o = outs[k], ob = o ? t.doc.value.boxes[o] : null;
    if (RES27 && o && ob?.out === "hit" && ["open", "later"].includes(q.stateOf(o))) return { kind: "hand", text: tr("打つ手を選ぶ", "Choose a craft"), go: () => { handFor.value = o; } };
    if (k < outs.length - 1) return { kind: "decide", text: tr(`次へ (${k + 1} / ${outs.length})`, `Next (${k + 1} / ${outs.length})`), go: () => { q.decideOne(outs[k]!); outStep.value = k + 1; window.scrollTo(0, 0); } };
    return { kind: "decide", text: outs.length > 1 ? tr(`次へ (${outs.length} / ${outs.length})`, `Next (${outs.length} / ${outs.length})`) : tr("次へ", "Next"), go: () => q.decide(c.id) };
  }
  if (c) return null;
  // 全部の道が決まった = 100 人回す (PC と同じ use-tree-run。1 人目が木を進む再生は木が無いので飛ばす)
  return { kind: "run", text: run.running.value ? tr(`回している ${run.result.value?.n ?? 0} / ${RUN_N}`, `Running ${run.result.value?.n ?? 0} / ${RUN_N}`) : tr(`${RUN_N} 人回す`, `Run ${RUN_N}`), off: !s.data.value || run.running.value, go: () => void run.run() };
});
/** 箱の質問へ (手のある箱は ②、無ければ親の ②) */
function goBox(id: string): void {
  const b = t.doc.value.boxes[id];
  if (!b) return;
  q.focus.value = b.hand ? { kind: "outs", id } : b.parent ? { kind: "outs", id: b.parent } : { kind: "hand", id };
}
</script>

<template>
  <div data-phone-tree class="flex min-w-0 flex-col gap-3">
    <ModeTabs />
    <TreeOverlays />
    <!-- 完成形の設定 (ベース・MOD の表) を見に行く間は外さず隠すだけ (戻ると前の質問・開いていた欄・送った位置のまま。10-26 オーナー「見ようと思ったらリセットされてしまうのいやだね」、メモ feedback-basic-flow「閉じたら前の位置」) -->
    <div v-show="!t.goalInline.value" data-phone-tree-body class="flex min-w-0 flex-col gap-3">
      <!-- レシピ (保存・開く・共有 URL。PC の帯と同じ部品、木が同じなので PC で開き直せる) -->
      <!-- レシピの帯の中身とメモ・白紙を 1 つの並びで折り返す (帯の枠を contents にして、レシピ ▾ の行に並べる。落ちる窓はこの行が基準) -->
      <div data-phone-recipe class="relative flex min-w-0 flex-wrap items-center justify-center gap-1 text-[13px]">
        <TreeRecipeBar class="!contents" :flat="FLAT" @opened="q.reset()">
          <template #after>
        <button type="button" data-phone-memo-open :class="FLAT" :aria-pressed="memoEdit" @click="memoEdit = !memoEdit"><Icon name="pencil" class="size-4" />{{ tr("メモ", "Note") }}</button>
        <button type="button" data-phone-clear :class="[FLAT, clearArm.is() ? '!bg-rose-700 !text-white' : '']" @click="onClear"><Icon name="trash" class="size-4" />{{ clearArm.is() ? tr("もう一度押すと白紙に戻す", "Tap again to clear") : tr("白紙", "Clear") }}</button>
          </template>
        </TreeRecipeBar>
      </div>
      <!-- ツリーのメモ (文だけ、書いてあれば全文) -->
      <PhoneMemo v-model:editing="memoEdit" />
      <!-- 進み = 今の段 / 全部の段・未定の道の数と、見た段の行き来 (‹ 1 つ前・先へ ›。ツリーとして見せる、10-26 夜オーナー「質問と思わせない」) -->
      <div v-if="!P27" data-phone-progress class="-my-1 flex items-center gap-2 text-[12px] text-[#d8ccb4]">
        <button type="button" data-phone-walk-back :class="FLAT" :disabled="trailAt <= 0" @click="walk(-1)">‹ {{ tr("1 つ前", "Back") }}</button>
        <span class="min-w-0 flex-1 break-words text-center">
          <b v-if="stepNow" class="text-[14px] text-amber-200">{{ tr(`${stepNow} 段目`, `Step ${stepNow}`) }}</b><span class="opacity-70"> / {{ tr(`全 ${stepAll} 段`, `${stepAll} steps`) }}</span>
          <span v-if="total && testedKey === routeKeyOf(t.doc.value)" class="opacity-70"> · {{ tr(`未定 ${total}`, `${total} open`) }}</span>
        </span>
        <button type="button" data-phone-walk-fwd :class="FLAT" :disabled="trailAt >= trail.length - 1" @click="walk(1)">{{ tr("先へ", "Forward") }} ›</button>
      </div>
      <!-- 「残りの道を全部決めると、下の帯で 100 人回せる」の説明はスマホでは出さない (10-26 夜オーナー「上の帯が太い」。前はモンキー 7 の 7 で足した) -->
      <!-- 足りない所 (PC と同じ精査、自動で回る。10-26 案 2) -->
      <PhoneIssues />
      <PhoneAsk v-if="q.current.value" :key="`${q.current.value.kind}-${q.current.value.id}`" :q="q.current.value" :step="outStep" @hand="(id) => (handFor = id)" @step="setOutStep" />
      <!-- 全部の道が決まった (残りの道 0) -->
      <template v-else>
        <div data-phone-all-done class="rounded-xl border border-emerald-400/50 bg-[#13190f] px-3 py-4 text-center">
          <p class="text-[15px] font-bold text-emerald-300">{{ tr("全部の道が決まりました", "Every path is decided") }}</p>
          <p class="mt-1 text-[12px] text-[#9a8a70]">{{ tr("狙いが全部そろう道は自動で完成 (答え直せる)", "Paths with every target are marked done automatically (you can change them)") }}</p>
        </div>
        <button v-if="run.result.value && !run.running.value" type="button" data-phone-run-sum class="rounded-xl border border-amber-300/50 bg-[#1a140d] px-3 py-3 text-left" @click="reportOpen = true">
          <span class="text-[26px] font-bold tabular-nums text-amber-100">{{ fmt(run.result.value.perItem) }}</span><small class="ml-1 text-[13px] text-[#d8ccb4]">{{ tr("神 / 1 個", "div / item") }}</small>
          <span class="float-right mt-2 text-[13px]" :class="donePct < 100 ? 'text-rose-300' : 'text-emerald-300'">{{ tr(`完成 ${donePct}%`, `${donePct}% done`) }}</span>
          <span class="block text-[12px] text-amber-200/80">{{ tr("結果のまとめ ›", "Summary ›") }}</span>
        </button>
        <button v-if="run.halted.value" type="button" data-phone-run-halt class="rounded-xl border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-left text-[13px] text-rose-100" @click="goBox(haltWhy?.backs?.[0] ?? run.halted.value.box)">
          {{ tr(`途中で止まった人がいる: ${q.boxTitle(run.halted.value.box)} ›`, `Some runs got stuck: ${q.boxTitle(run.halted.value.box)} ›`) }}
          <span v-if="haltWhy?.reason" class="block text-[12px] text-rose-200/80">{{ haltWhy.reason }}{{ haltWhy.backs?.length ? tr(` (戻ってきた箱: ${q.boxTitle(haltWhy.backs[0]!)})`, ` (came back from: ${q.boxTitle(haltWhy.backs[0]!)})`) : "" }}</span>
        </button>
      </template>
      <!-- 下の帯 (親指の届く所): 1 つ戻す・今の質問の主な操作 (① 打つ手を選ぶ / ② 決めた / 全部決まったら 100 人回す)・やり直し -->
      <!-- 上にツリーの全体図 (常に出す。今の箱が光る・押すとその箱へ・② の「ほかの箱へ」は図で戻り先を選ぶ。10-26 オーナー) -->
      <div data-phone-bar class="sticky bottom-0 z-10 -mx-2 flex flex-col gap-1.5 border-t border-white/10 bg-[#0c0a08] px-2 py-1.5">
        <!-- 完成形と全体図は重ね窓 (PhoneOverview、10-26 夜オーナー「完成図は表に出さない」)。ここは開く 1 行だけ (全幅) -->
        <button v-if="MAP" type="button" data-phone-map-unfold class="flex h-8 w-full items-center gap-2 rounded-md border border-white/10 bg-[#080706] px-3 text-left text-[12px] text-[#d8ccb4]" @click="setMapFold(false)">
          <span class="min-w-0 flex-1 break-words">{{ tr(`完成形と全体図 (箱 ${Object.keys(t.doc.value.boxes).length})`, `Final item & overview (${Object.keys(t.doc.value.boxes).length} boxes)`) }}</span><span class="shrink-0">{{ tr("開く ▴", "Open ▴") }}</span>
        </button>
        <!-- 段送り (10-27 昼オーナー「上の段送りを下の帯に、上は消す」。↶ 戻す・↷ は外した = 「↶ 戻すは要らない」) -->
        <div v-if="P27" data-phone-progress class="flex items-center gap-2 text-[12px] text-[#d8ccb4]">
          <button type="button" data-phone-walk-back :class="FLAT" :disabled="trailAt <= 0" @click="walk(-1)">‹ {{ tr("1 つ前", "Back") }}</button>
          <span class="min-w-0 flex-1 break-words text-center">
            <b v-if="stepNow" class="text-[14px] text-amber-200">{{ tr(`${stepNow} 段目`, `Step ${stepNow}`) }}</b><span class="opacity-70"> / {{ tr(`全 ${stepAll} 段`, `${stepAll} steps`) }}</span>
            <span v-if="total && testedKey === routeKeyOf(t.doc.value)" class="opacity-70"> · {{ tr(`未定 ${total}`, `${total} open`) }}</span>
          </span>
          <button type="button" data-phone-walk-fwd :class="FLAT" :disabled="trailAt >= trail.length - 1" @click="walk(1)">{{ tr("先へ", "Forward") }} ›</button>
        </div>
        <div v-if="P27" class="flex">
          <button v-if="main" type="button" data-phone-main :data-main="main.kind" class="g-btn-red !min-h-11 min-w-0 flex-1 whitespace-normal break-words px-2 text-[15px] leading-tight" :disabled="main.off" @click="main.go">{{ main.text }}</button>
        </div>
        <div v-else class="flex gap-2">
        <button type="button" data-phone-undo class="g-btn !min-h-11 shrink-0 px-3" :disabled="!t.canUndo.value" :title="tr('1 つ戻す', 'Undo')" @click="t.undo">↶<span class="ml-1 text-[12px]">{{ tr("戻す", "Undo") }}</span></button>
        <button v-if="main" type="button" data-phone-main :data-main="main.kind" class="g-btn-red !min-h-11 min-w-0 flex-1 whitespace-normal break-words px-2 text-[15px] leading-tight" :disabled="main.off" @click="main.go">{{ main.text }}</button>
        <span v-else class="flex-1" />
        <button type="button" data-phone-redo class="g-btn !min-h-11 shrink-0 px-3" :disabled="!t.canRedo.value" :aria-label="tr('やり直し', 'Redo')" @click="t.redo">↷</button>
        </div>
      </div>
    </div>
    <TreeHandPage v-if="handFor && t.doc.value.boxes[handFor]" :key="`h-${handFor}`" :box-id="handFor" :current="t.doc.value.boxes[handFor]!.hand" @pick="pickHand" @clear="clearHandOf" @close="handFor = null" @back="backOf" @aim="aimFor = handFor; handFor = null" />
    <!-- 結果のまとめ (PC と同じ部品。スマホは下から出る形 = TreeRunReport の max-md の置き方) -->
    <div v-if="reportOpen && run.result.value && !run.running.value" data-phone-report class="fixed inset-0 z-50 bg-black/50" @click.self="reportOpen = false">
      <TreeRunReport :result="run.result.value" @close="reportOpen = false" @go="(id) => { reportOpen = false; goBox(id); }" />
    </div>
    <!-- 箱の重ね窓 (全体図・一覧・戻り先選びで押した箱。移らずに中身を全部、10-26 案 B) -->
    <!-- 完成形と全体図 (下の帯の 1 行で開く・戻り先を選ぶ間はいつも) -->
    <PhoneOverview v-if="MAP" />
    <PhoneBoxSheet v-if="MAP && sheet" />
    <TreePanelPage v-if="aimFor && t.doc.value.boxes[aimFor]" :key="`a-${aimFor}`" kind="aim" :box-id="aimFor" :current="t.doc.value.boxes[aimFor]!.aim" @pick="pickAim" @close="aimFor = null" />
  </div>
</template>

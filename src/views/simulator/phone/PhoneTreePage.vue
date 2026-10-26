<!--
  PhoneTreePage.vue — シミュのスマホ版のツリーのページ (768px 未満、スイッチ simPhone。2026-10-25 オーナー「その間スマホ版つくるか」、案 sim28-phone-quiz-mock)。
  木は描かず質問で進める (use-phone-quiz): ① 何を打つ? → ② 結果ごとにどうする? → 残りの道 → 全部決まったら完成。木は PC と同じ TreeDoc (use-tree) なので PC と行き来できる。
  ベース選び・完成の MOD は PC と同じ TreeGoalPage (TreeOverlays、スマホはページで縦積み)、棚は PC と同じ TreeHandPage。
  木の外の動き (白紙ならベース選びへ・離れる時の確かめ・段の URL) は SimTreePage の script がそのまま受け持つ (スマホでも動いている)
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import TreeRunReport from "../tree/TreeRunReport.vue";
import { RUN_N, useTreeRun } from "../tree/use-tree-run";
import { craftStage as s } from "../../../state/craft-stage";
import ModeTabs from "../../../components/for-share/ModeTabs.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import TreeOverlays from "../tree/TreeOverlays.vue";
import TreeHandPage from "../tree/TreeHandPage.vue";
import TreePanelPage from "../tree/TreePanelPage.vue";
import TreeRecipeBar from "../tree/TreeRecipeBar.vue";
import { applyPick, type OnlyOut } from "../tree/tree-hand-plan";
import { useTree } from "../tree/use-tree";
import { clearHand, setAim, type Aim, type Hand, type HandKind } from "../../../services/simulator/tree/tree-model";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { phoneRun, sheet, usePhoneQuiz } from "./use-phone-quiz";
import PhoneAsk from "./PhoneAsk.vue";
import PhoneRoutes from "./PhoneRoutes.vue";
import PhoneMap from "./PhoneMap.vue";
import PhoneBoxSheet from "./PhoneBoxSheet.vue";
import PhoneIssues from "./PhoneIssues.vue";
import { flag } from "../../../web/release-flags";
import { simAct, simOp } from "../../../web/track";
import PhoneMemo from "./PhoneMemo.vue";
import { mapFolded, setMapFold } from "./map-fold";
import { setCurrentTreeRecipe } from "../../../state/simulator/tree-recipes";
import { quickSave, unsaved } from "../tree/tree-save";
import { askLeave } from "../../../web/page";
import { useArmed } from "../../../utils/use-armed";

const t = useTree();
/** 下の全体図と箱の重ね窓 (スイッチ phoneMap、10-26 オーナーの選んだ案 B。OK 待ちの間は本番は前の形) */
const MAP = flag("phoneMap");
const q = usePhoneQuiz();
/** 棚を開いている箱 / 当たりの MOD を選んでいる箱 */
const handFor = ref<string | null>(null);
const aimFor = ref<string | null>(null);
/** 残りの道の一覧を出している */
const routesOpen = ref(false);
// 重ね窓の「この回の質問へ」・足りない所の「直しに行く」で質問を替えたら、全体を見るの一覧は閉じて質問を出す (開いたままで質問が見えなかった、10-26)
watch(() => q.focus.value, () => { routesOpen.value = false; });
/** 完成形のカードを開いている */
const goalOpen = ref(true);
/** ツリーのメモを書いている (PhoneMemo) */
const memoEdit = ref(false);
/** 白紙に戻す = PC と同じ (SimTreePage の onClear): スタートと完成形を残して下を消す。作りかけは 3 択、保存済みは 2 回押し */
const clearArm = useArmed();
function onClear(): void {
  const go = (): void => { simOp("clear"); t.reset(); setCurrentTreeRecipe(null); q.reset(); window.scrollTo(0, 0); };
  if (unsaved(t.doc.value)) askLeave(go, () => void quickSave()); else if (clearArm.arm()) go();
}
/** 帯の小さなボタン (PC の 0 の枠 TreeGoalCard の札と同じ形、指で押せる高さ 32px) */
const PILL = "shrink-0 rounded-md border border-[#c9a45c]/60 bg-gradient-to-b from-[#3a2c14] to-[#1a1309] px-2.5 text-[12px] font-bold leading-[38px] text-[#f2d27a]";
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
const cardW = computed(() => Math.min(360, (typeof window === "undefined" ? 375 : window.innerWidth) - 40));

/** 棚で手を決めた = PC の pickHand と同じ組み替え (tree-hand-plan の applyPick)。続けてその手の結果 (②) を出す */
function pickHand(h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): void {
  const id = handFor.value!;
  simAct("hand", kind);
  let at = id;
  q.answer((d) => { at = applyPick(d, id, h, kind, aims, pre, only); });
  handFor.value = null;
  q.focus.value = { kind: "outs", id: at };
}
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
  if (routesOpen.value) return null;
  const c = q.current.value, b = c ? t.doc.value.boxes[c.id] : null;
  // 一番最初 (始まりの箱) は「始める」(10-26 夜オーナー「スマホの最初の質問『打つ手を選ぶ』は嫌、一番最初は始めるでいい」)。押すと同じく棚
  if (c && b && c.kind === "hand" && !b.hand) return { kind: "hand", text: b.out === "start" ? tr("始める", "Start") : tr("打つ手を選ぶ", "Choose a craft"), go: () => { handFor.value = c.id; } };
  if (c && c.kind === "outs") {
    const left = q.outsOf(c.id).filter((id) => q.stateOf(id) === "open").length;
    return { kind: "decide", text: left ? tr(`次へ (未定 ${left})`, `Next (${left} open)`) : tr("次へ", "Next"), go: () => q.decide(c.id) };
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
      <div data-phone-recipe class="relative flex min-w-0 flex-wrap items-center justify-center gap-2 text-[13px]">
        <TreeRecipeBar class="!contents" @opened="q.reset()" />
        <button type="button" data-phone-memo-open class="g-btn sm !min-h-10 shrink-0" :aria-pressed="memoEdit" @click="memoEdit = !memoEdit">✎ {{ tr("メモ", "Note") }}</button>
        <button type="button" data-phone-clear class="!min-h-10 shrink-0" :class="clearArm.is() ? 'g-btn-red sm' : 'g-btn sm'" @click="onClear">{{ clearArm.is() ? tr("もう一度押すと白紙に戻す", "Tap again to clear") : tr("白紙", "Clear") }}</button>
      </div>
      <!-- ツリーのメモ (文だけ、書いてあれば全文) -->
      <PhoneMemo v-model:editing="memoEdit" />
      <!-- 完成形 = PC と同じく完成形の MOD をアイテムの枠で (10-26 夜オーナー「まず情報過多」: 上に留める文字の帯と狙いの丸い札をやめた)。中央揃え、見出しを押すと畳める -->
      <section data-phone-goal class="flex min-w-0 flex-col items-center gap-2 text-center">
        <button type="button" data-phone-goal-fold class="flex min-h-10 max-w-full items-center justify-center gap-2 text-[14px]" :aria-expanded="goalOpen" @click="goalOpen = !goalOpen">
          <b class="shrink-0 text-[#f2d27a]">{{ tr("完成形", "Final item") }}</b><span class="min-w-0 break-words text-[#d8ccb4]">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</span><span class="shrink-0 text-[11px] opacity-70">{{ goalOpen ? "▾" : "▸" }}</span>
        </button>
        <StageItemCard v-if="goalOpen && t.goalItem.value && t.goals.value.length" data-phone-goal-card :item="t.goalItem.value.item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :fracture-group="marks" tier-at-least />
        <p v-else-if="goalOpen && !t.goals.value.length" class="text-[12px] text-[#9a8a70]">{{ tr("MOD はまだ (下の MOD で決める)", "No mods yet (set them with Mods)") }}</p>
        <span class="flex justify-center gap-2">
          <button type="button" data-phone-goal-open="base" :class="PILL" @click="t.goalPage.value = 1">{{ tr("ベース", "Base") }}</button>
          <button type="button" data-phone-goal-open="mods" :class="PILL" @click="t.goalPage.value = 2">MOD</button>
        </span>
      </section>
      <!-- 進み (残りの道・答えた数) と、残りの道の一覧の切り替え -->
      <div data-phone-progress class="flex items-center gap-2 text-[12px] text-[#d8ccb4]">
        <span>{{ tr("残りの道", "Open paths") }} <b class="text-[15px] text-amber-200">{{ total }}</b></span>
        <span class="opacity-70">· {{ tr(`答えた ${q.answered.value}`, `${q.answered.value} answered`) }}</span>
        <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"><i class="block h-full bg-amber-300" :style="{ width: `${Math.round((100 * q.answered.value) / Math.max(1, q.answered.value + total))}%` }" /></div>
        <button type="button" data-phone-routes class="g-btn sm !min-h-10 shrink-0" :aria-pressed="routesOpen" @click="routesOpen = !routesOpen">{{ routesOpen ? tr("質問へ", "Question") : tr("全体を見る", "Overview") }}</button>
      </div>
      <!-- 道が残っている間は 100 人回すの場所を先に知らせる (10-26 モンキー 7 の 7「100 人・テストがどこにも無い」) -->
      <p v-if="total" data-phone-run-hint class="text-center text-[11px] text-[#9a8a70]">{{ tr("残りの道を全部決めると、下の帯で 100 人回せる (足りない所は先に直す)", "Decide every open path and the bar below lets you run 100 (fix anything missing first)") }}</p>
      <!-- 足りない所 (PC と同じ精査、自動で回る。10-26 案 2) -->
      <PhoneIssues />
      <PhoneRoutes v-if="routesOpen" @pick="routesOpen = false" />
      <PhoneAsk v-else-if="q.current.value" :key="`${q.current.value.kind}-${q.current.value.id}`" :q="q.current.value" @hand="(id) => (handFor = id)" />
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
        <PhoneMap v-if="MAP" />
        <!-- 全体図を畳んでいる時は細い 1 行 (全幅、押すと開く。高さ 700px 未満は既定で畳む) -->
        <button v-if="MAP && mapFolded" type="button" data-phone-map-unfold class="flex h-8 w-full items-center gap-2 rounded-md border border-white/10 bg-[#080706] px-3 text-left text-[12px] text-[#d8ccb4]" @click="setMapFold(false)">
          <span class="min-w-0 flex-1 break-words">{{ tr(`全体図 (箱 ${Object.keys(t.doc.value.boxes).length})`, `Overview (${Object.keys(t.doc.value.boxes).length} boxes)`) }}</span><span class="shrink-0">{{ tr("開く ▴", "Open ▴") }}</span>
        </button>
        <div class="flex gap-2">
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
    <PhoneBoxSheet v-if="MAP && sheet" />
    <TreePanelPage v-if="aimFor && t.doc.value.boxes[aimFor]" :key="`a-${aimFor}`" kind="aim" :box-id="aimFor" :current="t.doc.value.boxes[aimFor]!.aim" @pick="pickAim" @close="aimFor = null" />
  </div>
</template>

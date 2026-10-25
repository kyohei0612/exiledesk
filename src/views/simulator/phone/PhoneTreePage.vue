<!--
  PhoneTreePage.vue — シミュのスマホ版のツリーのページ (768px 未満、スイッチ simPhone。2026-10-25 オーナー「その間スマホ版つくるか」、案 sim28-phone-quiz-mock)。
  木は描かず質問で進める (use-phone-quiz): ① 何を打つ? → ② 結果ごとにどうする? → 残りの道 → 全部決まったら完成。木は PC と同じ TreeDoc (use-tree) なので PC と行き来できる。
  ベース選び・完成の MOD は PC と同じ TreeGoalPage (TreeOverlays、スマホはページで縦積み)、棚は PC と同じ TreeHandPage。
  木の外の動き (白紙ならベース選びへ・離れる時の確かめ・段の URL) は SimTreePage の script がそのまま受け持つ (スマホでも動いている)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
import { usePhoneQuiz } from "./use-phone-quiz";
import PhoneAsk from "./PhoneAsk.vue";
import PhoneRoutes from "./PhoneRoutes.vue";

const t = useTree();
const q = usePhoneQuiz();
/** 棚を開いている箱 / 当たりの MOD を選んでいる箱 */
const handFor = ref<string | null>(null);
const aimFor = ref<string | null>(null);
/** 残りの道の一覧を出している */
const routesOpen = ref(false);
/** 完成形のカードを開いている */
const goalOpen = ref(false);
/** 帯の小さなボタン (PC の 0 の枠 TreeGoalCard の札と同じ形、指で押せる高さ 32px) */
const PILL = "shrink-0 rounded-md border border-[#c9a45c]/60 bg-gradient-to-b from-[#3a2c14] to-[#1a1309] px-2.5 text-[12px] font-bold leading-[30px] text-[#f2d27a]";
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
const cardW = computed(() => Math.min(360, (typeof window === "undefined" ? 375 : window.innerWidth) - 40));

/** 棚で手を決めた = PC の pickHand と同じ組み替え (tree-hand-plan の applyPick)。続けてその手の結果 (②) を出す */
function pickHand(h: Hand, kind: HandKind, aims: Aim[], pre: string | null, only: OnlyOut): void {
  const id = handFor.value!;
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

// 100 人回す (PC の SimTreePage と同じ use-tree-run。止まった箱・まとめの箱を押すと、その箱の質問へ)
const run = useTreeRun(t.doc, t.startPrice, t.treePrice, () => {}, () => {});
watch(() => run.walk.value, (w) => { if (w) run.skipWalk(); });
const reportOpen = ref(false);
watch(() => !!run.result.value && !run.running.value && !run.halted.value, (on) => { reportOpen.value = on; });
/** 止まった理由 (tree-run の stuckWhy: エンジンの断りの文と、そこへ戻ってきた箱) */
const haltWhy = computed(() => { const h = run.halted.value; return h ? run.result.value?.stuckWhy?.[h.box] ?? null : null; });
const donePct = computed(() => Math.round(((run.result.value?.finished ?? 0) / (run.result.value?.n || 1)) * 100));
const fmt = (x: number): string => (!Number.isFinite(x) ? "—" : x >= 100 ? x.toFixed(0) : x.toFixed(1));
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
    <template v-if="!t.goalInline.value">
      <!-- レシピ (保存・開く・共有 URL。PC の帯と同じ部品、木が同じなので PC で開き直せる) -->
      <div data-phone-recipe class="flex min-w-0 flex-wrap items-center gap-2 text-[13px]"><TreeRecipeBar @opened="q.reset()" /></div>
      <!-- 完成形 (畳んだ 1 行: ベース・狙いの数。開くと PC の 0 の枠と同じカード) -->
      <div data-phone-goal class="rounded-xl border border-[#c9a45c]/60 bg-[#1a140d] px-3 py-2">
        <div class="flex min-w-0 items-center gap-2 text-[13px]">
          <button type="button" data-phone-goal-fold class="flex min-w-0 flex-1 items-center gap-2 text-left" :aria-expanded="goalOpen" @click="goalOpen = !goalOpen">
            <span class="shrink-0 font-bold text-[#f2d27a]">{{ tr("完成形", "Final item") }}</span>
            <span class="min-w-0 flex-1 truncate text-[#d8ccb4]">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }} · {{ t.goals.value.length ? tr(`狙い ${t.goals.value.length} つ`, `${t.goals.value.length} target(s)`) : tr("MOD はまだ", "No mods yet") }}</span>
            <span class="shrink-0 text-[11px] opacity-70">{{ goalOpen ? "▾" : "▸" }}</span>
          </button>
          <button type="button" data-phone-goal-open="base" :class="PILL" @click="t.goalPage.value = 1">{{ tr("ベース", "Base") }}</button>
          <button type="button" data-phone-goal-open="mods" :class="PILL" @click="t.goalPage.value = 2">MOD</button>
        </div>
        <div v-if="goalOpen && t.goalItem.value" class="mt-2"><StageItemCard :item="t.goalItem.value.item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :fracture-group="marks" tier-at-least /></div>
      </div>
      <!-- 進み (残りの道・答えた数) と、残りの道の一覧の切り替え -->
      <div data-phone-progress class="flex items-center gap-2 text-[12px] text-[#d8ccb4]">
        <span>{{ tr("残りの道", "Open paths") }} <b class="text-[15px] text-amber-200">{{ total }}</b></span>
        <span class="opacity-70">· {{ tr(`答えた ${q.answered.value}`, `${q.answered.value} answered`) }}</span>
        <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"><i class="block h-full bg-amber-300" :style="{ width: `${Math.round((100 * q.answered.value) / Math.max(1, q.answered.value + total))}%` }" /></div>
        <button type="button" data-phone-routes class="g-btn sm shrink-0" :aria-pressed="routesOpen" @click="routesOpen = !routesOpen">{{ routesOpen ? tr("質問へ", "Question") : tr("全体を見る", "Overview") }}</button>
      </div>
      <PhoneRoutes v-if="routesOpen" @pick="routesOpen = false" />
      <PhoneAsk v-else-if="q.current.value" :key="`${q.current.value.kind}-${q.current.value.id}`" :q="q.current.value" @hand="(id) => (handFor = id)" @pick="(p) => { handFor = q.current.value!.id; pickHand(p.hand, p.kind, p.aims, p.preCat, p.only); }" />
      <!-- 全部の道が決まった (残りの道 0) -->
      <template v-else>
        <div data-phone-all-done class="rounded-xl border border-emerald-400/50 bg-[#13190f] px-3 py-4 text-center">
          <p class="text-[15px] font-bold text-emerald-300">{{ tr("全部の道が決まりました", "Every path is decided") }}</p>
          <p class="mt-1 text-[12px] text-[#9a8a70]">{{ tr("狙いが全部そろう道は自動で完成 (答え直せる)", "Paths with every target are marked done automatically (you can change them)") }}</p>
        </div>
        <!-- 100 人回す (PC と同じ use-tree-run。1 人目が木を進む再生は木が無いので飛ばす) -->
        <button type="button" data-phone-run class="g-btn py-3 text-[15px]" :disabled="!s.data.value || run.running.value" @click="run.run">{{ run.running.value ? tr(`回している ${run.result.value?.n ?? 0} / ${RUN_N}`, `Running ${run.result.value?.n ?? 0} / ${RUN_N}`) : tr(`${RUN_N} 人回す`, `Run ${RUN_N}`) }}</button>
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
      <!-- 下の帯: 1 つ戻す・やり直し -->
      <div class="sticky bottom-0 z-10 -mx-2 flex gap-2 border-t border-white/10 bg-[#0c0a08]/95 px-2 py-2">
        <button type="button" data-phone-undo class="g-btn flex-1" :disabled="!t.canUndo.value" @click="t.undo">{{ tr("↶ 1 つ戻す", "↶ Undo") }}</button>
        <button type="button" data-phone-redo class="g-btn" :disabled="!t.canRedo.value" :aria-label="tr('やり直し', 'Redo')" @click="t.redo">↷</button>
      </div>
    </template>
    <TreeHandPage v-if="handFor && t.doc.value.boxes[handFor]" :key="`h-${handFor}`" :box-id="handFor" :current="t.doc.value.boxes[handFor]!.hand" @pick="pickHand" @clear="clearHandOf" @close="handFor = null" @back="backOf" @aim="aimFor = handFor; handFor = null" />
    <!-- 結果のまとめ (PC と同じ部品。スマホは下から出る形 = TreeRunReport の max-md の置き方) -->
    <div v-if="reportOpen && run.result.value && !run.running.value" data-phone-report class="fixed inset-0 z-50 bg-black/50" @click.self="reportOpen = false">
      <TreeRunReport :result="run.result.value" @close="reportOpen = false" @go="(id) => { reportOpen = false; goBox(id); }" />
    </div>
    <TreePanelPage v-if="aimFor && t.doc.value.boxes[aimFor]" :key="`a-${aimFor}`" kind="aim" :box-id="aimFor" :current="t.doc.value.boxes[aimFor]!.aim" @pick="pickAim" @close="aimFor = null" />
  </div>
</template>

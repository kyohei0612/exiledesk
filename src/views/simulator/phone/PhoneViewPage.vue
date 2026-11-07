<!--
  PhoneViewPage.vue — シミュのスマホの見るだけの 1 画面 (S-94〜S-94f、幅 768 未満 + オーナー 11-01「完全にスマホ版は見るだけに特化させた作りに変えよう修正もできない完全に観賞用」)。
  上の帯 (タブ)・レシピとシェア・100 人回す (PC と同じ人数、11-07)、その下に開いたままのシート (小さな完成形 + 完成までの道 PhoneViewRoute、「詳細」で全体図 PhoneViewMap、S-94h)。木を変える入口は無い。
  完成形は倍率で縮めるだけで文は切らず、押すと今の大きさ (D6)。スマホで回した結果はカードに載せない (D2、use-tree-run の view)。木が無い時は PhoneViewEmpty (S-94f)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import ModeTabs from "../../../components/for-share/ModeTabs.vue";
import TreeRecipeBar from "../tree/TreeRecipeBar.vue";
import TreeRunReport from "../tree/TreeRunReport.vue";
import { holeBusy } from "../tree/hole-check";
import { routeKeyOf, useTreeCheck } from "../tree/use-tree-check";
import { useGoalShown } from "../tree/use-goal-shown";
import { useTree } from "../tree/use-tree";
import { useTreeRun, VIEW_N } from "../tree/use-tree-run";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { simOp } from "../../../web/track";
import PhoneViewEmpty from "./PhoneViewEmpty.vue";
import PhoneViewMap from "./PhoneViewMap.vue";
import PhoneViewRoute from "./PhoneViewRoute.vue";

const t = useTree();
const shown = useGoalShown();
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
/** 木を開いていない (S-94f。use-tree の白紙と同じ見方) */
const noTree = computed(() => { const d = t.doc.value; return t.needBase.value || (!d.baseChosen && Object.keys(d.boxes).length <= 1 && !d.memoAims?.length); });

/** 穴チェック: 結果は読むだけ (S-94e、一覧も直す入口も出さない) */
const check = useTreeCheck(t.doc, () => !noTree.value);
/**
 * 穴チェックは自動で回らない (S-70) ので開いた時にここで回す。
 * 回している間に木が読み替わった時 (pruneBacks) は、終わってからもう 1 回
 */
let ranKey = "";
watch([() => routeKeyOf(t.doc.value), () => !!s.data.value && !noTree.value, check.checking], ([key, ok, busy]) => { if (!ok || busy || ranKey === key) return; ranKey = key; void check.runCheck(); }, { immediate: true });
const routeKey = computed(() => routeKeyOf(t.doc.value));
/** 穴チェックが終わった木の形 (終わるまで「回せない」と言わない) */
const doneKey = ref("");
watch(check.checking, (on, was) => { if (was && !on) doneKey.value = routeKey.value; });
const passed = computed(() => !check.checking.value && check.passed.value);
const locked = computed(() => !check.checking.value && !passed.value && doneKey.value === routeKey.value);

// 100 人回す (PC と同じ人数・回し方で 1 人目の再生は無し、結果のまとめも PC と同じ部品)
const run = useTreeRun(t.doc, t.startPrice, t.treePrice, () => {}, () => {}, true);
const reportOpen = ref(false);
watch(() => !!run.result.value && !run.running.value && !run.halted.value, (on) => { reportOpen.value = on; });
function go(): void { simOp("view-run"); void run.run(); }
const fmt = (x: number): string => (!Number.isFinite(x) ? "—" : x >= 100 ? x.toFixed(0) : x.toFixed(1));
const donePct = computed(() => { const r = run.result.value; return r ? Math.round((r.finished / (r.n || 1)) * 100) : 0; });
const map = ref<InstanceType<typeof PhoneViewMap> | null>(null);
/** 詳細 = 全体図。既定は完成までの道 (S-94h、オーナー 11-01「詳細ボタン付けたらオンオフで全体さっきのツリー見れるでいいんじゃね」) */
const detail = ref(false);
function toggleDetail(): void { detail.value = !detail.value; goalBig.value = !detail.value; simOp("view-detail", detail.value ? "on" : "off"); }
/** 結果のまとめの箱を押した: 全体図でその箱へ寄る (全体図が大きさを測ってから) */
async function goBox(id: string): Promise<void> {
  reportOpen.value = false; detail.value = true; goalBig.value = false;
  await nextTick();
  requestAnimationFrame(() => requestAnimationFrame(() => map.value?.goTo(id)));
}

// シートの上枠 = 帯のすぐ下、下は画面の下まで (閉じない、S-94b)。ページは送らない (シートの中の指は全体図が受け取る)
const topEl = ref<HTMLElement | null>(null);
const sheetTop = ref(0);
function measureTop(): void { if (topEl.value) sheetTop.value = Math.round(topEl.value.getBoundingClientRect().top); }
let ro: ResizeObserver | null = null;
const lockWas = document.documentElement.style.overflow;
onMounted(() => {
  window.scrollTo(0, 0);
  document.documentElement.style.overflow = "hidden";
  window.addEventListener("resize", measureTop);
  ro = new ResizeObserver(measureTop);
  ro.observe(document.body);
});
onBeforeUnmount(() => { document.documentElement.style.overflow = lockWas; window.removeEventListener("resize", measureTop); ro?.disconnect(); });
watch([topEl, () => run.result.value?.n, () => passed.value, locked], () => void nextTick(measureTop), { flush: "post" });

// 小さな完成形 = 広い幅で描いて倍率で縮めるだけ (S-92 の例外、D6)。押すと今の大きさ
// 道の画面は下へ送るので最初から広げ、詳細の全体図の時は小さく (オーナー 11-01「これなら完成MODカードでかくていいよ今小さいから　どうせ下にスクロールするだけだしな」「最初から押すと広がるでおｋだったら」)
const CARD_SMALL = 0.55;
const goalBig = ref(true);
/** 詳細 (全体図) の時に完成形を題の 1 行にたたむ (このブラウザに覚える。11-07 オーナー「スマホのレシピ見づら、詳細みたら完成形閉じるかどうか選択できるようにしたいなツリーが見づらい」、S-94h) */
const SHUT_KEY = "exiledesk.phone.goal-shut";
const goalShut = ref((() => { try { return localStorage.getItem(SHUT_KEY) === "1"; } catch { return false; } })());
watch(goalShut, (on) => { try { localStorage.setItem(SHUT_KEY, on ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });
/** 題・カードを押した時: 詳細の間は閉じる / 開く (広げるは無い、11-07 オーナー「広げると開く同じやろ広げるを閉じるに変えた方がいいね」)、道の画面は今どおり広げる / 縮める */
function onGoalHead(): void { if (detail.value) goalShut.value = !goalShut.value; else goalBig.value = !goalBig.value; }
const goalBox = ref<HTMLElement | null>(null), cardEl = ref<HTMLElement | null>(null);
const goalW = ref(360), cardH = ref(0);
let cardRo: ResizeObserver | null = null;
watch([goalBox, cardEl], () => {
  cardRo?.disconnect();
  if (!goalBox.value || !cardEl.value) return;
  cardRo = new ResizeObserver(() => { goalW.value = goalBox.value?.clientWidth ?? 360; cardH.value = cardEl.value?.offsetHeight ?? 0; });
  cardRo.observe(goalBox.value); cardRo.observe(cardEl.value);
}, { flush: "post" });
onBeforeUnmount(() => cardRo?.disconnect());
const cardScale = computed(() => (goalBig.value ? 1 : CARD_SMALL));
const cardW = computed(() => Math.round(goalW.value / cardScale.value));
</script>

<template>
  <div data-phone-view class="flex min-w-0 flex-col gap-2">
    <ModeTabs />
    <PhoneViewEmpty v-if="noTree" />
    <template v-else>
      <!-- レシピとシェアだけ (保存・メモ・白紙は無し)。落ちる窓はシートの上に重なる -->
      <div data-phone-recipe data-tree-own class="relative z-40 flex min-w-0 flex-wrap items-center justify-between gap-1 text-[13px]">
        <TreeRecipeBar class="!contents" view flat="flex h-10 min-w-10 shrink-0 items-center justify-center gap-0.5 whitespace-nowrap rounded-md bg-white/[0.04] px-1.5 text-[12px] text-sim-body aria-expanded:text-amber-100" />
      </div>
      <!-- 穴チェックの帯の所に 100 人回す。穴があれば短い文だけ (S-94e) -->
      <div data-phone-view-run class="flex min-w-0 flex-col gap-1">
        <p v-if="locked" data-phone-view-locked class="rounded-md border border-amber-300/30 px-3 py-2 text-center text-[13px] text-amber-100">{{ tr("足りない所があるので回せない。PC で直す", "Can't run: this tree has gaps. Fix it on a PC") }}</p>
        <button v-else type="button" data-phone-view-go class="g-btn-red !min-h-11 w-full px-2 text-[15px]" :disabled="!passed || !s.data.value || run.running.value" @click="go">{{ !passed ? holeBusy() : run.running.value ? tr(`回している ${run.result.value?.n ?? 0} / ${VIEW_N}`, `Running ${run.result.value?.n ?? 0} / ${VIEW_N}`) : tr(`${VIEW_N} 人回す`, `Run ${VIEW_N}`) }}</button>
        <button v-if="run.result.value && !run.running.value && !run.halted.value" type="button" data-phone-view-sum class="flex min-h-9 items-center justify-between rounded-md border border-amber-300/40 px-3 text-[13px] tabular-nums text-amber-100" @click="reportOpen = true"><span>{{ tr(`1 個 ${fmt(run.result.value.perItem)} 神 · 完成 ${donePct}%`, `${fmt(run.result.value.perItem)} div/item · ${donePct}% done`) }}</span><span class="text-[12px]">{{ tr("結果のまとめ ›", "Summary ›") }}</span></button>
        <p v-if="run.halted.value" data-phone-view-halt class="rounded-md border border-rose-400/60 px-3 py-2 text-center text-[13px] text-rose-100">{{ tr("途中で止まった人がいる。PC で直す", "Some runs got stuck. Fix it on a PC") }}</p>
      </div>
      <div ref="topEl" />
      <section data-phone-view-sheet class="fixed inset-x-0 bottom-0 z-30 flex flex-col overscroll-contain rounded-t-2xl border-t-2 border-[#b08a3c] bg-sim-panel px-3 pb-2 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]" :class="detail ? '' : 'overflow-y-auto'" :style="{ top: `${sheetTop}px` }">
        <div class="mb-1 flex min-h-0 min-w-0 flex-col overflow-y-auto" :class="goalBig && detail ? 'max-h-[60%] shrink-0' : 'shrink-0'">
          <div class="flex min-w-0 items-center gap-2">
          <button type="button" data-phone-view-goal class="flex min-w-0 flex-1 items-baseline gap-2 text-left text-[13px]" :aria-expanded="detail ? !goalShut : goalBig" @click="onGoalHead">
            <b class="shrink-0 text-[#f2d27a]">{{ tr("完成形", "Final item") }}</b><span class="min-w-0 flex-1 break-words text-sim-body">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</span>
            <span class="shrink-0 text-[11px] text-sim-dim">{{ detail ? (goalShut ? tr("開く ▾", "Tap to open ▾") : tr("閉じる ▴", "Tap to close ▴")) : goalBig ? tr("縮める ▴", "Tap to shrink ▴") : tr("広げる ▾", "Tap to expand ▾") }}</span>
          </button>
          <button type="button" data-phone-view-detail class="g-btn sm !min-h-9 shrink-0" :aria-pressed="detail" @click="toggleDetail">{{ detail ? tr("詳細を閉じる", "Hide details") : tr("詳細", "Details") }}</button>
          </div>
          <!-- 高さは縮めた後の大きさで取る (transform は枠の高さを変えない) -->
          <div v-show="!(detail && goalShut)" ref="goalBox" data-phone-view-card class="min-w-0 overflow-hidden" :style="{ height: cardH ? `${Math.ceil(cardH * cardScale)}px` : undefined }" @click="onGoalHead">
            <div v-if="t.goalItem.value && t.goals.value.length" ref="cardEl" class="origin-top-left" :style="{ width: `${cardW}px`, transform: `scale(${cardScale})` }">
              <StageItemCard :row-group="shown.groups.value" :item="shown.item.value ?? t.goalItem.value.item" :row-tags="shown.tags.value" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="cardW" compact :fracture-group="marks" tier-at-least />
            </div>
          </div>
        </div>
        <PhoneViewMap v-if="detail" ref="map" :result="run.result.value" />
        <PhoneViewRoute v-else :result="run.result.value" />
      </section>
      <!-- 結果のまとめ (PC と同じ部品、スマホは下から出る形。PC と同じ 100 人なので「振れる」の一言は出さない、S-94e) -->
      <div v-if="reportOpen && run.result.value && !run.running.value" data-phone-report class="fixed inset-0 z-50 bg-black/50" @click.self="reportOpen = false">
        <TreeRunReport :result="run.result.value" @close="reportOpen = false" @go="goBox" />
      </div>
    </template>
  </div>
</template>

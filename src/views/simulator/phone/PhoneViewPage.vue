<!--
  PhoneViewPage.vue — シミュのスマホの見るだけの 1 画面 (S-94〜S-94f、幅 768 未満 + オーナー 11-01「完全にスマホ版は見るだけに特化させた作りに変えよう修正もできない完全に観賞用」)。
  上の帯 (タブ)・レシピとシェア・回す手は無い (11-10 から当分回さない。未設定は「未完成のレシピです」だけ)、その下に開いたままのシート (小さな完成形 + 完成までの道 PhoneViewRoute、「詳細」で全体図 PhoneViewMap、S-94h)。木を変える入口は無い。
  完成形は倍率で縮めるだけで文は切らず、押すと今の大きさ (D6)。スマホで回した結果はカードに載せない (D2、use-tree-run の view)。木が無い時は PhoneViewEmpty (S-94f)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import ModeTabs from "../../../components/for-share/ModeTabs.vue";
import TreeRecipeBar from "../tree/TreeRecipeBar.vue";
import { blocksRun, unsetIssues } from "../../../services/simulator/tree/tree-check";
import { unfinishedText } from "../tree/hole-check";
import { useGoalShown } from "../tree/use-goal-shown";
import { useTree } from "../tree/use-tree";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { simOp } from "../../../web/track";
import { feedbackPage } from "../../../state/web-page";
import PhoneViewEmpty from "./PhoneViewEmpty.vue";
import PhoneViewMap from "./PhoneViewMap.vue";
import PhoneViewRoute from "./PhoneViewRoute.vue";
import { mapFolded, setMapFold } from "./map-fold";

const t = useTree();
const shown = useGoalShown();
const marks = computed(() => t.goals.value.filter((a) => a.fractured).map((a) => a.modId));
/** 木を開いていない (S-94f。use-tree の白紙と同じ見方) */
const noTree = computed(() => { const d = t.doc.value; return t.needBase.value || (!d.baseChosen && Object.keys(d.boxes).length <= 1 && !d.memoAims?.length); });

/**
 * 開いた時に穴チェック (人を回す確かめ) はしない。レシピをそのまま見せるだけ (11-10 オーナー「スマホはレシピのまんま表示するだけでいいよ」、S-94e。
 * 前は開いた時に 30 人を辿り、スマホで約 10 秒固まった)。未設定は箱を形だけで数え (見本も人も使わない unsetIssues)、1 つでもあれば「未完成」で回さない
 */
const locked = computed(() => !noTree.value && unsetIssues(t.doc.value).some((x) => blocksRun(x.kind)));

// スマホは当分回さない (人を回す手は画面に無い。11-10 オーナー「いったんスマホは回さなくておk」「とにかく自動でまずは回さない事」、S-94e)。
// 前は「10 人回す」(11-07〜11-10 は 100 人) と結果の行・結果のまとめ・木の上の層があった
/** 詳細 = 全体図。既定は完成までの道 (S-94h、オーナー 11-01「詳細ボタン付けたらオンオフで全体さっきのツリー見れるでいいんじゃね」) */
const detail = ref(false);
function toggleDetail(): void { detail.value = !detail.value; goalBig.value = !detail.value; simOp("view-detail", detail.value ? "on" : "off"); }

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
// 要望のページの間は木が隠れているだけ (U-05c)。要望のページは送れるように止めを外し、戻ったら止め直す
watch(feedbackPage, (on) => { document.documentElement.style.overflow = on ? lockWas : "hidden"; if (!on) { window.scrollTo(0, 0); void nextTick(measureTop); } });
onBeforeUnmount(() => { document.documentElement.style.overflow = lockWas; window.removeEventListener("resize", measureTop); ro?.disconnect(); });
// 未完成の表示が出る・消えると帯の高さが変わる
watch([topEl, locked], () => void nextTick(measureTop), { flush: "post" });

// 小さな完成形 = 広い幅で描いて倍率で縮めるだけ (S-92 の例外、D6)。押すと今の大きさ
// 道の画面は下へ送るので最初から広げ、詳細の全体図の時は小さく (オーナー 11-01「これなら完成MODカードでかくていいよ今小さいから　どうせ下にスクロールするだけだしな」「最初から押すと広がるでおｋだったら」)
const CARD_SMALL = 0.55;
const goalBig = ref(true);
/**
 * 共有 URL で来た時は全体図 (詳細) を開いて着く (S-103。openSharedRecipe が setMapFold(false) で知らせる、1 回読んだら戻す)。
 * 11-10 直し: S-94 の作り替えでこの印を読まなくなり、未設定のある木は完成形と「PC で直す」だけで木が出ていなかった
 */
watch(mapFolded, (folded) => { if (folded) return; detail.value = true; goalBig.value = false; setMapFold(true); }, { immediate: true });
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
      <!-- 回す手は無い (当分回さない、S-94e)。未設定があれば前のボタンの所に押せない形で「未完成のレシピです」だけ (11-10 オーナー「未完成のは未完成のレシピですって10人回すところのボタンにかいとけばおｋ」) -->
      <div v-if="locked" data-phone-view-run class="flex min-w-0 flex-col gap-1">
        <button type="button" data-phone-view-locked class="g-btn-red !min-h-11 w-full px-2 text-[15px]" disabled>{{ unfinishedText() }}</button>
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
        <PhoneViewMap v-if="detail" />
        <PhoneViewRoute v-else />
      </section>
    </template>
  </div>
</template>

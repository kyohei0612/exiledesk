<!--
  ModeTabs.vue — 上の切り替えタブの帯 (エミュレーター / シミュレーター)。どの画面にも同じ作りで出すページの枠 (2026-10-23 オーナー
  「シミュへ移るとエミュのタブが消え、戻るとシミュのタブが消える。帯を 1 つにして両方に」)。
  - エミュレーター = クラフトステージ (/)、シミュレーター = 最初のベース選び (?page=sim-base、2026-10-24 オーナー)。押すとそのページへ (ブラウザの戻るは page.ts の履歴)
  - ツリーの作りかけでエミュレーターへ移る時は page.ts の closeTreePage が確かめる (やめたら pick を出さない)
  - シミュレーターのタブは開発版だけ (TREE_ON。本番はまだ出さない)。スマホ (768px 未満) でも出す (10-25 オーナー「A でいこう」で一度隠し、シミュのスマホ版 simPhone を開けて出した)
  - 今いる方が選ばれた見た目。active で上書きできる (エミュの画面でジェムコラプトを開いている時は null = どちらも選ばない)
  - その画面だけのタブ (エミュのジェムコラプト・アプリのチュートリアル) は既定の slot で後ろに足す
  - 並びは エミュレーター / シミュレーター / デイリー / (slot = ジェムコラプト) / コスメティック (2026-10-25 オーナー「ここの右端が良いな、目立たんし」「コスメが端かな」
    「デイリーの右に将来追加するジェムコラプト置こうか」、ヘッダーから移した)。デイリー・コスメティックは開発版だけ (スイッチ daily・skins)。
    スマホは 1 段に 3 つまで折り返して余った段は広げる (2 つなら 2 列・5 つなら 3 + 2)、狭い PC は折り返す
  - デイリーの挑戦中にほかの画面へ移ったら、並びの右に「挑戦へ戻る」札 (D-37g、PC だけ。スマホの形と帯が見えていない時は WebApp の細い帯。札がここにある間は下の :has で WebApp の帯を隠す)
  使い方: <ModeTabs @pick="(m) => …画面の後片付け" ><button class="g-tab">…</button></ModeTabs>
-->
<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch, type Component } from "vue";
import { tr } from "../../i18n/lang";
import { DAILY_ON, dailyPage, PAGES_ON, TREE_ON, treePage } from "../../state/web-page";
import { closeTreePage, openDailyPage, openSkinsPage, openTreePage, page, SKINS_ON, topOfPage } from "../../web/page";
import { usePhone } from "../../utils/use-phone";
import { flag } from "../../web/release-flags";

type Mode = "hand" | "sim";
const props = defineProps<{ active?: Mode | null }>();
const emit = defineEmits<{ pick: [Mode] }>();

/** 本番 (スイッチ modeTabs が切れている間) はベースのページに帯を出さない (前は帯ごと隠していた) */
const shown = computed(() => flag("modeTabs") || page.value !== "page=base");
/** 帯が今見えているか (要望のページなどは裏にエミュの帯が隠れて残るので、大きさで見る)。見えている時だけ右に札を差す */
const root = ref<HTMLElement | null>(null);
const seen = ref(false);
const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => (seen.value = !!root.value?.getClientRects().length)) : null;
watch(root, (el, old) => { if (old) ro?.unobserve(old); if (el) ro?.observe(el); else seen.value = false; });
onBeforeUnmount(() => ro?.disconnect());
const phone = usePhone();
const on = computed((): Mode | null => (props.active !== undefined ? props.active : treePage.value ? "sim" : "hand"));
/** デイリーのページではデイリーのタブを選んだ見た目に (スイッチ siteLook。大きい題の帯を出さないので、今どこかはタブで示す。U-49) */
const dailyOn = computed(() => flag("siteLook") && !!dailyPage.value);
/** 押したら一番上から (スイッチ backPlace、U-27: タブは初めて開いたのと同じ。戻るは前の位置) */
function pick(m: Mode): void {
  if (m === "sim") {
    openTreePage("base");
    emit("pick", m);
    topOfPage();
  } else closeTreePage(() => { emit("pick", m); topOfPage(); });
}
/**
 * AdSense の審査が終わるまでコスメティックのタブを出さない (2026-10-27 オーナー「コスメのリンク外し」、模擬審査の 5「写した中身」に近い)。
 * ページ自体は ?page=skins を直に開けば見られる。スイッチ adReview (オーナーが見てから本番)。審査が通ったら戻す (段取りは docs/org/design/todo.md)
 */
const SKINS_TAB_HIDDEN = flag("adReview");
const SKINS_TAB = SKINS_ON && !SKINS_TAB_HIDDEN;
/** 右端の小さいタブ (コスメティック・デイリー)。Web だけ */
const EXTRA = PAGES_ON && (SKINS_TAB || DAILY_ON);
/** デイリーの挑戦中にほかの画面へ移った時の「挑戦へ戻る」札 (D-37g)。PC はタブの並びの右、スマホの形はタブの右に入らないので WebApp の細い帯。スイッチ daily の下 */
const goingFile = Object.values(import.meta.glob<{ default: Component }>("../../views/daily/DailyGoingPill.vue"))[0];
const DailyGoingPill = DAILY_ON && goingFile ? defineAsyncComponent(goingFile) : null;
const TAB_S = "g-tab min-w-[120px] !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]";
const TAB = "g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]";
</script>

<template>
  <!-- スマホは 1 段に 3 つまで折り返し、余った段は広げて埋める (2 つなら 2 列・5 つなら 3 + 2、空き枠を出さない。オーナー 10-25「2 列にしてから出して」)。slot のタブにも効くよう子に付ける -->
  <!-- 外の箱はタブの並び + 右の「挑戦へ戻る」札 (D-37g)。札はタブと縦の真ん中を揃える -->
  <div v-if="shown" ref="root" class="inline-flex flex-wrap items-center gap-x-4 gap-y-1 max-md:flex max-md:w-full">
    <div data-mode-tabs class="inline-flex min-w-0 flex-wrap gap-1 max-md:flex max-md:w-full" :class="EXTRA ? 'max-md:[&>*]:!grow max-md:[&>*]:!basis-[calc((100%-0.5rem)/3)]' : ''" role="tablist">
      <button type="button" role="tab" data-mode-tab="hand" :aria-selected="on === 'hand'" :class="[TAB, on === 'hand' ? 'on' : '']" @click="pick('hand')">{{ tr("エミュレーター", "Emulator") }}</button>
      <button v-if="TREE_ON" type="button" role="tab" data-mode-tab="sim" :aria-selected="on === 'sim'" :class="[TAB, on === 'sim' ? 'on' : '']" @click="pick('sim')">
        {{ tr("シミュレーター", "Simulator") }}<span class="text-[10px] font-normal opacity-70" :title="tr('作り込み中の機能', 'Still in development')">β</span>
      </button>
      <button v-if="EXTRA && DAILY_ON" type="button" role="tab" data-mode-tab="daily" :aria-selected="dailyOn" :class="[TAB_S, dailyOn ? 'on' : '']" @click="openDailyPage(); topOfPage()">{{ tr("デイリー", "Daily") }}</button>
      <slot />
      <button v-if="EXTRA && SKINS_TAB" type="button" role="tab" data-mode-tab="skins" :aria-selected="false" :class="TAB_S" @click="openSkinsPage(); topOfPage()">{{ tr("コスメティック", "Cosmetics") }}</button>
    </div>
    <component :is="DailyGoingPill" v-if="DailyGoingPill && !phone && seen" class="mode-tabs-going" />
  </div>
</template>

<style scoped>
/* 「挑戦へ戻る」札をタブの並びの右に置く時: 帯の線と余白を外し、タブと高さ・縦の真ん中を揃える (D-37g)。札の側の scoped より後から読まれても勝つよう 2 回書く */
.mode-tabs-going.mode-tabs-going {
  align-self: stretch;
  padding: 0;
  border-bottom: 0;
  white-space: nowrap;
}
.mode-tabs-going.mode-tabs-going :deep(button) {
  min-height: 0;
  height: 100%;
}
</style>

<style>
/* タブの右に札がある間は WebApp の <main> の上の細い帯を出さない (D-37g。WebApp・札の部品はデイリーの持ち場なので、こちらから隠す) */
body:has(.mode-tabs-going) [data-daily-going]:not(.mode-tabs-going) {
  display: none;
}
</style>

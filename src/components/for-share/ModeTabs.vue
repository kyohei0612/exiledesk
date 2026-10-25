<!--
  ModeTabs.vue — 上の切り替えタブの帯 (エミュレーター / シミュレーター)。どの画面にも同じ作りで出すページの枠 (2026-10-23 オーナー
  「シミュへ移るとエミュのタブが消え、戻るとシミュのタブが消える。帯を 1 つにして両方に」)。
  - エミュレーター = クラフトステージ (/)、シミュレーター = 最初のベース選び (?page=sim-base、2026-10-24 オーナー)。押すとそのページへ (ブラウザの戻るは page.ts の履歴)
  - ツリーの作りかけでエミュレーターへ移る時は page.ts の closeTreePage が確かめる (やめたら pick を出さない)
  - シミュレーターのタブは開発版だけ (TREE_ON。本番はまだ出さない)。スマホ (768px 未満) では出さない (2026-10-25 オーナー「A でいこう」、URL で開いた時の案内はシミュの画面)
  - 今いる方が選ばれた見た目。active で上書きできる (エミュの画面でジェムコラプトを開いている時は null = どちらも選ばない)
  - その画面だけのタブ (エミュのジェムコラプト・アプリのチュートリアル) は既定の slot で後ろに足す
  - 並びは エミュレーター / シミュレーター / デイリー / (slot = ジェムコラプト) / コスメティック (2026-10-25 オーナー「ここの右端が良いな、目立たんし」「コスメが端かな」
    「デイリーの右に将来追加するジェムコラプト置こうか」、ヘッダーから移した)。デイリー・コスメティックは開発版だけ (スイッチ daily・skins)。
    スマホは 1 段に 3 つまで折り返して余った段は広げる (2 つなら 2 列・5 つなら 3 + 2)、狭い PC は折り返す
  使い方: <ModeTabs @pick="(m) => …画面の後片付け" ><button class="g-tab">…</button></ModeTabs>
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { DAILY_ON, PAGES_ON, TREE_ON, treePage } from "../../state/web-page";
import { closeTreePage, openDailyPage, openSkinsPage, openTreePage, page, SKINS_ON } from "../../web/page";
import { flag } from "../../web/release-flags";

type Mode = "hand" | "sim";
const props = defineProps<{ active?: Mode | null }>();
const emit = defineEmits<{ pick: [Mode] }>();

/** 本番 (スイッチ modeTabs が切れている間) はベースのページに帯を出さない (前は帯ごと隠していた) */
const shown = computed(() => flag("modeTabs") || page.value !== "page=base");
const on = computed((): Mode | null => (props.active !== undefined ? props.active : treePage.value ? "sim" : "hand"));
function pick(m: Mode): void {
  if (m === "sim") {
    openTreePage("base");
    emit("pick", m);
  } else closeTreePage(() => emit("pick", m));
}
/** 右端の小さいタブ (コスメティック・デイリー)。Web だけ */
const EXTRA = PAGES_ON && (SKINS_ON || DAILY_ON);
const TAB_S = "g-tab min-w-[120px] !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]";
const TAB = "g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]";
</script>

<template>
  <!-- スマホは 1 段に 3 つまで折り返し、余った段は広げて埋める (2 つなら 2 列・5 つなら 3 + 2、空き枠を出さない。オーナー 10-25「2 列にしてから出して」)。slot のタブにも効くよう子に付ける -->
  <div v-if="shown" data-mode-tabs class="inline-flex flex-wrap gap-1 max-md:flex max-md:w-full" :class="EXTRA ? 'max-md:[&>*]:!grow max-md:[&>*]:!basis-[calc((100%-0.5rem)/3)]' : ''" role="tablist">
    <button type="button" role="tab" data-mode-tab="hand" :aria-selected="on === 'hand'" :class="[TAB, on === 'hand' ? 'on' : '']" @click="pick('hand')">{{ tr("エミュレーター", "Emulator") }}</button>
    <button v-if="TREE_ON" type="button" role="tab" data-mode-tab="sim" :aria-selected="on === 'sim'" :class="[TAB, 'max-md:!hidden', on === 'sim' ? 'on' : '']" @click="pick('sim')">
      {{ tr("シミュレーター", "Simulator") }}<span class="text-[10px] font-normal opacity-70" :title="tr('作り込み中の機能', 'Still in development')">β</span>
    </button>
    <button v-if="EXTRA && DAILY_ON" type="button" role="tab" data-mode-tab="daily" :aria-selected="false" :class="TAB_S" @click="openDailyPage()">{{ tr("デイリー", "Daily") }}</button>
    <slot />
    <button v-if="EXTRA && SKINS_ON" type="button" role="tab" data-mode-tab="skins" :aria-selected="false" :class="TAB_S" @click="openSkinsPage">{{ tr("コスメティック", "Cosmetics") }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import CurrencyRanking from "../views/CurrencyRanking.vue";
import BuildCopy from "../views/BuildCopy.vue";
import Settings from "../views/Settings.vue";
import PobLauncher from "../views/PobLauncher.vue";
// 2026-10-03 統合: ヴァールの天秤の 4 画面 (Overquality / GemCorrupt / GemWatch / RareCraft) は VaalScales.vue のタブ、
// 上位プレイヤー MOD 一覧 (CraftDiscoveryV2B) はクラフト計算機 (HtcCraftLab) のタブ。ゲームログ診断 (ClientLog) は削除
import VaalScales from "../views/VaalScales.vue";
import HtcCraftLab from "../views/htc-craft/HtcCraftLab.vue";
import TradeHistory from "../views/TradeHistory.vue";
import CraftStage from "../views/craft-stage/CraftStage.vue";
import MtxList from "../views/mtx/MtxList.vue";
import PobCheck from "../views/pob-check/PobCheck.vue";
// 旧「クラフト発見」(econ-trending) は 2026-05-22 に非表示。
// 復活時は次の 2 行を戻すだけで OK:
//   import EconDashboard from "../views/EconDashboard.vue";
//   <EconDashboard v-else-if="activeNav === 'econ-trending'" />

const props = defineProps<{ activeNav: string }>();

// 2026-05-22: <keep-alive> でナビ切替時にコンポーネントを unmount せず、
// 通貨ランキング ↔ 発見V2 を行き来しても再 fetch されないようメモリ保持する。
const currentView = computed<Component | undefined>(() => {
  switch (props.activeNav) {
    // ユニーク装備価格推移 (旧 unique-trend) は 2026-10-03 からカレンシーランキングのタブ
    case "econ-currency":
      return CurrencyRanking;
    case "build-copy":
      return BuildCopy;
    case "settings":
      return Settings;
    case "pob-check":
      return PobCheck;
    case "pob":
      return PobLauncher;
    case "vaal-scales":
      return VaalScales;
    case "htc-craft":
      return HtcCraftLab;
    case "trade-history":
      return TradeHistory;
    case "mtx":
      return MtxList;
    case "craft-stage":
      return CraftStage;
    default:
      return undefined;
  }
});
</script>

<template>
  <!-- 2026-09-12 オーナー指示: 画面内スクロールは無し、アプリ全体 (main) だけがスクロールする -->
  <main class="flex-1 overflow-y-auto">
    <keep-alive>
      <component :is="currentView" />
    </keep-alive>
  </main>
</template>

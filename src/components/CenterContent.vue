<script setup lang="ts">
import { computed, type Component } from "vue";
import CurrencyRanking from "../views/CurrencyRanking.vue";
import CraftDiscoveryV2B from "../views/CraftDiscoveryV2B.vue";
import Settings from "../views/Settings.vue";
// 旧「クラフト発見」(econ-trending) は 2026-05-22 に非表示。
// 復活時は次の 2 行を戻すだけで OK:
//   import EconDashboard from "../views/EconDashboard.vue";
//   <EconDashboard v-else-if="activeNav === 'econ-trending'" />

const props = defineProps<{ activeNav: string }>();

// 2026-05-22: <keep-alive> でナビ切替時にコンポーネントを unmount せず、
// 通貨ランキング ↔ 発見V2 を行き来しても再 fetch されないようメモリ保持する。
const currentView = computed<Component | undefined>(() => {
  switch (props.activeNav) {
    case "econ-currency":
      return CurrencyRanking;
    case "craft-v2":
      return CraftDiscoveryV2B;
    case "settings":
      return Settings;
    default:
      return undefined;
  }
});
</script>

<template>
  <main class="flex-1 overflow-hidden">
    <keep-alive>
      <component :is="currentView" />
    </keep-alive>
  </main>
</template>

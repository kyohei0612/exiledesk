<script setup lang="ts">
import { onMounted, ref } from "vue";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";
import UpdateToast from "./components/UpdateToast.vue";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
import { ensureCraftV2Started } from "./state/craft-v2-store";

const activeNav = ref<string>("econ-currency");

// Phase A.8: グローバルナビ系 (Ctrl+1/2, Ctrl+,, Ctrl+Q) を bind。
// 画面固有系 (/, ↑↓, s, r, f) は registerHandler を経由して
// 各画面側 (CurrencyRanking / EconDashboard) から差し込む。
useKeyboardShortcuts({ activeNav });

// 2026-05-23 シームレス徹底:
//   起動時に MOD 一覧 (クラフト発見 V2) の fetch を背景で開始する。
//   ユーザーが MOD 一覧画面を開かなくても、勝手にキャッシュ即時表示 → 差分更新が走るので
//   画面遷移時に「取得待ち」が発生しにくい。
//   `ensureCraftV2Started` は冪等 (initialBootStarted ガード) なので、複数回呼んでも安全。
onMounted(() => {
  void ensureCraftV2Started();
});
</script>

<template>
  <div class="flex h-screen w-screen">
    <LeftSidebar
      :active="activeNav"
      @update:active="activeNav = $event"
      class="w-52 shrink-0 border-r border-[var(--exile-color-border-subtle)]"
    />

    <CenterContent :active-nav="activeNav" class="flex-1" />

    <UpdateToast />
  </div>
</template>

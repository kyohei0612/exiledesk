<script setup lang="ts">
import { ref } from "vue";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";
import UpdateToast from "./components/UpdateToast.vue";
import { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";

const activeNav = ref<string>("econ-currency");

// Phase A.8: グローバルナビ系 (Ctrl+1/2, Ctrl+,, Ctrl+Q) を bind。
// 画面固有系 (/, ↑↓, s, r, f) は registerHandler を経由して
// 各画面側 (CurrencyRanking / EconDashboard) から差し込む。
useKeyboardShortcuts({ activeNav });
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

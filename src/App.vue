<script setup lang="ts">
import { ref } from "vue";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";
import RightChatPanel from "./components/RightChatPanel.vue";

const activeNav = ref<string>("chat");
const chatVisible = ref(true);
</script>

<template>
  <div class="flex h-screen w-screen">
    <LeftSidebar
      :active="activeNav"
      @update:active="activeNav = $event"
      class="w-56 shrink-0 border-r border-[var(--color-border)]"
    />

    <CenterContent :active-nav="activeNav" class="flex-1" />

    <RightChatPanel
      v-show="chatVisible"
      class="w-96 shrink-0 border-l border-[var(--color-border)]"
      @close="chatVisible = false"
    />

    <button
      v-if="!chatVisible"
      @click="chatVisible = true"
      class="fixed right-4 bottom-4 w-12 h-12 rounded-full bg-[var(--color-accent)] text-black text-xl shadow-lg hover:bg-[var(--color-accent-hover)] hover:scale-105 transition"
      aria-label="秘書チャットを開く"
    >
      🤖
    </button>
  </div>
</template>

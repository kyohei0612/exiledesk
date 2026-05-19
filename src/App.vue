<script setup lang="ts">
import { ref } from "vue";
import LeftSidebar from "./components/LeftSidebar.vue";
import CenterContent from "./components/CenterContent.vue";

const activeNav = ref<string>("econ-currency");
</script>

<template>
  <div class="flex h-screen w-screen">
    <LeftSidebar
      :active="activeNav"
      @update:active="activeNav = $event"
      class="w-56 shrink-0 border-r border-[var(--color-border)]"
    />

    <CenterContent :active-nav="activeNav" class="flex-1" />
  </div>
</template>

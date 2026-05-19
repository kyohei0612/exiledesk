<script setup lang="ts">
import CurrencyRanking from "../views/CurrencyRanking.vue";
import CraftHelper from "../views/CraftHelper.vue";
import EconDashboard from "../views/EconDashboard.vue";

defineProps<{ activeNav: string }>();
</script>

<template>
  <main class="flex-1 overflow-hidden">
    <CurrencyRanking v-if="activeNav === 'econ-currency'" />
    <EconDashboard v-else-if="activeNav === 'econ-trending'" />
    <CraftHelper v-else-if="activeNav === 'tool-craft'" />
  </main>
</template>

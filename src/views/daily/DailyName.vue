<!-- DailyName.vue — 名前と先週のタグ (D-54)。名前を出す所はどこもこれを通す -->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { lastWeekPlace } from "./daily-api";

const props = defineProps<{ name: string }>();
const place = computed(() => lastWeekPlace(props.name));
const tag = computed(() => (place.value === 1 ? tr("週間王者", "Weekly champion") : place.value && place.value <= 10 ? tr(`週間 ${place.value} 位`, `Weekly #${place.value}`) : null));
</script>

<template>
  <span class="min-w-0 break-words">{{ name }}<span v-if="tag" data-daily-tag class="daily-tag" :class="place === 1 ? 'top' : ''">{{ tag }}</span></span>
</template>

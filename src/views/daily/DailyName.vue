<!-- DailyName.vue — 名前と称号の札 (D-54)。札は本人が選んだ称号、選んでいなければ格の一番高い物。名前を出す所はどこもこれを通す -->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { titleOfName } from "./daily-api";

const props = defineProps<{ name: string; stamp?: number }>();
const title = computed(() => { void props.stamp; return titleOfName(props.name); });
</script>

<template>
  <span class="min-w-0 break-words">{{ name }}<span v-if="title" data-daily-tag class="daily-tag" :class="title.rank >= 10 ? 'top' : ''">{{ tr(title.ja, title.en) }}</span></span>
</template>

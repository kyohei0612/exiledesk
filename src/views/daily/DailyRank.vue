<!-- DailyRank.vue — お題の順位 (D-50)。手・木は見せない。見本の間は見本と書く -->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { rankOf, type DailyTopic } from "./daily-api";
import DailyName from "./DailyName.vue";

const props = defineProps<{ topic: DailyTopic }>();
const rows = computed(() => rankOf(props.topic.id).slice(0, 10));
const mins = (ms: number): string => tr(`${Math.round(ms / 60_000)} 分`, `${Math.round(ms / 60_000)}m`);
</script>

<template>
  <div data-daily-rank class="min-w-0">
    <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("一番安く作った人", "Cheapest crafts") }}</h3></div>
    <ol v-if="rows.length">
      <li v-for="(r, i) in rows" :key="r.name" class="daily-rank-row" :class="r.me ? 'me' : ''">
        <span class="daily-place">{{ i + 1 }}</span>
        <DailyName class="flex-1" :name="r.name" />
        <span class="daily-num w-12">{{ mins(r.ms) }}</span>
        <span class="daily-num w-10">{{ r.rate }}%</span>
        <b class="daily-num daily-points w-16">{{ r.cost }} {{ tr("神", "div") }}</b>
      </li>
    </ol>
    <p v-else class="text-[14px] opacity-70">{{ tr("まだ誰も解決していない。最初の 1 人になれる。", "No one has solved this yet.") }}</p>
  </div>
</template>

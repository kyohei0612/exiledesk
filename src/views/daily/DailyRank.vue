<!-- DailyRank.vue — お題の順位 (D-50)。手・木は見せない。見本の間は見本と書く -->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { rankOf, type DailyTopic } from "./daily-api";

const props = defineProps<{ topic: DailyTopic }>();
const rows = computed(() => rankOf(props.topic.id).slice(0, 10));
const mins = (ms: number): string => tr(`${Math.round(ms / 60_000)} 分`, `${Math.round(ms / 60_000)}m`);
</script>

<template>
  <div data-daily-rank class="min-w-0">
    <h3 class="g-brush mb-2 text-[20px] text-[var(--exile-color-text-title)]">{{ tr("一番安く作った人", "Cheapest crafts") }}</h3>
    <ol v-if="rows.length" class="text-[14px]">
      <li v-for="(r, i) in rows" :key="r.name" class="daily-rank-row" :class="r.me ? 'me' : ''">
        <span class="w-6 tabular-nums opacity-60">{{ i + 1 }}</span>
        <span class="min-w-0 flex-1 break-words">{{ r.name }}</span>
        <span class="w-14 text-right tabular-nums opacity-60">{{ mins(r.ms) }}</span>
        <span class="w-12 text-right tabular-nums opacity-60">{{ r.rate }}%</span>
        <b class="w-20 text-right font-normal tabular-nums text-[var(--exile-color-text-title)]">{{ r.cost }} {{ tr("神", "div") }}</b>
      </li>
    </ol>
    <p v-else class="text-[14px] opacity-70">{{ tr("まだ誰も解決していない。最初の 1 人になれる。", "No one has solved this yet.") }}</p>
    <p v-if="topic.sample" class="mt-2 text-[12px] opacity-50">{{ tr("順位の相手は見本", "Other names are samples") }}</p>
  </div>
</template>

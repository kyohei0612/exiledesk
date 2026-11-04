<!-- DailyRank.vue — お題の順位 (D-50)。締めた日は行を押すとその人のレシピをシミュで開く (D-50b)、今日の分は 16:00 に締めるまで見せない -->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { rankOf, type DailyTopic } from "./daily-api";
import { useRankRecipe } from "./daily-open";
import DailyName from "./DailyName.vue";

const props = defineProps<{ topic: DailyTopic }>();
const rows = computed(() => rankOf(props.topic.id).slice(0, 10));
/** 締めた日 (狙いが見える日) だけレシピを開ける */
const closed = computed(() => !!props.topic.aims);
const mins = (ms: number): string => tr(`${Math.round(ms / 60_000)} 分`, `${Math.round(ms / 60_000)}m`);
const { busy, failed, open } = useRankRecipe();
</script>

<template>
  <div data-daily-rank class="min-w-0">
    <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("一番安く作った人", "Cheapest crafts") }}</h3></div>
    <p class="daily-rank-what">{{ closed ? tr(`${topic.day} のお題の順位。解決した人を 1 個の費用の安い順`, `Ranking for ${topic.day}: solved crafts, cheapest per item first`) : tr("今日のお題の順位。解決した人を 1 個の費用の安い順", "Today's ranking: solved crafts, cheapest per item first") }}</p>
    <template v-if="rows.length">
      <p class="daily-cols" aria-hidden="true"><span class="flex-1">{{ tr("名前", "Name") }}</span><span class="w-12">{{ tr("時間", "Time") }}</span><span class="w-10">{{ tr("完成率", "Done") }}</span><span class="w-16">{{ tr("1 個の費用", "Cost") }}</span></p>
      <ol>
        <li v-for="(r, i) in rows" :key="r.name" class="daily-rank-row" :class="r.me ? 'me' : ''">
          <component :is="closed ? 'button' : 'div'" :type="closed ? 'button' : undefined" class="daily-rank-in" :class="closed ? 'link' : ''" :disabled="closed && !!busy" :data-daily-rank-open="closed ? r.name : undefined"
            :title="closed ? tr(`${r.name} のレシピをシミュレーターで開く`, `Open ${r.name}'s recipe in the Simulator`) : undefined" @click="closed && open(topic.id, r.name, topic.day)">
            <span class="daily-place">{{ i + 1 }}</span>
            <DailyName class="flex-1" :name="r.name" />
            <span class="daily-num w-12">{{ mins(r.ms) }}</span>
            <span class="daily-num w-10">{{ r.rate }}%</span>
            <b class="daily-num daily-points w-16">{{ busy === r.name ? tr("開いている", "Opening") : `${r.cost} ${tr("神", "div")}` }}</b>
          </component>
        </li>
      </ol>
      <p v-if="failed" data-daily-rank-fail class="mt-1 text-[13px] text-[var(--exile-color-signal-down)]">{{ tr(`${failed} のレシピを開けなかった (木が残っていない)`, `Couldn't open ${failed}'s recipe (no tree saved)`) }}</p>
      <p class="mt-2 text-[13px] opacity-70">{{ closed ? tr("行を押すと、その人のレシピをシミュレーターで開く (写しなので元は変わらない)", "Click a row to open that recipe in the Simulator (a copy; the original stays)") : tr("レシピは 16:00 に締めた後で見られる", "Recipes open after the 16:00 close") }}</p>
    </template>
    <p v-else class="text-[14px] opacity-70">{{ closed ? tr("この日は解決した人がいない。", "No one solved this day.") : tr("まだ誰も解決していない。最初の 1 人になれる。", "No one has solved this yet.") }}</p>
  </div>
</template>

<!--
  DailyHero.vue — お題の顔 (一覧の今日のお題・お題のページ)。伏せたままベースと MOD の数だけ出す (D-32b)。
  スタートは挑戦のページへ。ニックネームが無ければ先に決める (D-51)。幅 1280 未満は今は挑戦できない (D-70、シミュの PC の木の境)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { usePhone } from "../../utils/use-phone";
import { openDailyPage } from "../../web/page";
import { getTry, leftMs, myNick, SOLVE_RATE, type DailyTopic } from "./daily-api";
import DailyNick from "./DailyNick.vue";
import DailyRank from "./DailyRank.vue";

const props = defineProps<{ topic: DailyTopic; today?: boolean; now: number }>();
const phone = usePhone();
const art = computed(() => baseArt(props.topic.base));
const name = computed(() => tr(props.topic.baseJa, props.topic.base));
const t = computed(() => getTry(props.topic.id));
const left = computed(() => (t.value ? leftMs(t.value, props.now) : 0));
const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const asking = ref(false);
const go = (): void => openDailyPage({ view: "start", q: props.topic.id });
const start = (): void => { if (t.value || myNick()) go(); else asking.value = true; };
const label = computed(() => (!t.value ? tr("1 時間の挑戦を始める", "Start the 1 hour challenge") : left.value > 0 ? tr(`続ける (残り ${clock(left.value)})`, `Continue (${clock(left.value)} left)`) : tr("木を見る", "View your tree")));
</script>

<template>
  <section data-daily-hero class="daily-hero">
    <div class="min-w-0">
      <h2 class="g-brush daily-hero-title">{{ today ? tr("今日のお題", "Today's challenge") : tr(`${topic.day} のお題`, `Challenge of ${topic.day}`) }}</h2>
      <div class="daily-veil">
        <img v-if="art" :src="art" alt="" class="daily-veil-art" :class="t ? 'open' : ''" />
        <div class="min-w-0">
          <p class="name daily-veil-name">{{ name }}</p>
          <p class="text-[14px] opacity-70">{{ tr(`狙う MOD ${topic.modCount} つ、アイテムレベル ${topic.ilvl}`, `${topic.modCount} target mods, item level ${topic.ilvl}`) }}</p>
          <p class="text-[14px] opacity-70">{{ tr(`${topic.tries} 人が挑戦`, `${topic.tries} tries`) }}</p>
        </div>
      </div>
      <template v-if="phone"><p data-daily-pc-only class="text-[14px] opacity-80">{{ tr("挑戦は幅の広い画面で", "Open on a wider screen to take the challenge") }}</p></template>
      <template v-else>
        <button type="button" class="g-btn-red daily-start" data-daily-start @click="start">{{ label }}</button>
        <p v-if="!t" class="mt-2 text-[13px] opacity-60">{{ tr("押すとお題の MOD が開き、時間が動き出す。止められない。", "Pressing reveals the target mods and the clock starts. It can't be paused.") }}</p>
        <p v-else-if="t.best" data-daily-solved class="mt-2 text-[14px]">{{ tr(`解決済み: ${t.best.cost} 神 (完成率 ${t.best.rate}%)`, `Solved: ${t.best.cost} div (${t.best.rate}% finished)`) }}</p>
        <p v-else-if="t.last" class="mt-2 text-[14px] opacity-80">{{ tr(`未解決: 完成率 ${t.last.rate}% (${SOLVE_RATE}% で解決)`, `Unsolved: ${t.last.rate}% finished (${SOLVE_RATE}% solves it)`) }}</p>
      </template>
    </div>
    <DailyRank :topic="topic" />
    <DailyNick v-if="asking" @done="asking = false; go()" @close="asking = false" />
  </section>
</template>

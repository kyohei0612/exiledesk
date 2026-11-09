<!--
  DailyHero.vue — お題の顔 (一覧の今日のお題・お題のページ)。今日のお題は伏せたままベースと MOD の数だけ、締めた日は MOD も全部出す (D-32b、完成形のカード D-37e)。
  スタートは今日のお題だけ、14:50 まで、1 日 1 回 (D-01・D-33)。ニックネームが無ければ先に決める (D-51)。幅 1280 未満は今は挑戦できない (D-70、シミュの PC の木の境)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { usePhone } from "../../utils/use-phone";
import { goDaily } from "./daily-open";
import { canStartAt, getTry, leftMs, myNick, SLOT_NAMES, type DailyTopic } from "./daily-api";
import DailyAimCard from "./DailyAimCard.vue";
import DailyGiveUpAsk from "./DailyGiveUpAsk.vue";
import DailyNick from "./DailyNick.vue";
import DailyRank from "./DailyRank.vue";

const props = defineProps<{ topic: DailyTopic; today?: boolean; now: number }>();
const phone = usePhone();
const art = computed(() => baseArt(props.topic.base));
const name = computed(() => tr(props.topic.baseJa, props.topic.base));
const slot = computed(() => SLOT_NAMES[props.topic.slot] ?? null);
const t = computed(() => getTry(props.topic.id));
const left = computed(() => (t.value ? leftMs(t.value, props.now) : 0));
const closed = computed(() => !!props.topic.aims);
const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const asking = ref(false);
/** 続けられる挑戦がある (時間が残り、諦めていない) */
const going = computed(() => !!t.value && left.value > 0 && !t.value.ended);
const giving = ref(false);
const go =(): void => goDaily({ view: "start", q: props.topic.id });
const start = (): void => { if (t.value || myNick()) go(); else asking.value = true; };
/** 押せる物: 始める (今日・14:50 まで) / 続ける (残りがある) / 木を見る (自分の挑戦がある) / 無し */
const action = computed(() => {
  // 木を開く前に諦めた (今日の順位のレシピを見た、D-50c) 時は見る木が無い
  if (t.value?.ended && !t.value.fractured) return null;
  if (t.value) return left.value > 0 && !t.value.ended ? tr(`続ける (残り ${clock(left.value)})`, `Continue (${clock(left.value)} left)`) : tr("自分の木を見る", "View your tree");
  return props.today && !closed.value && canStartAt(props.now) ? tr("1 時間の挑戦を始める", "Start the 1 hour challenge") : null;
});
</script>

<template>
  <section data-daily-hero class="daily-hero">
    <h2 class="daily-title">{{ today ? tr("今日のお題", "Today's challenge") : tr(`${topic.day} のお題`, `Challenge of ${topic.day}`) }}</h2>
    <div class="daily-hero-main">
      <div class="daily-veil">
        <span class="daily-veil-frame"><img v-if="art" :src="art" alt="" class="daily-veil-art" :class="t || closed ? 'open' : ''" /></span>
        <div class="min-w-0">
          <div class="daily-plate"><p class="daily-veil-name">{{ name }}</p></div>
          <p class="daily-meta">{{ tr(`狙う MOD ${topic.modCount} つ、アイテムレベル ${topic.ilvl}`, `${topic.modCount} target mods, item level ${topic.ilvl}`) }}<template v-if="slot">{{ tr(`、${slot.ja}の日`, `, ${slot.en} day`) }}</template></p>
          <p v-if="topic.fromBox" class="daily-meta">{{ tr("クラフトボックスの投稿から", "From the craft box") }}</p>
        </div>
      </div>
      <!-- 締めた日は狙いを完成形のカードで (D-37e)。今日のお題は伏せたまま (D-32b) -->
      <DailyAimCard v-if="topic.aims" data-daily-aims :base="topic.base" :ilvl="topic.ilvl" :aims="topic.aims" />
      <template v-if="phone">
        <p v-if="closed" data-daily-closed class="daily-sub">{{ tr("この日は締めた。お題と順位は見られるが、挑戦はできない。", "This day is closed. You can see the challenge and ranking, but not take it.") }}</p>
        <p v-else data-daily-pc-only class="text-[14px] opacity-80">{{ tr("挑戦は幅の広い画面 (PC) で", "Open on a wider screen (PC) to take the challenge") }}</p>
      </template>
      <template v-else>
        <div v-if="action" class="daily-start-row">
          <button type="button" class="g-btn-red daily-start" data-daily-start @click="start">{{ action }}</button>
          <!-- 続けられる間は横に諦める (D-37f、帯と同じ窓) -->
          <button v-if="going" type="button" class="g-btn daily-start-giveup" data-daily-hero-giveup @click="giving = true">{{ tr("諦める", "Give up") }}</button>
        </div>
        <p v-if="!t && closed" data-daily-closed class="daily-sub">{{ tr("この日は締めた。お題と順位は見られるが、挑戦はできない。", "This day is closed. You can see the challenge and ranking, but not take it.") }}</p>
        <p v-else-if="!t && today && !action" data-daily-closed class="daily-sub">{{ tr("今日のスタートは 14:50 で締めた。次のお題は 16:00。", "Today's start closed at 14:50. The next challenge opens at 16:00.") }}</p>
        <p v-else-if="!t" class="daily-sub">{{ tr("押すとお題の MOD が開き、1 時間が動き出す。ページを閉じても止まらない。挑戦は 1 日 1 回。", "Pressing reveals the target mods and starts 1 hour. Closing the page doesn't stop it. One try per day.") }}</p>
        <p v-else-if="t.ended && !t.fractured && !t.last" data-daily-gave-up class="daily-sub">{{ tr("今日の挑戦は諦めた。次のお題は 16:00。", "You gave up today's challenge. The next one opens at 16:00.") }}</p>
        <p v-else-if="t.best" data-daily-solved class="mt-2 text-[14px]">{{ tr(`提出済み: 完成 1 個あたり ${t.best.cost} 神 (完成率 ${t.best.rate}%)`, `Submitted: ${t.best.cost} div per finished item (${t.best.rate}% finished)`) }}</p>
        <p v-else-if="t.last" class="mt-2 text-[14px] opacity-80">{{ tr(`順位に載らない記録: 完成率 ${t.last.rate}%`, `Not ranked: ${t.last.rate}% finished`) }}</p>
      </template>
    </div>
    <DailyRank :topic="topic" />
    <DailyNick v-if="asking" @done="asking = false; go()" @close="asking = false" />
    <DailyGiveUpAsk v-if="going" :id="topic.id" :open="giving" @close="giving = false" @done="giving = false" />
  </section>
</template>

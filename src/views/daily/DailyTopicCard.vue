<!--
  DailyTopicCard.vue — お題のカード (デイリーのモック、2026-10-22)。
  big = 今日のお題・お題の中身 (MOD の一覧・自分の結果・挑戦する)、small = 溜まった未解決の格子の 1 枚 (押すとお題の中身へ)
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../services/craft-stage/base-art";
import { SOLVE_RATE, type DailyTopic } from "./daily-mock";
import DailyModList from "./DailyModList.vue";
import DailyMine from "./DailyMine.vue";

const props = defineProps<{ topic: DailyTopic; big?: boolean; today?: boolean }>();
const emit = defineEmits<{ (e: "open"): void; (e: "start"): void }>();
const art = computed(() => baseArt(props.topic.base.en));
const name = computed(() => tr(props.topic.base.ja, props.topic.base.en));
const mineSolved = computed(() => !!props.topic.mine && props.topic.mine.rate >= SOLVE_RATE);
</script>

<template>
  <!-- 大きいカード -->
  <article v-if="big" data-daily-topic :data-daily-id="topic.id" class="min-w-0">
    <div class="flex min-w-0 items-start gap-4 max-md:gap-3">
      <img v-if="art" :src="art" alt="" class="size-20 shrink-0 object-contain max-md:size-14" draggable="false" />
      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-2">
          <span v-if="today" class="rounded-sm bg-red-700/60 px-1.5 text-[11px] font-bold text-red-50">{{ tr("今日のお題", "Today") }}</span>
          <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ topic.day }} · {{ tr(`投稿 ${topic.by}`, `by ${topic.by}`) }}</span>
        </p>
        <h2 class="mt-0.5 min-w-0 break-words text-[20px] text-[var(--exile-color-text-title)] max-md:text-[17px]">{{ name }}</h2>
        <p class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr(`アイテムレベル ${topic.base.ilvl}`, `Item Level ${topic.base.ilvl}`) }}</p>
      </div>
    </div>

    <DailyModList class="mt-3" :mods="topic.mods" />

    <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--exile-color-text-secondary)]">
      <span>{{ tr(`解決 = 完成率 ${SOLVE_RATE * 100}% 以上`, `Solve = ${SOLVE_RATE * 100}%+ complete`) }}</span>
      <span class="tabular-nums">{{ tr(`挑戦 ${topic.tries} 人 · 解決 ${topic.solved} 人`, `${topic.tries} tried · ${topic.solved} solved`) }}</span>
      <span class="tabular-nums">{{ topic.best == null ? tr("まだ誰も解決していない", "Unsolved by everyone") : tr(`最安 ${topic.best.toFixed(1)} 神`, `Best ${topic.best.toFixed(1)} div`) }}</span>
    </p>

    <div class="mt-3 flex min-w-0 items-stretch gap-3 max-md:flex-col">
      <DailyMine :topic="topic" class="flex-1" />
      <div class="flex shrink-0 flex-col justify-center gap-2 max-md:flex-row">
        <button type="button" data-daily-start class="g-btn g-btn-red min-w-40 max-md:min-h-11 max-md:flex-1" @click="emit('start')">{{ topic.mine ? tr("もう一度挑戦", "Try again") : tr("挑戦する", "Start") }}</button>
        <button v-if="today" type="button" data-daily-open class="g-btn sm max-md:min-h-11 max-md:flex-1" @click="emit('open')">{{ tr("お題の中身 →", "Details →") }}</button>
      </div>
    </div>
  </article>

  <!-- 小さいカード (溜まった未解決) -->
  <button v-else type="button" data-daily-topic :data-daily-id="topic.id" class="flex w-full min-w-0 items-center gap-3 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-left hover:border-[var(--exile-color-border-brass)] max-md:py-2.5" @click="emit('open')">
    <img v-if="art" :src="art" alt="" class="size-11 shrink-0 object-contain" draggable="false" />
    <span class="min-w-0 flex-1">
      <span class="flex min-w-0 items-center gap-2">
        <b class="min-w-0 truncate text-[14px] text-[var(--exile-color-text-primary)]">{{ name }}</b>
        <span class="shrink-0 text-[11px] opacity-55">{{ topic.day }}</span>
      </span>
      <span class="block break-words text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">
        {{ tr(`狙い ${topic.mods.length}`, `${topic.mods.length} mods`) }} · {{ tr(`挑戦 ${topic.tries}`, `${topic.tries} tried`) }} · {{ topic.best == null ? tr("未解決", "Unsolved") : tr(`最安 ${topic.best.toFixed(1)} 神`, `Best ${topic.best.toFixed(1)} div`) }}
      </span>
    </span>
    <span v-if="topic.mine" class="shrink-0 rounded-sm px-1.5 text-[11px] font-bold" :class="mineSolved ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/15 text-amber-200'">{{ mineSolved ? tr("解決", "Solved") : tr(`${Math.round(topic.mine.rate * 100)}%`, `${Math.round(topic.mine.rate * 100)}%`) }}</span>
  </button>
</template>

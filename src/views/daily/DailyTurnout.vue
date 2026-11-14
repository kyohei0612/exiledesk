<!--
  DailyTurnout.vue — 順位の欄の数の帯と諦めた人の一覧 (D-50g・D-50f、スイッチ dailyTurnout)。数は server/live の turnout.ts が数えて /daily.json の topic に載せる。
  古いサーバー (turnout・out が無い) の間は何も出さない。帯 = 頭、一覧 = 順位の下 (where で出し分け)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import type { DailyTopic } from "./daily-api";

const props = defineProps<{ topic: DailyTopic; where: "head" | "list"; closed: boolean; /** 挑戦前のぼかし (D-50)。諦めた人の時間もぼかす */ veiled: boolean }>();
const c = computed(() => props.topic.turnout ?? null);
/** 帯の内訳。0 の項目は出さない (締めた日は挑戦中が必ず 0) */
const parts = computed(() => {
  const t = c.value;
  if (!t) return [];
  return [
    { n: t.submitted, ja: "提出", en: "submitted" },
    { n: t.gaveUp, ja: "諦め", en: "gave up" },
    { n: t.timeout, ja: "時間切れ", en: "timed out" },
    { n: t.playing, ja: "挑戦中", en: "playing" },
  ].filter((p) => p.n > 0);
});

/** 諦めた人は名前を出さず上から A・B・C… (Z の次は AA)。オーナー 11-14「匿名性がいいから失敗エグザイルA で表示。あるふぁべっど順で上から」 */
const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letter(Math.floor(i / 26) - 1) + letter(i % 26));
const SHOW = 5;
const all = ref(false);
const rows = computed(() => props.topic.out ?? []);
const shown = computed(() => (all.value ? rows.value : rows.value.slice(0, SHOW)));
const mins = (ms: number): number => Math.max(1, Math.round(ms / 60_000));
</script>

<template>
  <p v-if="where === 'head' && c && c.tried > 0" class="daily-turnout" data-daily-turnout>
    <b>{{ closed ? tr(`この日の挑戦 ${c.tried} 人`, `${c.tried} took this one`) : tr(`今日の挑戦 ${c.tried} 人`, `${c.tried} taking today's`) }}</b>
    <span v-for="p in parts" :key="p.ja">{{ tr(`${p.ja} ${p.n}`, `${p.n} ${p.en}`) }}</span>
  </p>
  <div v-else-if="where === 'list' && rows.length" class="daily-out" data-daily-out>
    <div class="g-sec-head"><h4 class="daily-out-title">{{ tr(`諦めた人 (${rows.length} 人)`, `Gave up (${rows.length})`) }}</h4><span class="g-sec-sub">{{ tr("提出せずに終わった人。順位には入らない", "Ended without submitting. Not ranked") }}</span></div>
    <ol>
      <li v-for="(r, i) in shown" :key="i" class="daily-rank-row daily-out-row">
        <span class="flex-1">{{ tr(`失敗エグザイル${letter(i)}`, `Failed Exile ${letter(i)}`) }}<span v-if="r.timeout" class="daily-out-tag">{{ tr("時間切れ", "Timed out") }}</span></span>
        <span class="daily-num" :class="{ 'daily-veiled': veiled }">{{ veiled ? tr("00 分", "00m") : r.timeout ? tr(`${mins(r.ms)} 分`, `${mins(r.ms)}m`) : tr(`${mins(r.ms)} 分で諦め`, `quit at ${mins(r.ms)}m`) }}</span>
      </li>
    </ol>
    <button v-if="rows.length > SHOW && !all" type="button" class="daily-out-more" data-daily-out-more @click="all = true">{{ tr(`ほか ${rows.length - SHOW} 人`, `${rows.length - SHOW} more`) }}</button>
  </div>
</template>

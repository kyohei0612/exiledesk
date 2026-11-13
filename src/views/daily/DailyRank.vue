<!-- DailyRank.vue — お題の順位 (D-50)。行を押すとその人のレシピをシミュで開く (D-50b)。今日の分は、今日まだ挑戦できる人には先に「見ると諦めた扱い」の窓を通す (D-50c) -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { canStillTry, getTry, myNick, rankByScore, rankOf, type DailyTopic } from "./daily-api";
import { scoreOf } from "./daily-score";
import { flag } from "../../web/release-flags";
import { usePhone } from "../../utils/use-phone";
import { useRankRecipe } from "./daily-open";
import DailyName from "./DailyName.vue";
import DailyNick from "./DailyNick.vue";
import DailyPeekAsk from "./DailyPeekAsk.vue";

const props = defineProps<{ topic: DailyTopic }>();
const rows = computed(() => rankOf(props.topic.id).slice(0, 10));
/** スコアで並べる日 (D-02b)。列はスコアを一番右に足し、スマホは時間の列を外す (名前を潰さない) */
const score = computed(() => rankByScore(props.topic.id));
const phone = usePhone();
const showTime = computed(() => !(score.value && phone.value));
/** 右端の列「閲覧」= そのレシピを開いた人の数 (D-50e、スイッチ dailyViews)。0 人は「—」、今日の分は挑戦前の人にはほかの数と同じくぼかす */
const showViews = flag("dailyViews");
/** 提出の一言 (D-35e、スイッチ dailyNote) を名前の下に小さく 1 行。挑戦前のぼかしの日は一言もぼかす */
const showNote = flag("dailyNote");
/** 挑戦前のぼかし (D-50): 今日のお題でまだ始めていない人は順位と名前だけ。数は画面に置かず仮の字をぼかす */
const veiled = computed(() => score.value && !closed.value && !getTry(props.topic.id));
const num = (real: string, fake: string): string => (veiled.value ? fake : real);
/** 締めた日 (狙いが見える日) か。行はいつも押せる。自分の行は窓なし・諦めの扱いもなしで開く (D-50c、11-11 オーナー「あと自分のレシピクリックして見れないじゃん」) */
const closed = computed(() => !!props.topic.aims);
const canOpen = (_me?: boolean): boolean => true;
const mins = (ms: number): string => tr(`${Math.round(ms / 60_000)} 分`, `${Math.round(ms / 60_000)}m`);
const { busy, failed, open } = useRankRecipe();
/** 窓を出している名前 (D-50c) と、名前を決めてから窓へ進む名前 (諦めの印は名前に置く、D-51) */
const peekName = ref<string | null>(null);
const nickFor = ref<string | null>(null);
function press(name: string, me?: boolean): void {
  if (me || !canStillTry(props.topic.id)) { void open(props.topic.id, name, props.topic.day); return; }
  if (!myNick() && !getTry(props.topic.id)) { nickFor.value = name; return; }
  peekName.value = name;
}
function peeked(): void {
  const name = peekName.value;
  peekName.value = null;
  if (name) void open(props.topic.id, name, props.topic.day);
}
</script>

<template>
  <div data-daily-rank class="min-w-0">
    <!-- 題は短く、数え方は横の説明 (狭い幅では次の行へ回る。題は 1 行の字なので長いと右が切れた、11-11 ブラック 82) -->
    <div class="g-sec-head"><h3 class="g-sec-title">{{ score ? tr("スコアの順位", "Score ranking") : tr("一番安く作った人", "Cheapest crafts") }}</h3><span v-if="score" class="g-sec-sub" data-daily-rank-how>{{ tr("費用 ÷ 完成率、小さいほど上", "cost ÷ finish rate, lower is better") }}</span></div>
    <p v-if="score" class="daily-rank-what" data-daily-rank-score-what>{{ closed ? tr(`${topic.day} のお題の順位。費用は完成 1 個あたり`, `Ranking for ${topic.day}. Cost is per finished item`) : tr("今日のお題の順位。費用は完成 1 個あたり", "Today's ranking. Cost is per finished item") }}</p>
    <p v-else class="daily-rank-what">{{ closed ? tr(`${topic.day} のお題の順位。完成 1 個あたりの費用の安い順`, `Ranking for ${topic.day}: cheapest per finished item first`) : tr("今日のお題の順位。完成 1 個あたりの費用の安い順", "Today's ranking: cheapest per finished item first") }}</p>
    <template v-if="rows.length">
      <p class="daily-cols" aria-hidden="true"><span class="flex-1">{{ tr("名前", "Name") }}</span><span v-if="showTime" class="w-12 daily-rank-time">{{ tr("時間", "Time") }}</span><span class="w-10">{{ tr("完成率", "Done") }}</span><span class="w-16" :class="{ 'daily-rank-cost': score }" :title="tr('完成 1 個あたりの費用', 'Cost per finished item')">{{ tr("1 個あたり", "Per item") }}</span><span v-if="score" class="w-14" :title="tr('1 個あたりの費用 ÷ 完成率。小さいほど上', 'Cost per item ÷ finish rate. Lower is better')">{{ tr("スコア", "Score") }}</span><span v-if="showViews" class="daily-rank-views" :title="tr('このレシピを開いた人の数', 'People who opened this recipe')">{{ tr("閲覧", "Views") }}</span></p>
      <ol>
        <li v-for="(r, i) in rows" :key="r.name" class="daily-rank-row" :class="r.me ? 'me' : ''">
          <component :is="canOpen(r.me) ? 'button' : 'div'" :type="canOpen(r.me) ? 'button' : undefined" class="daily-rank-in" :class="canOpen(r.me) ? 'link' : ''" :disabled="canOpen(r.me) && !!busy" :data-daily-rank-open="canOpen(r.me) ? r.name : undefined"
            :title="canOpen(r.me) ? tr(`${r.name} のレシピをシミュレーターで開く`, `Open ${r.name}'s recipe in the Simulator`) : undefined" @click="canOpen(r.me) && press(r.name, r.me)">
            <span class="daily-place">{{ i + 1 }}</span>
            <DailyName v-if="!showNote || !r.note" class="flex-1" :name="r.name" />
            <span v-else class="daily-rank-who flex-1"><DailyName :name="r.name" /><small class="daily-rank-note" data-daily-rank-note :class="{ 'daily-veiled': veiled }" :title="veiled ? undefined : r.note">「{{ veiled ? tr("ひとことはまだ見えない", "Hidden for now") : r.note }}」</small></span>
            <span v-if="showTime" class="daily-num w-12 daily-rank-time" :class="{ 'daily-veiled': veiled }">{{ num(mins(r.ms), tr("00 分", "00m")) }}</span>
            <span class="daily-num w-10" :class="{ 'daily-veiled': veiled }">{{ num(`${r.rate}%`, "00%") }}</span>
            <component :is="score ? 'span' : 'b'" class="daily-num w-16" :class="[score ? 'daily-rank-cost' : 'daily-points', { 'daily-veiled': veiled }]">{{ busy === r.name ? tr("開いている", "Opening") : num(`${r.cost} ${tr("神", "div")}`, `000.0 ${tr("神", "div")}`) }}</component>
            <b v-if="score" class="daily-num daily-points w-14" data-daily-rank-score :class="{ 'daily-veiled': veiled }">{{ num(String(scoreOf(r.cost, r.rate) ?? "—"), "000.0") }}</b>
            <span v-if="showViews" class="daily-num daily-rank-views" data-daily-rank-views :class="{ 'daily-veiled': veiled }">{{ num(r.views ? String(r.views) : "—", "00") }}</span>
          </component>
        </li>
      </ol>
      <p v-if="failed" data-daily-rank-fail class="mt-1 text-[13px] text-[var(--exile-color-signal-down)]">{{ tr(`${failed} のレシピを開けなかった (木が残っていない)`, `Couldn't open ${failed}'s recipe (no tree saved)`) }}</p>
      <p class="mt-2 text-[13px] opacity-70">{{ closed ? tr("行を押すと、その人のレシピをシミュレーターで開く (写しなので元は変わらない)", "Click a row to open that recipe in the Simulator (a copy; the original stays)") : tr("行を押すとその人のレシピを開く。今日まだ挑戦できる時は、見ると今日の挑戦は諦めた扱いになる", "Click a row to open that recipe. If you can still take today's challenge, viewing it counts as giving up") }}</p>
    </template>
    <p v-else class="text-[14px] opacity-70">{{ closed ? tr("この日は順位に載った人がいない。", "No one was ranked this day.") : tr("まだ誰も提出していない。最初の 1 人になれる。", "No one has submitted yet. You can be the first.") }}</p>
    <DailyPeekAsk :id="topic.id" :name="peekName" @close="peekName = null" @done="peeked" />
    <DailyNick v-if="nickFor" @done="peekName = nickFor; nickFor = null" @close="nickFor = null" />
  </div>
</template>

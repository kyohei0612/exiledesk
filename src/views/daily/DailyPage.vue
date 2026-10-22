<!--
  DailyPage.vue — デイリークラフトチャレンジのページ (2026-10-22 オーナー、今は UI/UX のモック。データは daily-mock.ts だけ)。
  ページは 3 枚 (広告はページで数える、メモ ads-page-model): 一覧 ?page=daily / お題の中身 ?page=daily&q= / フラクチャー選び ?page=daily-start&q=。
  入口・URL・題は web/page.ts (ジン部長)。ここは dailyPage を読んで openDailyPage で移るだけ。
  一覧 = 今日のお題 (大きく) → 溜まった未解決 (月曜 7 時に全部リセット) → 解決したお題 (畳む) → 投稿の入口・後の場所 (ランキングなど)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { tr } from "../../i18n/lang";
import { dailyPage } from "../../state/web-page";
import { closeDailyPage, openDailyPage } from "../../web/page";
import Icon from "../../components/ui/Icon.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import { DAILY_TOPICS, findTopic, SOLVE_RATE, SOLVED_TOPICS, untilRefresh } from "./daily-mock";
import DailyTopicCard from "./DailyTopicCard.vue";
import DailyStart from "./DailyStart.vue";

const view = computed(() => dailyPage.value?.view ?? "list");
const topic = computed(() => findTopic(dailyPage.value?.q ?? null));
const today = DAILY_TOPICS[0]!;
// 溜まった未解決 = 自分がまだ解決していない物 (古い順)。解決した物は「解決したお題」へ
const mineSolved = (t: (typeof DAILY_TOPICS)[number]) => !!t.mine && t.mine.rate >= SOLVE_RATE;
const pending = DAILY_TOPICS.slice(1).filter((t) => !mineSolved(t));
const solved = [...DAILY_TOPICS.slice(1).filter(mineSolved), ...SOLVED_TOPICS];
const solvedOpen = ref(false);

// 次の更新 (毎朝 7 時) と週のリセット (月曜 7 時) までの残り。30 秒ごとに数え直す
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 30_000);
onBeforeUnmount(() => clearInterval(timer));
const left = computed(() => untilRefresh(now.value));
const hm = (ms: number) => { const m = Math.floor(ms / 60_000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const dh = (ms: number) => { const h = Math.floor(ms / 3600_000); return h >= 24 ? tr(`${Math.floor(h / 24)}日 ${h % 24}時間`, `${Math.floor(h / 24)}d ${h % 24}h`) : tr(`${h}時間`, `${h}h`); };

const back = () => (view.value === "list" ? closeDailyPage() : view.value === "start" && topic.value ? openDailyPage({ view: "detail", q: topic.value.id }) : openDailyPage({ view: "list" }));
const backLabel = computed(() => (view.value === "list" ? tr("← クラフトへ戻る", "← Back to craft") : view.value === "start" ? tr("← お題へ戻る", "← Back to challenge") : tr("← 一覧へ戻る", "← Back to list")));
const open = (id: string) => openDailyPage({ view: "detail", q: id });
const start = (id: string) => openDailyPage({ view: "start", q: id });
</script>

<template>
  <section data-daily-page :data-daily-view="view" class="min-w-0 flex-1 p-4 max-md:px-2">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("デイリークラフト", "Daily Craft") }}</h1>
      <button type="button" data-daily-back class="g-btn sm max-md:min-h-10" @click="back">{{ backLabel }}</button>
    </div>

    <!-- 次の更新と週のリセット -->
    <p data-daily-clock class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-[var(--exile-color-text-secondary)]">
      <span class="inline-flex items-center gap-1.5"><Icon name="rotate" class="size-3.5 opacity-70" />{{ tr("次のお題", "Next") }} <b class="tabular-nums text-[var(--exile-color-text-primary)]">{{ hm(left.daily) }}</b> <span class="opacity-60">{{ tr("(毎朝 7:00)", "(7:00 JST daily)") }}</span></span>
      <span class="inline-flex items-center gap-1.5">{{ tr("週のリセット", "Weekly reset") }} <b class="tabular-nums text-[var(--exile-color-text-primary)]">{{ dh(left.weekly) }}</b> <span class="opacity-60">{{ tr("(月曜 7:00)", "(Mon 7:00 JST)") }}</span></span>
      <HelpTip :text="tr('お題は毎朝 7 時に 1 つ増えます。解決されなかったお題は溜まり、月曜 7 時に全部消えます', 'A new challenge is added every day at 7:00 JST. Unsolved ones pile up and are all cleared on Monday at 7:00 JST')" />
    </p>

    <!-- ① 一覧 -->
    <div v-if="view === 'list'" class="g-panel px-4 py-3 max-md:px-3">
      <DailyTopicCard :topic="today" big today @open="open(today.id)" @start="start(today.id)" />

      <div class="g-section mt-5">
        <h3 class="mb-2 flex items-center gap-1.5 text-[14px] text-[var(--exile-color-text-title)]">
          {{ tr(`溜まった未解決 (${pending.length})`, `Unsolved backlog (${pending.length})`) }}
          <span class="text-[11px] font-normal opacity-55">{{ tr("月曜 7:00 に消える", "Cleared Mon 7:00") }}</span>
        </h3>
        <ul data-daily-pending class="grid gap-2 lg:grid-cols-2">
          <li v-for="t in pending" :key="t.id" class="min-w-0"><DailyTopicCard :topic="t" @open="open(t.id)" /></li>
        </ul>
      </div>

      <div class="g-section mt-4">
        <Disclosure v-model:open="solvedOpen" kind="section" persist-key="daily-solved-open">{{ tr(`解決したお題 (${solved.length})`, `Solved (${solved.length})`) }}</Disclosure>
        <ul v-if="solvedOpen" class="mt-2 grid gap-2 lg:grid-cols-2">
          <li v-for="t in solved" :key="t.id" class="min-w-0"><DailyTopicCard :topic="t" @open="open(t.id)" /></li>
        </ul>
      </div>

      <!-- 投稿の入口と後の場所 -->
      <div class="g-section mt-4 grid gap-2 pb-6 md:grid-cols-2">
        <div data-daily-submit class="flex min-w-0 items-center gap-3 rounded-md bg-black/30 px-3 py-2.5">
          <span class="min-w-0 flex-1 text-[13px]">
            <b class="block text-[var(--exile-color-text-primary)]">{{ tr("お題を投稿", "Submit a challenge") }}</b>
            <span class="text-[12px] opacity-60">{{ tr("エミュレーターで作った完成品から。精査の後に出ます", "From an item you made in the Emulator. Goes live after review") }}</span>
          </span>
          <button type="button" class="g-btn sm shrink-0 max-md:min-h-10" disabled>{{ tr("投稿する", "Submit") }}</button>
        </div>
        <div data-daily-later class="flex min-w-0 items-center gap-3 rounded-md border border-white/5 px-3 py-2.5 opacity-55">
          <Icon name="lock" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 text-[13px]">{{ tr("ランキング・みんなの手・レシピ", "Rankings, others' routes, recipes") }}</span>
          <span class="shrink-0 text-[11px]">{{ tr("準備中", "Coming soon") }}</span>
        </div>
      </div>
    </div>

    <!-- ② お題の中身 -->
    <div v-else-if="view === 'detail' && topic" class="g-panel px-4 py-3 max-md:px-3">
      <DailyTopicCard :topic="topic" big :today="topic.id === today.id" @start="start(topic.id)" />
      <div class="g-section mt-5 grid gap-2 pb-6 md:grid-cols-2">
        <div v-for="x in [[tr('ランキング', 'Rankings'), 'target'], [tr('みんなの手・レシピ', 'Routes & recipes'), 'book']] as const" :key="x[0]" data-daily-later class="flex min-w-0 items-center gap-3 rounded-md border border-white/5 px-3 py-6 opacity-55">
          <Icon :name="x[1]" class="size-5 shrink-0" />
          <span class="min-w-0 flex-1 text-[13px]">{{ x[0] }}</span>
          <span class="shrink-0 text-[11px]">{{ tr("準備中", "Coming soon") }}</span>
        </div>
      </div>
    </div>

    <!-- ③ フラクチャー選び -->
    <div v-else-if="view === 'start' && topic" class="g-panel px-4 py-3 max-md:px-3">
      <DailyStart :key="topic.id" :topic="topic" />
    </div>

    <div v-else class="g-panel px-4 py-10 text-center text-[13px] opacity-70">
      {{ tr("このお題は見つかりません (リセットで消えたかもしれません)", "This challenge was not found (it may have been reset)") }}
      <button type="button" class="g-btn sm ml-2" @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To list") }}</button>
    </div>
  </section>
</template>

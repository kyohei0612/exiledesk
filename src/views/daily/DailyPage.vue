<!--
  DailyPage.vue — デイリークラフトチャレンジのページ (設計図 docs/spec/daily.md)。入口・URL・題は web/page.ts、ここは dailyPage を読んで出し分けるだけ。
  ページは 4 枚: 一覧 ?page=daily / お題 ?page=daily&q=<id> / 投稿 ?page=daily&q=post / 挑戦 ?page=daily-start&q=<id> (URL は仮、D-90)。
  見た目は data-daily-skin の下で色を替える (daily-skin.css、D-60)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import "./daily-skin.css";
import { tr } from "../../i18n/lang";
import { dailyPage } from "../../state/web-page";
import { closeDailyPage, openDailyPage } from "../../web/page";
import ModeTabs from "../../components/for-share/ModeTabs.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import { devApprove, findTopic, getTry, listTopics, myBox, myNick, untilRefresh, type DailyTopic } from "./daily-api";
import DailyHero from "./DailyHero.vue";
import DailyPlay from "./DailyPlay.vue";
import DailyPost from "./DailyPost.vue";

const view = computed(() => dailyPage.value?.view ?? "list");
const q = computed(() => dailyPage.value?.q ?? null);
const post = computed(() => view.value === "detail" && q.value === "post");
const topic = computed(() => findTopic(q.value));

/** 一覧の読み直しの合図 (投稿を通した時) */
const stamp = ref(0);
const topics = computed(() => { void stamp.value; void dailyPage.value; return listTopics(); });
const today = computed(() => topics.value[0]!);
const solved = (t: DailyTopic): boolean => !!getTry(t.id)?.best;
/** 溜まった未解決 = 自分がまだ解決していない物 (Q4 の仮の決め)、古い順 */
const pending = computed(() => topics.value.slice(1).filter((t) => !solved(t)));
const done = computed(() => topics.value.slice(1).filter(solved));
const box = computed(() => { void stamp.value; void dailyPage.value; return myBox().filter((b) => b.status === "wait"); });
const solvedOpen = ref(false);
const nick = computed(() => { void dailyPage.value; return myNick(); });

const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(timer));
const left = computed(() => untilRefresh(now.value));
const hm = (ms: number): string => { const m = Math.floor(ms / 60_000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const dh = (ms: number): string => { const h = Math.floor(ms / 3600_000); return tr(`${Math.floor(h / 24)}日 ${h % 24}時間`, `${Math.floor(h / 24)}d ${h % 24}h`); };

const pass = (id: string): void => { devApprove(id); stamp.value++; };

/** 見た目の案 (Q12。オーナーが決めたら 1 つにする) */
const SKINS = [["ember", "残り火", "Ember"], ["ash", "奈落", "Abyss"], ["eclipse", "月蝕", "Eclipse"]] as const;
const SKIN_KEY = "exiledesk.daily.skin";
const skin = ref((() => { try { return localStorage.getItem(SKIN_KEY) ?? "ember"; } catch { return "ember"; } })());
watch(skin, (v) => { try { localStorage.setItem(SKIN_KEY, v); } catch { /* 覚えられなくても使える */ } });
</script>

<template>
  <section data-daily-page :data-daily-skin="skin" :data-daily-view="post ? 'post' : view" class="daily-root min-w-0 flex-1">
    <DailyPlay v-if="view === 'start' && topic" :key="topic.id" :topic="topic" />
    <template v-else>
      <ModeTabs class="mb-3" :active="null" @pick="closeDailyPage" />
      <DailyPost v-if="post" />
      <template v-else-if="view === 'list'">
        <DailyHero :topic="today" today :now="now" />
        <p data-daily-clock class="daily-clock">
          <span>{{ tr(`次のお題まで ${hm(left.daily)}`, `Next challenge in ${hm(left.daily)}`) }}</span>
          <span>{{ tr(`今週の分が消えるまで ${dh(left.weekly)}`, `This week clears in ${dh(left.weekly)}`) }}</span>
          <span v-if="nick" data-daily-me>{{ tr(`名前: ${nick.name}`, `Name: ${nick.name}`) }}</span>
        </p>
        <div class="daily-lists">
          <section>
            <h3 class="name daily-list-title">{{ tr(`溜まった未解決 ${pending.length}`, `Unsolved backlog ${pending.length}`) }}</h3>
            <ul data-daily-pending>
              <li v-for="t in pending" :key="t.id"><button type="button" class="daily-row" @click="openDailyPage({ view: 'detail', q: t.id })"><span>{{ tr(t.baseJa, t.base) }}</span><small>{{ tr(`MOD ${t.modCount} つ`, `${t.modCount} mods`) }}</small></button></li>
              <li v-if="!pending.length" class="py-2 text-[14px] opacity-60">{{ tr("溜まったお題は無い。", "Nothing waiting.") }}</li>
            </ul>
            <Disclosure v-if="done.length" v-model:open="solvedOpen" kind="section" persist-key="daily-solved-open">{{ tr(`解決したお題 ${done.length}`, `Solved ${done.length}`) }}</Disclosure>
            <ul v-if="solvedOpen"><li v-for="t in done" :key="t.id"><button type="button" class="daily-row" @click="openDailyPage({ view: 'detail', q: t.id })"><span>{{ tr(t.baseJa, t.base) }}</span></button></li></ul>
          </section>
          <section>
            <h3 class="name daily-list-title">{{ tr("お題を投稿する", "Post a challenge") }}</h3>
            <p class="mb-3 text-[14px] opacity-70">{{ tr("作ってほしい装備を、エミュレーター・poe.ninja・トレードから。", "Share an item to be crafted, from the Emulator, poe.ninja or trade.") }}</p>
            <button type="button" class="g-btn" data-daily-post-open @click="openDailyPage({ view: 'detail', q: 'post' })">{{ tr("お題を投稿する", "Post a challenge") }}</button>
            <ul v-if="box.length" data-daily-box class="mt-3">
              <li v-for="b in box" :key="b.id" class="daily-row"><span>{{ tr(b.baseJa, b.base) }}</span><small>{{ tr("精査待ち", "In review") }}</small><button type="button" class="g-btn sm" data-daily-dev-pass @click="pass(b.id)">{{ tr("通す (開発版)", "Approve (dev)") }}</button></li>
            </ul>
          </section>
        </div>
        <div data-daily-skins class="daily-skins"><button v-for="k in SKINS" :key="k[0]" type="button" :class="skin === k[0] ? 'on' : ''" :data-daily-skin-pick="k[0]" @click="skin = k[0]">{{ tr(k[1], k[2]) }}</button></div>
      </template>
      <DailyHero v-else-if="topic" :topic="topic" :today="topic.id === today.id" :now="now" />
      <p v-else class="daily-note">{{ tr("このお題はもう無い。月曜のリセットで消えた可能性がある。", "This challenge is gone. It may have been cleared on Monday.") }} <button type="button" class="g-btn sm" @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button></p>
    </template>
  </section>
</template>

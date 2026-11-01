<!--
  DailyPage.vue — デイリークラフトチャレンジのページ (設計図 docs/spec/daily.md)。入口・URL・題は web/page.ts、ここは dailyPage を読んで出し分けるだけ。
  ページは 5 枚: 一覧 ?page=daily / お題 ?page=daily&q=<id> / 投稿 ?page=daily&q=post / 皮の見比べ ?page=daily&q=skins / 挑戦 ?page=daily-start&q=<id> (URL は仮、D-90)。
  見た目は皮 (skin/skin.ts) の変数を一番外の要素に渡すだけ。その日の皮は日付で回り、見比べで押すと開発の間だけ替わる (D-60)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import "./daily-skin.css";
import "./look.css";
import { tr } from "../../i18n/lang";
import { dailyPage } from "../../state/web-page";
import { craftStage as s } from "../../state/craft-stage";
import { jaTypeName } from "../../i18n/item-names-ja";
import { closeDailyPage, openDailyPage } from "../../web/page";
import ModeTabs from "../../components/for-share/ModeTabs.vue";
import { pageZoom } from "../../utils/zoom";
import { isPhoneWidth } from "../../utils/use-phone";
import { dayNoOf, devApprove, getTry, listTopics, myBox, myNick, untilRefresh, weekDays, weekTable, type DailyTopic } from "./daily-api";
import { baseArt } from "../../components/art/base-art";
import { skinById, skinOfDay, skinVars } from "./skin/skin";
import DailyHero from "./DailyHero.vue";
import DailyName from "./DailyName.vue";
import DailyPlay from "./DailyPlay.vue";
import DailyPost from "./DailyPost.vue";
import DailySkins from "./DailySkins.vue";

const view = computed(() => dailyPage.value?.view ?? "list");
const q = computed(() => dailyPage.value?.q ?? null);
const post = computed(() => view.value === "detail" && q.value === "post");
const skins = computed(() => view.value === "detail" && q.value === "skins");

/** 一覧の読み直しの合図 (投稿を通した時) */
const stamp = ref(0);
const topics = computed(() => { void stamp.value; void dailyPage.value; const d = s.data.value; return d ? listTopics(d, jaTypeName) : []; });
const today = computed(() => topics.value[0] ?? null);
const topic = computed(() => topics.value.find((t) => t.id === q.value) ?? null);
const solved = (t: DailyTopic): boolean => !!getTry(t.id)?.best;
/** 溜まった未解決 = 自分がまだ解決していない物 (D-01・Q4)、新しい順 */
const pending = computed(() => topics.value.slice(1).filter((t) => !solved(t)));
const box = computed(() => { void stamp.value; void dailyPage.value; return myBox().filter((b) => b.status === "wait"); });
const nick = computed(() => { void dailyPage.value; return myNick(); });
const weekly = computed(() => weekTable(topics.value.map((t) => t.id)).slice(0, 10));

const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(timer));
const left = computed(() => untilRefresh(now.value));
const hm = (ms: number): string => { const m = Math.floor(ms / 60_000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const dh = (ms: number): string => { const h = Math.floor(ms / 3600_000); return tr(`${Math.floor(h / 24)}日 ${h % 24}時間`, `${Math.floor(h / 24)}d ${h % 24}h`); };

const pass = (id: string): void => { devApprove(id); stamp.value++; };

/** 今週の棚: 月〜日の 7 枠 (これからの日は空き枠)、通った投稿は後ろに足す */
const WD: readonly (readonly [string, string])[] = [["月", "Mon"], ["火", "Tue"], ["水", "Wed"], ["木", "Thu"], ["金", "Fri"], ["土", "Sat"], ["日", "Sun"]];
const slots = computed(() => {
  const days = weekDays(now.value).map((d) => ({ ...d, label: `${tr(...WD[d.wd]!)} ${d.md}`, t: topics.value.find((x) => x.id === d.id) ?? null }));
  const ids = new Set(days.map((d) => d.id));
  return [...days, ...topics.value.filter((x) => !ids.has(x.id)).map((x) => ({ id: x.id, wd: -1, md: x.day, today: false, label: x.day, t: x as DailyTopic | null }))];
});

/** 1 ページ目は PC で窓の高さいっぱいの 1 枚 (スクロールさせない)。足りない窓ではページが伸びる */
const board = ref<HTMLElement | null>(null);
const boardH = ref(0);
function fitBoard(): void {
  const el = board.value;
  if (!el || isPhoneWidth()) { boardH.value = 0; return; }
  const z = pageZoom();
  boardH.value = Math.floor(innerHeight / z - (el.getBoundingClientRect().top + window.scrollY) / z - 20);
}
watch(board, () => void nextTick(fitBoard));
onMounted(() => window.addEventListener("resize", fitBoard));
onBeforeUnmount(() => window.removeEventListener("resize", fitBoard));

/** その日の皮 (D-60a)。見比べで押した皮は開発の間だけ優先 */
const SKIN_KEY = "exiledesk.daily.skin";
const picked = ref((() => { try { return localStorage.getItem(SKIN_KEY); } catch { return null; } })());
watch(picked, (v) => { try { if (v) localStorage.setItem(SKIN_KEY, v); else localStorage.removeItem(SKIN_KEY); } catch { /* 覚えられなくても使える */ } });
const skin = computed(() => skinById(picked.value) ?? skinOfDay(dayNoOf(now.value)));
</script>

<template>
  <section data-daily-page data-skinned :data-daily-skin="skin.id" :data-daily-view="post ? 'post' : skins ? 'skins' : view" class="daily-root min-w-0 flex-1" :style="skinVars(skin)">
    <DailyPlay v-if="view === 'start' && topic" :key="topic.id" :topic="topic" />
    <template v-else>
      <ModeTabs class="mb-3" :active="null" @pick="closeDailyPage" />
      <DailyPost v-if="post" />
      <template v-else-if="skins">
        <p class="daily-clock">{{ tr(`今の皮: ${skin.ja}。押すと替わる。`, `Current skin: ${skin.en}. Click to switch.`) }} <button type="button" class="underline" data-daily-skin-auto @click="picked = null">{{ tr("日替わりに戻す", "Back to daily rotation") }}</button></p>
        <DailySkins @pick="(id) => (picked = id)" />
        <button type="button" class="g-btn m-4" @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button>
      </template>
      <p v-else-if="!today" class="daily-note">{{ tr("読み込み中", "Loading") }}</p>
      <div v-else-if="view === 'list'" ref="board" class="g-panel daily-board" :style="boardH ? { minHeight: `${boardH}px` } : {}">
        <DailyHero :topic="today" today :now="now" />
        <div data-daily-clock class="daily-clock">
          <p><span>{{ tr(`次のお題まで ${hm(left.daily)}`, `Next challenge in ${hm(left.daily)}`) }}</span><span>{{ tr(`今週の締めまで ${dh(left.weekly)}`, `Week ends in ${dh(left.weekly)}`) }}</span></p>
          <p><span v-if="nick" data-daily-me>{{ tr("名前:", "Name:") }} <DailyName :name="nick.name" /></span><button type="button" class="underline" data-daily-skins-open @click="openDailyPage({ view: 'detail', q: 'skins' })">{{ tr(`今日の色: ${skin.ja}`, `Today's colors: ${skin.en}`) }}</button></p>
        </div>
        <section data-daily-week>
          <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("今週の点", "This week's points") }}</h3></div>
          <ol>
            <li v-for="(r, i) in weekly" :key="r.name" class="daily-rank-row" :class="r.me ? 'me' : ''">
              <span class="daily-place">{{ i + 1 }}</span><DailyName class="flex-1" :name="r.name" /><b class="daily-points">{{ r.points }}</b>
            </li>
          </ol>
        </section>
        <div class="daily-bottom g-section">
          <section class="min-w-0">
            <div class="g-sec-head"><h3 class="g-sec-title">{{ tr(`溜まった未解決 ${pending.length}`, `Unsolved backlog ${pending.length}`) }}</h3></div>
            <ul data-daily-pending class="daily-tiles">
              <li v-for="d in slots" :key="d.id" :data-daily-slot="d.today ? 'today' : d.t ? (solved(d.t) ? 'solved' : 'open') : 'future'">
                <button type="button" class="daily-tile" :disabled="!d.t" @click="d.t && openDailyPage({ view: 'detail', q: d.t.id })">
                  <span class="g-slot daily-tile-art" :class="d.today ? 'on' : ''"><img v-if="d.t" :src="baseArt(d.t.base) ?? undefined" alt="" /><b v-if="d.t && solved(d.t)" class="daily-tile-done">✓</b></span>
                  <span class="daily-tile-name">{{ d.t ? tr(d.t.baseJa, d.t.base) : tr("まだ", "Not yet") }}</span>
                  <small>{{ d.label }}</small><small v-if="d.t">{{ tr(`MOD ${d.t.modCount} つ`, `${d.t.modCount} mods`) }}</small>
                </button>
              </li>
            </ul>
          </section>
          <section class="daily-post-entry min-w-0">
            <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("お題を投稿", "Post a challenge") }}</h3></div>
            <button type="button" class="g-btn" data-daily-post-open @click="openDailyPage({ view: 'detail', q: 'post' })">{{ tr("作ってほしい装備を投稿", "Post an item to be crafted") }}</button>
            <ul v-if="box.length" data-daily-box class="daily-box">
              <li v-for="b in box" :key="b.id" class="daily-row"><span>{{ tr(b.baseJa, b.base) }}</span><small>{{ tr("精査待ち", "In review") }}</small><button type="button" class="g-btn sm" data-daily-dev-pass @click="pass(b.id)">{{ tr("通す (開発版)", "Approve (dev)") }}</button></li>
            </ul>
          </section>
        </div>
      </div>
      <div v-else-if="topic" class="g-panel daily-board one"><DailyHero :topic="topic" :today="topic.id === today.id" :now="now" /></div>
      <p v-else class="daily-note">{{ tr("このお題はもう無い。月曜のリセットで消えた可能性がある。", "This challenge is gone. It may have been cleared on Monday.") }} <button type="button" class="g-btn sm" @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button></p>
    </template>
  </section>
</template>

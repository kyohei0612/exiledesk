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
import { dayNoOf, getTry, myAwards, myBox, myNick, myTitlePick, setTitlePick, SLOT_NAMES, todayId, topicOfId, untilRefresh, weekBoard, yesterdayTop, type DailyBoxItem, type DailyTopic } from "./daily-api";
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

/** 一覧の読み直しの合図 (称号を選んだ時) */
const stamp = ref(0);
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(timer));
/** 日が替わる (16:00) までは同じ棚。秒ごとに組み直さない */
const dayNo = computed(() => dayNoOf(now.value));
const week = computed(() => { void dayNo.value; void dailyPage.value; const d = s.data.value; return d ? weekBoard(d, jaTypeName) : []; });
const today = computed(() => week.value.find((x) => x.today)?.t ?? null);
const topic = computed(() => { void dayNo.value; const d = s.data.value; return d && q.value ? topicOfId(d, jaTypeName, q.value) : null; });
const solved = (t: DailyTopic): boolean => !!getTry(t.id)?.best;
const box = computed(() => { void dailyPage.value; return myBox().filter((b) => b.status !== "used"); });
const boxWhy = (b: DailyBoxItem): string => (b.why === "no-mods" ? tr("お題にできる MOD が無い", "No usable mods") : b.why === "bad-word" ? tr("名前か一言に使えない言葉がある", "The name or note has a banned word") : b.why ?? "");
const nick = computed(() => { void dailyPage.value; return myNick(); });
/** 卓の右 = 昨日の上位 3 人と札 (D-60d) */
const top3 = computed(() => { void dayNo.value; return yesterdayTop(); });

const left = computed(() => untilRefresh(now.value));
const hm = (ms: number): string => { const m = Math.floor(ms / 60_000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };

/** 自分の称号と札の選び (D-54)。空 = 一番格上 */
const awards = computed(() => { void stamp.value; void dayNo.value; return nick.value ? myAwards() : []; });
const pick = computed({ get: () => { void stamp.value; return myTitlePick() ?? ""; }, set: (v: string) => { setTitlePick(v || null); stamp.value++; } });

/** 今週の棚: 月〜日の 7 枠。来ていない日は曜日の部位だけ出す (D-05・D-60d) */
const WD: readonly (readonly [string, string])[] = [["月", "Mon"], ["火", "Tue"], ["水", "Wed"], ["木", "Thu"], ["金", "Fri"], ["土", "Sat"], ["日", "Sun"]];
const slots = computed(() => week.value.map((d) => ({ ...d, label: `${tr(...WD[d.wd]!)} ${d.md}`, part: SLOT_NAMES[d.wd]! })));

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
const skin = computed(() => skinById(picked.value) ?? skinOfDay(dayNo.value));
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
      <p v-else-if="!s.data.value" class="daily-note">{{ tr("読み込み中", "Loading") }}</p>
      <p v-else-if="view === 'list' && !today" data-daily-none class="daily-note">{{ tr("今日のお題を組めなかった。次のお題は 16:00。", "Today's challenge couldn't be built. The next one opens at 16:00 JST.") }}</p>
      <div v-else-if="view === 'list'" ref="board" class="g-panel daily-board" :style="boardH ? { minHeight: `${boardH}px` } : {}">
        <DailyHero v-if="today" :topic="today" today :now="now" />
        <div data-daily-clock class="daily-clock">
          <p><span>{{ tr(`次のお題まで ${hm(left.next)} (16:00)`, `Next challenge in ${hm(left.next)} (16:00 JST)`) }}</span><span data-daily-close>{{ left.close ? tr(`今日のスタートの締め切りまで ${hm(left.close)} (14:50)`, `Start closes in ${hm(left.close)} (14:50 JST)`) : tr("今日のスタートは締めた", "Today's start is closed") }}</span></p>
          <p><span v-if="nick" data-daily-me>{{ tr("名前:", "Name:") }} <DailyName :name="nick.name" :stamp="stamp" /></span>
            <label v-if="awards.length" data-daily-title-pick>{{ tr("札:", "Title:") }} <select v-model="pick" class="g-input sm"><option value="">{{ tr("一番格上", "Highest") }}</option><option v-for="a in awards" :key="a.id" :value="a.id">{{ tr(a.ja, a.en) }}{{ a.retired ? tr(" (昔の称号)", " (retired)") : "" }}</option></select></label><button type="button" class="underline" data-daily-skins-open @click="openDailyPage({ view: 'detail', q: 'skins' })">{{ tr(`今日の色: ${skin.ja}`, `Today's colors: ${skin.en}`) }}</button></p>
        </div>
        <section data-daily-week data-daily-yesterday>
          <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("昨日の上位", "Yesterday's top 3") }}</h3></div>
          <ol v-if="top3.length">
            <li v-for="(r, i) in top3" :key="r.name" class="daily-rank-row" :class="r.me ? 'me' : ''">
              <span class="daily-place">{{ i + 1 }}</span><DailyName class="flex-1" :name="r.name" :stamp="stamp" /><b class="daily-points">{{ r.cost }} {{ tr("神", "div") }}</b>
            </li>
          </ol>
          <p v-else class="text-[14px] opacity-70">{{ tr("昨日は解決した人がいない", "No one solved yesterday's challenge") }}</p>
        </section>
        <div class="daily-bottom g-section">
          <section class="min-w-0">
            <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("今週のお題", "This week's challenges") }}</h3></div>
            <ul data-daily-pending class="daily-tiles">
              <li v-for="d in slots" :key="d.id" :data-daily-slot="d.today ? 'today' : d.t ? (solved(d.t) ? 'solved' : 'closed') : 'future'">
                <button type="button" class="daily-tile" :disabled="!d.t" @click="d.t && openDailyPage({ view: 'detail', q: d.t.id })">
                  <span class="g-slot daily-tile-art" :class="d.today ? 'on' : ''"><img v-if="d.t" :src="baseArt(d.t.base) ?? undefined" alt="" /><b v-if="d.t && solved(d.t)" class="daily-tile-done">✓</b></span>
                  <span class="daily-tile-name">{{ d.t ? tr(d.t.baseJa, d.t.base) : tr(d.part.ja, d.part.en) }}</span>
                  <small>{{ d.label }}</small><small v-if="d.t">{{ tr(`MOD ${d.t.modCount} つ`, `${d.t.modCount} mods`) }}</small>
                </button>
              </li>
            </ul>
          </section>
          <section class="daily-post-entry min-w-0">
            <div class="g-sec-head"><h3 class="g-sec-title">{{ tr("お題を投稿", "Post a challenge") }}</h3></div>
            <button type="button" class="g-btn" data-daily-post-open @click="openDailyPage({ view: 'detail', q: 'post' })">{{ tr("作ってほしい装備を投稿", "Post an item to be crafted") }}</button>
            <ul v-if="box.length" data-daily-box class="daily-box">
              <li v-for="b in box" :key="b.id" class="daily-row" :data-daily-box-status="b.status"><span>{{ tr(b.baseJa, b.base) }}</span><small>{{ b.status === "ok" ? tr("箱の中。選ばれた日の 16:00 に出る", "In the box. It goes out at 16:00 on the day it's picked") : tr(`落ちた: ${boxWhy(b)}`, `Rejected: ${boxWhy(b)}`) }}</small></li>
            </ul>
          </section>
        </div>
      </div>
      <div v-else-if="topic" class="g-panel daily-board one"><DailyHero :topic="topic" :today="topic.id === todayId()" :now="now" /></div>
      <p v-else class="daily-note">{{ tr("このお題はまだ無い。お題は毎日 16:00 に出る。", "This challenge isn't out yet. A new one opens every day at 16:00 JST.") }} <button type="button" class="g-btn sm" @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button></p>
    </template>
  </section>
</template>

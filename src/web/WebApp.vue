<script setup lang="ts">
/**
 * Web 版の殻 (2026-10-07 オーナー「ウェブ版でクラフトステージ動かないとダメ」)。
 * 上に名前とアプリ版へのリンク、真ん中にクラフトステージ (アプリと同じ部品)、右に配信中のチャンネル (server/live の /live.json)。
 * アプリ版の App.vue にある起動の処理 (更新・PoB・画像パック・ログイン・見回り) は Web では要らないので載せない。
 * 画面は 1660 幅で組んだ絵を窓に合わせて拡大縮小する (アプリと同じ。狭い時は縮める)
 */
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";
import { marketStore } from "../state/market-store";
import CraftStage from "../views/craft-stage/CraftStage.vue";
import { craftStage } from "../state/craft-stage";
import LivePanel from "./LivePanel.vue";
import FeedbackDialog from "./FeedbackDialog.vue";
import ChangelogDialog from "../components/ChangelogDialog.vue";
import SupportDialog from "../components/SupportDialog.vue";
import LeaveConfirm from "./LeaveConfirm.vue";
import HoverStack from "../components/decor/HoverStack.vue";
import { SUPPORT_LINKS, supportOpen } from "../state/support";
import { changelogNew, changelogOpen, initChangelog } from "../state/changelog";
import { checkReplies, imageAskFor } from "../state/feedback-replies";
import { REC } from "../utils/rec-mode";
import { forgetResult } from "../utils/no-log";
import MarketNotice from "./MarketNotice.vue";
import pkg from "../../package.json";
import { tr } from "../i18n/lang";
import { loadBoot, type Boot } from "./boot";
import InstallButton from "./InstallButton.vue";
import LangSwitch from "../components/LangSwitch.vue";
import { closeDailyPage, openDailyPage, openFeedback, openGuide, page } from "./page";
import AdSlot from "../components/ui/AdSlot.vue";
import WebFooter from "./WebFooter.vue";
import { pageTick, sideAdW } from "../utils/ads";
import { BLOG_ON, DAILY_ON, dailyPage, feedbackPage, recipesPage, routesOpen, TREE_ON, treePage } from "../state/web-page";
import { prefetchWhenIdle } from "./prefetch";
import { flag } from "./release-flags";
const SideReads = defineAsyncComponent(() => import("./SideReads.vue")); // 右の列の読み物 (関係する記事・新しい記事・使い方、/blog/index.json)
const StageRoutesPage = defineAsyncComponent(() => import("../views/craft-stage/StageRoutesPage.vue"));
const loadTree = () => import("../views/simulator/tree/SimTreePage.vue");
const SimTreePage = defineAsyncComponent(loadTree); // クラフトの道 (ツリー) のページ (2026-10-22、開発版だけ)。手が空いたら先に読む (下の onMounted)
/**
 * デイリークラフトチャレンジのページ (2026-10-22、開発版だけ。中身 views/daily/DailyPage.vue はデイリー部長が作る)。
 * まだ無い間は下の「準備中」の入れ物 (glob は無いファイルを空で返すので、ビルドは落ちない)
 */
const dailyFile = Object.values(import.meta.glob<{ default: Component }>("../views/daily/DailyPage.vue"))[0];
const DailyPage = dailyFile ? defineAsyncComponent(dailyFile) : null;
const StageRecipesPage = defineAsyncComponent(() => import("../views/simulator/StageRecipesPage.vue")); // シミュレーターのレシピのページ (2026-10-21) // 後から読む (2026-10-19 スマホ強化: 最初に読む JS を縮める。その画面・カードを出す時に初めて読む)
import { inLesson } from "../state/tutorial/craft-lesson";

const guideOn = computed(() => craftStage.mode.value === "tutorial" || inLesson.value);

/**
 * 要望・バグを送るはページ (?page=feedback、web/page.ts。2026-10-18 オーナー「広告入れてる前提のページ作り」)。前は重ねる窓。
 * 返事の「画像を送る」(imageAskFor) も同じページで開く。開いたら一番上から、戻ったら前の位置へ
 */
watch(imageAskFor, (id) => { if (id) feedbackPage.value = true; }, { immediate: true });
function closeFeedback(): void { feedbackPage.value = false; imageAskFor.value = null; }
let fbScroll = 0;
watch(feedbackPage, (on) => {
  if (on) { fbScroll = window.scrollY; window.scrollTo(0, 0); return; }
  imageAskFor.value = null;
  void nextTick(() => window.scrollTo(0, fbScroll));
});
/**
 * 右についてくる列 (チャンネルと 300×250 の枠) があるのはクラフト画面だけ。ほかのページ (使い方・コツ・コース・ベース選び・計算機・要望) は
 * 右の列を外して、両脇に縦長の枠 (2026-10-18 オーナー「固定スクロールがあるのはクラフト画面のみ、それ以外は全部別ページ扱い」。MOD 一覧だけ重ねる窓)
 */
const craftPage = computed(() => page.value === "");
/** 広告の枠を置くのは文章のあるページだけ (使い方・コツ、コース、デイリー)。操作の画面 (クラフト台・ベース選び・スパムシミュレーター・要望) には置かない (2026-10-22 AdSense の再申請。デイリーはデイリー部長の頼みで両脇に置く) */
const textPage = computed(() => page.value === "page=guide" || page.value.startsWith("course=") || !!dailyPage.value);
/**
 * 45 分以上触らずに戻ってきた時 (タブを開き直した・何か押した時) は、相場とチャンネルだけ裏で取り直す。画面と作業中の物はそのまま
 * (2026-10-07 オーナー「45 分放置でリロードにしようかな」→ ページごと読み直すと手で打った手順などが消えるので、取り直しだけに)
 */
const IDLE_MS = 45 * 60_000;
let lastActive = Date.now();
function onActive(): void {
  const idle = Date.now() - lastActive;
  lastActive = Date.now();
  if (idle < IDLE_MS) return;
  // 相場と配信の情報は /boot.json を 1 回だけ読み直す (boot.ts)
  void loadBoot(true).then((b) => { visitors.value = b?.visitors ?? visitors.value; marketStore.refreshMarket(); });
  window.dispatchEvent(new Event("exiledesk:refresh"));
  // 開きっぱなしの人にも、要望への返事を届ける
  if (!REC) void checkReplies().then((got) => { if (got && !changelogOpen.value) { changelogNew.value = []; changelogOpen.value = "new"; } });
}
const onVisible = (): void => { if (document.visibilityState === "visible") onActive(); };
onMounted(() => {
  for (const ev of ["pointerdown", "keydown", "wheel"] as const) window.addEventListener(ev, onActive, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisible);
  // シミュレーター (ツリー) の塊は、開いてから読むのでなく手が空いた時に先に読む (開発版だけ。2026-10-23 オーナー「裏で読み込んでおいて」)
  if (TREE_ON) prefetchWhenIdle(loadTree);
});
onBeforeUnmount(() => {
  for (const ev of ["pointerdown", "keydown", "wheel"] as const) window.removeEventListener(ev, onActive, { capture: true });
  document.removeEventListener("visibilitychange", onVisible);
});
/**
 * 上の「使い方」は使い方の動画 (POE2Tube の本編) を必ず別タブで開く (2026-10-18 から「使い方・コツ」のページ。動画はその中のリンク、web/page.ts)。2026-10-12 オーナー「はじめにのところを使い方ってボタンに変えちゃう」
 * (前は「はじめに」の窓。初めて来た人にも勝手には出さない 2026-10-10)。スマホは youtu.be なので YouTube のアプリがあればアプリで開く。
 * WELCOME_KEY は初めて来た人の判定 (更新内容を出さない) にだけ使う
 */
const WELCOME_KEY = "exiledesk.web.welcomed";
let firstVisit = false;
try { firstVisit = !localStorage.getItem(WELCOME_KEY); localStorage.setItem(WELCOME_KEY, "1"); } catch { /* 無くてよい */ }
// 更新した後に 1 回だけ更新内容を出す。初めて来た人には出さない (2026-10-10)
// 録画モード (?rec=1) では起動直後の窓を出さない (POE2Tube 要望 ㊶)
if (!REC) initChangelog(firstVisit);
// 送った要望・バグへの返事があれば、更新の窓 (無ければ返事だけの窓) で知らせる (state/feedback-replies.ts、2026-10-11)
if (!REC) void checkReplies().then((got) => { if (got && !changelogOpen.value) { changelogNew.value = []; changelogOpen.value = "new"; } });
/** 本日の訪問者 (/boot.json の visitors) */
const visitors = ref<NonNullable<Boot["visitors"]> | null>(null);
void loadBoot().then((b) => { visitors.value = b?.visitors ?? null; });
const DESIGN_WIDTH = 1660;
const frame = ref({ w: DESIGN_WIDTH, h: 900 });
/**
 * スマホ (幅 768 CSS px 未満): 縮めずに等倍で、縦に積む並び (2026-10-08 オーナー「1080×1920 で表示頑張って作るか」「横スクロールは無しで調整」)。
 * 前は 0.55 倍まで縮めていて、字が 6 px ほどで読めなかった
 */
const phone = ref(false);
/** 縦のスクロールバーの太さ (拡大を掛ける前に 1 回だけ測る。スマホ・Mac の重なるスクロールバーは 0) */
const SCROLLBAR = ((): number => {
  const d = document.createElement("div");
  d.style.cssText = "position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll";
  document.body.appendChild(d);
  const w = d.offsetWidth - d.clientWidth;
  d.remove();
  return w;
})();
function fitZoom(): void {
  phone.value = window.innerWidth < 768;
  // iPad など: 縮めると字が 7〜8 px になって読めないので、1280 未満は等倍、それより広くても 0.85 倍より小さくしない (並びは幅に合わせて折り返す。2026-10-10)
  // 幅はいつも「縦のスクロールバーがある時の幅」(innerWidth − スクロールバーの太さ)。innerWidth のままだと外枠が 10 px 横にはみ出し (2026-10-22 はみ出しの見張り)、
  // clientWidth (今バーがあるか次第) だと、高さが画面ぎりぎりのページでバーが出る → 縮む → 消える → 戻る を毎フレームくり返して CPU が回りっぱなしだった (2026-10-23 シミュ部長)
  const cw = flag("fitZoom") ? window.innerWidth - SCROLLBAR : document.documentElement.clientWidth || window.innerWidth;
  const z = phone.value || window.innerWidth < 1280 ? 1 : Math.min(1.6, Math.max(0.85, cw / DESIGN_WIDTH));
  document.documentElement.style.zoom = String(z);
  // 等倍の時は幅を決め打ちしない (innerWidth は縦のスクロールバーの分も入っていて、768〜1279 px で 10 px 横にはみ出した。2026-10-13 ランダム操作の確かめ)
  frame.value = { w: z === 1 ? 0 : cw / z, h: window.innerHeight / z };
}
fitZoom();
window.addEventListener("resize", fitZoom);
// 向きを変えた時・幅が変わったのに resize が来ない時もある (2026-10-13 確かめで外枠が 1024px のまま残った)
window.addEventListener("orientationchange", fitZoom);
window.visualViewport?.addEventListener("resize", fitZoom);
</script>

<template>
  <!-- 高さを決めず、ページ全体を縦に送る (決まり事の footer も一緒に流れる)。PC も同じ: スクロールの棒は窓の右端の 1 本だけ
       (2026-10-11 オーナー「スクロールはチャンネルの右側でおｋ、全体スクロールだけ」) -->
  <div class="flex flex-col" :style="{ width: phone || !frame.w ? '100%' : `${frame.w}px`, minHeight: `${frame.h}px` }">
    <header data-rec-part="header" class="flex shrink-0 items-center gap-3 border-b border-[var(--exile-color-border-subtle)] px-4 text-[12px]" :class="phone ? 'h-auto flex-wrap gap-1.5 px-2 py-1.5 text-[12px]' : 'h-10'">
      <!-- スマホは 2 段 (1 段目 = ロゴ、2 段目 = 版とボタン。2026-10-10 支援するを足して 1 段に入らなくなった) -->
      <span class="flex shrink-0 items-center" :class="phone ? 'basis-full gap-1' : 'gap-2'">
        <img src="/favicon.png" alt="" class="g-brand-icon shrink-0" :class="phone ? 'size-6' : 'size-8'" draggable="false" />
        <span class="g-brand-word leading-none" :class="phone ? 'text-[13px]' : 'text-[18px]'">EXILEDESK</span>
        <!-- 言語 (2026-10-10 英語版)。スマホは 1 段目の右 -->
        <span v-if="phone" class="ml-auto" data-rec-part="header-lang"><LangSwitch /></span>
      </span>
      <!-- 1024 px 未満は飾りの札 (画面名・アプリ版) を出さない (768 px で帯が詰まって「日本語」が縦に折れた。2026-10-13) -->
      <span class="whitespace-nowrap rounded border border-white/15 px-1.5 py-0.5 opacity-70 max-lg:hidden" :class="phone ? 'hidden' : ''">{{ tr("クラフトステージ", "Craft Stage") }}</span>
      <!-- 本日の訪問者 (9:00 から、1 時間ごとに数え直す。2026-10-11 オーナー)。数えられていない時は出さない -->
      <!-- 録画モードは訪問者を隠すので、右寄せの押さえだけ置く -->
      <span v-if="REC && !phone" class="ml-auto" />
      <span v-if="visitors" data-rec-part="header-visitors" class="ml-auto whitespace-nowrap opacity-60" :class="phone ? 'text-[10px]' : ''" :title="visitors.yesterday != null ? tr(`9:00 から (1 時間ごとに更新) · 昨日 ${visitors.yesterday.toLocaleString()} 人`, `Since 9:00 JST (updated hourly) · Yesterday ${visitors.yesterday.toLocaleString()}`) : tr('9:00 から (1 時間ごとに更新)', 'Since 9:00 JST (updated hourly)')">{{ phone ? tr(`本日 ${visitors.today.toLocaleString()} 人`, `${visitors.today.toLocaleString()} today`) : tr(`本日の訪問者 ${visitors.today.toLocaleString()} 人`, `Today's visitors ${visitors.today.toLocaleString()}`) }}</span>
      <!-- 版を押すと更新履歴 (2026-10-10) -->
      <button type="button" data-rec-part="header-version" class="g-plain opacity-50 hover:opacity-100 hover:text-[var(--exile-color-accent-focus)]" :class="phone ? '!min-h-9 shrink-0 text-[10px]' : ''" :title="tr('更新履歴を見る', 'View changelog')" @click="changelogOpen = 'all'">v{{ pkg.version }}</button>
      <span v-if="!phone" data-rec-part="header-lang" class="shrink-0 whitespace-nowrap"><LangSwitch /></span>
      <!-- 帯のボタンは窓と同じ g-btn sm (2026-10-10 動きの揃え 6) -->
      <!-- 使い方・コツのページ (動画へのリンク + チュートリアルのコース。2026-10-18 オーナー「チュートリアルは使い方にしまう」) -->
      <!-- デイリークラフトチャレンジ (2026-10-22、開発版だけ。?page=daily) -->
      <button v-if="DAILY_ON" type="button" data-rec-part="header-daily" class="g-btn sm" :class="[phone ? '!min-h-9 !px-0 text-[12px]' : '', dailyPage ? 'on' : '']" :aria-pressed="!!dailyPage" @click="openDailyPage()">{{ tr("デイリー", "Daily") }}</button>
      <!-- ブログ (読み物への入口、2026-10-22 AdSense の再申請。開発版だけ) -->
      <a v-if="BLOG_ON" data-rec-part="header-blog" :href="tr('/blog/', '/en/blog/')" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''">{{ tr("ブログ", "Blog") }}</a>
      <button type="button" data-rec-part="header-help" class="g-btn sm" :class="[phone ? '!min-h-9 !px-0 text-[12px]' : '', guideOn ? 'on' : '']" :aria-pressed="guideOn" @click="openGuide">{{ tr("使い方・コツ", "Guide & Tips") }}</button>
      <button type="button" data-rec-part="header-feedback" class="g-btn sm" :class="[phone ? '!min-h-9 !px-0 text-[12px]' : '', feedbackPage ? 'on' : '']" :aria-pressed="feedbackPage" :title="tr('要望やバグを送る (今の画面の状態も一緒に届きます)', 'Send feedback or bug reports (the current screen state is sent along)')" @click="imageAskFor = null; openFeedback()">{{ phone ? tr("要望・バグ", "Feedback") : tr("要望・バグを送る", "Send feedback") }}</button>
      <!-- 支援 (投げ銭)。リンクが 1 つも無ければ出さない (2026-10-10) -->
      <button v-if="SUPPORT_LINKS.length" type="button" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''" :title="tr('ExileDesk を支援する', 'Support ExileDesk')" @click="supportOpen = true">{{ tr("支援する", "Support") }}</button>
      <!-- 前の「アプリ版 近日公開」の所: このサイトをアプリとしてデスクトップに置く (PWA、2026-10-17 オーナー) -->
      <InstallButton v-if="!phone" pc :phone="false" class="max-lg:hidden" />
    </header>
    <MarketNotice />
    <!-- ?nolog=1 で開いた時の結果 (2026-10-10) -->
    <p v-if="forgetResult" class="flex items-center gap-2 px-4 py-1.5 text-[12px]" :class="forgetResult.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-amber-900/40 text-amber-200'">
      {{ forgetResult.text }}
      <button type="button" class="g-plain ml-auto opacity-60 hover:opacity-100" @click="forgetResult = null">×</button>
    </p>
    <!-- ジェム・ベースなどのカードの重なり (アプリの App.vue と同じ部品) -->
    <HoverStack />
    <ChangelogDialog />
    <SupportDialog />
    <LeaveConfirm /><!-- ツリーの作りかけで外へ移る前の確かめ (web/page.ts の setLeaveGuard) -->
    <!-- スマホの広告の枠: 上の帯の下に 1 つ。棚・「ベースを変える」から指 1 本分離す (誤タップは規約違反。utils/ads.ts) -->
    <div v-if="phone && textPage" class="mb-4 flex justify-center pt-2 empty:hidden"><AdSlot id="phone-top" :w="320" :h="100" :tick="pageTick" /></div>
    <!-- スマホは縦に積む: ステージ → チャンネル (横スクロールは出さない) -->
    <div class="flex min-h-0 flex-1" :class="phone ? 'flex-col' : ''">
      <!-- クラフト画面以外のページ: 両脇に縦長の枠 (ページを移るたびに出し直す、60 秒に 1 回まで) -->
      <div v-if="textPage && !phone" class="sticky top-3 shrink-0 self-start py-4 pl-4 empty:hidden"><AdSlot id="page-left" :w="sideAdW()" :h="600" :tick="pageTick" /></div>
      <!-- 要望・バグを送るのページ (両脇の枠の間の真ん中にフォーム) -->
      <section v-if="feedbackPage" data-feedback-page class="flex min-w-0 flex-1 items-start justify-center gap-6 p-4">
        <div class="min-w-0 max-w-[48rem] flex-1">
          <button type="button" data-feedback-back class="g-btn sm mb-3 max-md:min-h-10" @click="closeFeedback">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
          <FeedbackDialog page open :for-id="imageAskFor" @close="closeFeedback" />
          <WebFooter class="mt-10" />
        </div>
      </section>
      <!-- スパムシミュレーターのページ (カレンシーの見出しから。2026-10-18) -->
      <StageRoutesPage v-if="routesOpen && craftStage.item.value" />
      <!-- シミュレーターのレシピのページ (2026-10-21) -->
      <StageRecipesPage v-if="recipesPage && !feedbackPage" />
      <template v-if="dailyPage && !feedbackPage && !recipesPage && !treePage">
        <component :is="DailyPage" v-if="DailyPage" />
        <!-- DailyPage.vue がまだ無い間の入れ物 -->
        <section v-else data-daily-page class="min-w-0 flex-1 p-4">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)]">{{ tr("デイリー", "Daily") }}</h1>
            <button type="button" data-daily-back class="g-btn sm max-md:min-h-10" @click="closeDailyPage">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
          </div>
          <div class="g-panel px-4 py-10 text-center text-[var(--exile-color-text-secondary)]">{{ tr("準備中", "Coming soon") }}</div>
        </section>
      </template>
      <SimTreePage v-if="treePage && !feedbackPage && !recipesPage" /><!-- クラフトの道 (ツリー) のページ (2026-10-22、開発版だけ) -->
      <CraftStage v-show="!feedbackPage && !recipesPage && !treePage && !dailyPage && !(routesOpen && craftStage.item.value)" class="min-w-0 flex-1 !h-auto !overflow-visible" :class="phone ? 'shrink-0' : ''">
        <template #footer>
          <WebFooter class="-mx-4" />
        </template>
      </CraftStage>
      <!-- PC のチャンネルは送っても画面に付いてくる (2026-10-11 オーナー「右のチャンネルは追従型」)。仕切りの線は下まで (aside は伸ばし、中だけ sticky) -->
      <!-- 右クリックは真ん中 (CraftStage.vue) と同じく「持っている物を手放す」。ブラウザのメニュー (コピーなど) は出さない (2026-10-13 オーナー) -->
      <div v-if="textPage && !phone" class="sticky top-3 shrink-0 self-start py-4 pr-4 empty:hidden"><AdSlot id="page-right" :w="sideAdW()" :h="600" :tick="pageTick" /></div>
      <aside v-show="phone || craftPage" data-rec-part="channel" class="shrink-0 border-[var(--exile-color-border-subtle)] p-3" :class="phone ? 'border-t' : BLOG_ON ? 'w-[324px] border-l' : 'w-[280px] border-l'" @contextmenu.prevent="craftStage.hold(null)">
        <div :class="phone ? '' : 'sticky top-3'">
          <!-- 読み物 (関係する記事・新しい記事・使い方) を上、チャンネルを下 (2026-10-22、開発版だけ。右の列の広告の枠は外した) -->
          <SideReads v-if="BLOG_ON" class="mb-3" />
          <LivePanel />
        </div>
      </aside>
    </div>
  </div>
</template>

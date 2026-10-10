<script setup lang="ts">
/**
 * Web 版の殻 (2026-10-07 オーナー「ウェブ版でクラフトステージ動かないとダメ」)。
 * 上に名前とアプリ版へのリンク、真ん中にクラフトステージ (アプリと同じ部品)、右に配信中のチャンネル (server/live の /live.json)。
 * アプリ版の App.vue にある起動の処理 (更新・PoB・画像パック・ログイン・見回り) は Web では要らないので載せない。
 * 画面は 1660 幅で組んだ絵を窓に合わせて拡大縮小する (アプリと同じ。狭い時は縮める)
 */
import { onBeforeUnmount, onMounted, ref } from "vue";
import { marketStore } from "../state/market-store";
import CraftStage from "../views/craft-stage/CraftStage.vue";
import LivePanel from "./LivePanel.vue";
import FeedbackDialog from "./FeedbackDialog.vue";
import WelcomeDialog from "./WelcomeDialog.vue";
import ChangelogDialog from "../components/ChangelogDialog.vue";
import SupportDialog from "../components/SupportDialog.vue";
import HoverStack from "../components/decor/HoverStack.vue";
import { SUPPORT_LINKS, supportOpen } from "../state/support";
import { changelogOpen, initChangelog } from "../state/changelog";
import { forgetResult } from "../utils/no-log";
import MarketNotice from "./MarketNotice.vue";
import pkg from "../../package.json";
import { noLogOn, setNoLog } from "../utils/no-log";
import { tr } from "../i18n/lang";
import { loadBoot } from "./boot";
import LangSwitch from "../components/LangSwitch.vue";

const feedbackOpen = ref(false);
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
  void loadBoot(true).then(() => marketStore.refreshMarket());
  window.dispatchEvent(new Event("exiledesk:refresh"));
}
const onVisible = (): void => { if (document.visibilityState === "visible") onActive(); };
onMounted(() => {
  for (const ev of ["pointerdown", "keydown", "wheel"] as const) window.addEventListener(ev, onActive, { passive: true, capture: true });
  document.addEventListener("visibilitychange", onVisible);
});
onBeforeUnmount(() => {
  for (const ev of ["pointerdown", "keydown", "wheel"] as const) window.removeEventListener(ev, onActive, { capture: true });
  document.removeEventListener("visibilitychange", onVisible);
});
/**
 * 「はじめに」の窓は上のボタンで開くだけ。初めて来た人にも勝手には出さない
 * (2026-10-10 オーナー「初訪問のポップアップいらんな、打たせようぜ、2 回目と同じで開いたら即」。前は初回に出していた)
 */
const WELCOME_KEY = "exiledesk.web.welcomed";
const welcomeOpen = ref(false);
let firstVisit = false;
try { firstVisit = !localStorage.getItem(WELCOME_KEY); localStorage.setItem(WELCOME_KEY, "1"); } catch { /* 無くてよい */ }
// 更新した後に 1 回だけ更新内容を出す。初めて来た人には出さない (2026-10-10)
initChangelog(firstVisit);
function closeWelcome(): void { welcomeOpen.value = false; }
const DESIGN_WIDTH = 1660;
const frame = ref({ w: DESIGN_WIDTH, h: 900 });
/**
 * スマホ (幅 768 CSS px 未満): 縮めずに等倍で、縦に積む並び (2026-10-08 オーナー「1080×1920 で表示頑張って作るか」「横スクロールは無しで調整」)。
 * 前は 0.55 倍まで縮めていて、字が 6 px ほどで読めなかった
 */
const phone = ref(false);
function fitZoom(): void {
  phone.value = window.innerWidth < 768;
  // iPad など: 縮めると字が 7〜8 px になって読めないので、1280 未満は等倍、それより広くても 0.85 倍より小さくしない (並びは幅に合わせて折り返す。2026-10-10)
  const z = phone.value || window.innerWidth < 1280 ? 1 : Math.min(1.6, Math.max(0.85, window.innerWidth / DESIGN_WIDTH));
  document.documentElement.style.zoom = String(z);
  frame.value = { w: window.innerWidth / z, h: window.innerHeight / z };
}
fitZoom();
window.addEventListener("resize", fitZoom);
</script>

<template>
  <!-- 高さを決めず、ページ全体を縦に送る (決まり事の footer も一緒に流れる)。PC も同じ: スクロールの棒は窓の右端の 1 本だけ
       (2026-10-11 オーナー「スクロールはチャンネルの右側でおｋ、全体スクロールだけ」) -->
  <div class="flex flex-col" :style="{ width: `${frame.w}px`, minHeight: `${frame.h}px` }">
    <header class="flex shrink-0 items-center gap-3 border-b border-[var(--exile-color-border-subtle)] px-4 text-[12px]" :class="phone ? 'h-auto flex-wrap gap-1.5 px-2 py-1.5 text-[12px]' : 'h-10'">
      <!-- スマホは 2 段 (1 段目 = ロゴ、2 段目 = 版とボタン。2026-10-10 支援するを足して 1 段に入らなくなった) -->
      <span class="flex shrink-0 items-center" :class="phone ? 'basis-full gap-1' : 'gap-2'">
        <img src="/favicon.png" alt="" class="g-brand-icon shrink-0" :class="phone ? 'size-6' : 'size-8'" draggable="false" />
        <span class="g-brand-word leading-none" :class="phone ? 'text-[13px]' : 'text-[18px]'">EXILEDESK</span>
        <!-- 言語 (2026-10-10 英語版)。スマホは 1 段目の右 -->
        <span v-if="phone" class="ml-auto"><LangSwitch /></span>
      </span>
      <span class="rounded border border-white/15 px-1.5 py-0.5 opacity-70" :class="phone ? 'hidden' : ''">{{ tr("クラフトステージ", "Craft Stage") }}</span>
      <!-- 版を押すと更新履歴 (2026-10-10) -->
      <button type="button" class="g-plain ml-auto opacity-50 hover:opacity-100 hover:text-[var(--exile-color-accent-focus)]" :class="phone ? '!min-h-9 shrink-0 text-[10px]' : ''" :title="tr('更新履歴を見る', 'View changelog')" @click="changelogOpen = 'all'">v{{ pkg.version }}</button>
      <LangSwitch v-if="!phone" />
      <!-- 帯のボタンは窓と同じ g-btn sm (2026-10-10 動きの揃え 6) -->
      <button type="button" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''" :title="tr('何ができるか', 'What you can do')" @click="welcomeOpen = true">{{ tr("はじめに", "Guide") }}</button>
      <button type="button" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''" :title="tr('要望やバグを送る (今の画面の状態を添付できる)', 'Send feedback or bug reports (you can attach the current screen state)')" @click="feedbackOpen = true">{{ phone ? tr("要望・バグ", "Feedback") : tr("要望・バグを送る", "Send feedback") }}</button>
      <!-- 支援 (投げ銭)。リンクが 1 つも無ければ出さない (2026-10-10) -->
      <button v-if="SUPPORT_LINKS.length" type="button" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''" :title="tr('ExileDesk を支援する', 'Support ExileDesk')" @click="supportOpen = true">{{ tr("支援する", "Support") }}</button>
      <!-- アプリ版はサブスク限定で配る予定なので、今は近日公開の表示だけ (2026-10-07 オーナー「カミングスーンでおｋ」) -->
      <span class="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 font-bold text-amber-100/80" :class="phone ? 'hidden' : ''" :title="tr('相場の自動取得・取引履歴・火力チェックなどが入ったアプリ版を準備中', 'A desktop app with automatic market prices, trade history, DPS check and more is in the works')">{{ tr("アプリ版 近日公開", "Desktop app coming soon") }}</span>
    </header>
    <MarketNotice />
    <!-- ?nolog=1 で開いた時の結果 (2026-10-10) -->
    <p v-if="forgetResult" class="flex items-center gap-2 px-4 py-1.5 text-[12px]" :class="forgetResult.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-amber-900/40 text-amber-200'">
      {{ forgetResult.text }}
      <button type="button" class="g-plain ml-auto opacity-60 hover:opacity-100" @click="forgetResult = null">×</button>
    </p>
    <WelcomeDialog :open="welcomeOpen" @close="closeWelcome" />
    <!-- ジェム・ベースなどのカードの重なり (アプリの App.vue と同じ部品) -->
    <HoverStack />
    <ChangelogDialog />
    <SupportDialog />
    <FeedbackDialog :open="feedbackOpen" @close="feedbackOpen = false" />
    <!-- スマホは縦に積む: ステージ → チャンネル (横スクロールは出さない) -->
    <div class="flex min-h-0 flex-1" :class="phone ? 'flex-col' : ''">
      <CraftStage class="min-w-0 flex-1 !h-auto !overflow-visible" :class="phone ? 'shrink-0' : ''">
        <template #footer>
          <!-- 決まり事 (2026-10-07、2026-10-10 から画面に貼り付けずクラフトステージの一番下): 非公式のファンサイトであること・素材の権利・相場と確率の出どころ。1 行だけ -->
          <footer class="-mx-4 mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--exile-color-border-subtle)] px-4 py-2 text-[10px] opacity-50">
            <span>{{ tr("ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。", "ExileDesk is an unofficial fan site and is not affiliated with or endorsed by Grinding Gear Games. Path of Exile 2 and all related names and images are the property of Grinding Gear Games.") }}</span>
            <span>{{ tr("相場は", "Market prices from") }} <a href="https://poe2scout.com/" target="_blank" rel="noopener" class="underline">poe2scout</a>{{ tr("、確率はゲームのデータからの推定で、結果を保証するものではありません。", ". Chances are estimates from game data; results are not guaranteed.") }}</span>
            <span>{{ tr("使い方の記録 (打った手・回した結果など。名前や IP は含みません) を改善のために集めています。", "We collect usage data (actions used, results, etc. No names or IPs) to improve the site.") }}<button type="button" class="ml-1 underline" :title="noLogOn ? tr('この端末の記録を再開する', 'Resume logging on this device') : tr('この端末からは記録を送らない', 'Stop sending usage data from this device')" @click="setNoLog(!noLogOn)">{{ noLogOn ? tr("この端末は記録していません (再開する)", "Not logging on this device (resume)") : tr("この端末は記録しない", "Don't log this device") }}</button></span>
            <span class="ml-auto">{{ tr("協賛の枠には PR と表示します", "Sponsored slots are marked PR") }}</span>
          </footer>
        </template>
      </CraftStage>
      <!-- PC のチャンネルは送っても画面に付いてくる (2026-10-11 オーナー「右のチャンネルは追従型」)。仕切りの線は下まで (aside は伸ばし、中だけ sticky) -->
      <aside class="shrink-0 border-[var(--exile-color-border-subtle)] p-3" :class="phone ? 'border-t' : 'w-[280px] border-l'">
        <div :class="phone ? '' : 'sticky top-3'"><LivePanel /></div>
      </aside>
    </div>
  </div>
</template>

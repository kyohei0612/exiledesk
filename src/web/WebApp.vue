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
import MarketNotice from "./MarketNotice.vue";
import pkg from "../../package.json";

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
  void marketStore.refreshMarket();
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
/** 初めて来た人の窓: 1 回閉じたら出さない (上の「はじめに」で開き直せる) */
const WELCOME_KEY = "exiledesk.web.welcomed";
const welcomeOpen = ref(false);
try { welcomeOpen.value = !localStorage.getItem(WELCOME_KEY); } catch { welcomeOpen.value = true; }
function closeWelcome(): void { welcomeOpen.value = false; try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* 無くてよい */ } }
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
  <!-- スマホは高さを決めず、ページ全体を縦に送る (決まり事の footer も一緒に流れる) -->
  <div class="flex flex-col" :style="phone ? { width: `${frame.w}px`, minHeight: `${frame.h}px` } : { width: `${frame.w}px`, height: `${frame.h}px` }">
    <header class="flex shrink-0 items-center gap-3 border-b border-[var(--exile-color-border-subtle)] px-4 text-[12px]" :class="phone ? 'h-auto flex-wrap gap-y-1.5 py-2 text-[13px]' : 'h-10'">
      <span class="flex items-center gap-2">
        <img src="/favicon.png" alt="" class="g-brand-icon size-8 shrink-0" draggable="false" />
        <span class="g-brand-word text-[18px] leading-none">EXILEDESK</span>
        <span class="g-brand-sub uppercase">Web</span>
      </span>
      <span class="rounded border border-white/15 px-1.5 py-0.5 opacity-70" :class="phone ? 'hidden' : ''">クラフトステージ</span>
      <span class="ml-auto opacity-40" :class="phone ? 'text-[10px]' : ''">v{{ pkg.version }}</span>
      <button type="button" class="rounded-lg border border-white/20 px-2.5 py-0.5 hover:bg-white/10" :class="phone ? 'ml-auto py-2' : ''" title="何ができるか" @click="welcomeOpen = true">はじめに</button>
      <button type="button" class="rounded-lg border border-white/20 px-2.5 py-0.5 hover:bg-white/10" :class="phone ? 'py-2' : ''" title="要望やバグを送る (今の画面の状態を添付できる)" @click="feedbackOpen = true">要望・バグを送る</button>
      <!-- アプリ版はサブスク限定で配る予定なので、今は近日公開の表示だけ (2026-10-07 オーナー「カミングスーンでおｋ」) -->
      <span class="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 font-bold text-amber-100/80" :class="phone ? 'hidden' : ''" title="相場の自動取得・取引履歴・火力チェックなどが入ったアプリ版を準備中">アプリ版 近日公開</span>
    </header>
    <MarketNotice />
    <WelcomeDialog :open="welcomeOpen" @close="closeWelcome" />
    <FeedbackDialog :open="feedbackOpen" @close="feedbackOpen = false" />
    <!-- スマホは縦に積む: ステージ → チャンネル (横スクロールは出さない) -->
    <div class="flex min-h-0 flex-1" :class="phone ? 'flex-col' : ''">
      <CraftStage class="min-w-0 flex-1" :class="phone ? 'shrink-0 !h-auto !overflow-visible' : ''" />
      <aside class="shrink-0 border-[var(--exile-color-border-subtle)] p-3" :class="phone ? 'border-t' : 'w-[280px] overflow-y-auto border-l'">
        <LivePanel />
      </aside>
    </div>
    <!-- 決まり事 (2026-10-07): 非公式のファンサイトであること・素材の権利・相場と確率の出どころ。1 行だけ -->
    <footer class="flex shrink-0 items-center gap-3 border-t border-[var(--exile-color-border-subtle)] px-4 text-[10px] opacity-50" :class="phone ? 'h-auto flex-wrap py-1.5' : 'h-7'">
      <span>ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。</span>
      <span>相場は <a href="https://poe2scout.com/" target="_blank" rel="noopener" class="underline">poe2scout</a>、確率はゲームのデータからの推定で、結果を保証するものではありません。</span>
      <span class="ml-auto">協賛の枠には PR と表示します</span>
    </footer>
  </div>
</template>

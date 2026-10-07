<script setup lang="ts">
/**
 * Web 版の殻 (2026-10-07 オーナー「ウェブ版でクラフトステージ動かないとダメ」)。
 * 上に名前とアプリ版へのリンク、真ん中にクラフトステージ (アプリと同じ部品)、右に配信中のチャンネル (server/live の /live.json)。
 * アプリ版の App.vue にある起動の処理 (更新・PoB・画像パック・ログイン・見回り) は Web では要らないので載せない。
 * 画面は 1660 幅で組んだ絵を窓に合わせて拡大縮小する (アプリと同じ。狭い時は縮める)
 */
import { ref } from "vue";
import CraftStage from "../views/craft-stage/CraftStage.vue";
import LivePanel from "./LivePanel.vue";
import FeedbackDialog from "./FeedbackDialog.vue";
import WelcomeDialog from "./WelcomeDialog.vue";
import MarketNotice from "./MarketNotice.vue";
import { APP_DOWNLOAD_URL } from "./config";
import pkg from "../../package.json";

const feedbackOpen = ref(false);
/** 初めて来た人の窓: 1 回閉じたら出さない (上の「はじめに」で開き直せる) */
const WELCOME_KEY = "exiledesk.web.welcomed";
const welcomeOpen = ref(false);
try { welcomeOpen.value = !localStorage.getItem(WELCOME_KEY); } catch { welcomeOpen.value = true; }
function closeWelcome(): void { welcomeOpen.value = false; try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* 無くてよい */ } }
const DESIGN_WIDTH = 1660;
const frame = ref({ w: DESIGN_WIDTH, h: 900 });
function fitZoom(): void {
  const z = Math.min(1.6, Math.max(0.55, window.innerWidth / DESIGN_WIDTH));
  document.documentElement.style.zoom = String(z);
  frame.value = { w: window.innerWidth / z, h: window.innerHeight / z };
}
fitZoom();
window.addEventListener("resize", fitZoom);
</script>

<template>
  <div class="flex flex-col" :style="{ width: `${frame.w}px`, height: `${frame.h}px` }">
    <header class="flex h-10 shrink-0 items-center gap-3 border-b border-[var(--exile-color-border-subtle)] px-4 text-[12px]">
      <span class="text-[15px] font-bold tracking-wide text-amber-200">ExileDesk</span>
      <span class="opacity-50">Web</span>
      <span class="rounded border border-white/15 px-1.5 py-0.5 opacity-70">クラフトステージ</span>
      <span class="ml-auto opacity-40">v{{ pkg.version }}</span>
      <button type="button" class="rounded-lg border border-white/20 px-2.5 py-0.5 hover:bg-white/10" title="何ができるか" @click="welcomeOpen = true">はじめに</button>
      <button type="button" class="rounded-lg border border-white/20 px-2.5 py-0.5 hover:bg-white/10" title="要望やバグを送る (今の画面の状態を添付できる)" @click="feedbackOpen = true">要望・バグを送る</button>
      <a :href="APP_DOWNLOAD_URL" target="_blank" rel="noopener" class="rounded-lg border border-amber-400/50 bg-amber-500/10 px-2.5 py-0.5 font-bold text-amber-100 hover:bg-amber-500/20" title="相場の自動取得・取引履歴・火力チェックなどはアプリ版で">アプリ版をダウンロード ↗</a>
    </header>
    <MarketNotice />
    <WelcomeDialog :open="welcomeOpen" @close="closeWelcome" />
    <FeedbackDialog :open="feedbackOpen" @close="feedbackOpen = false" />
    <div class="flex min-h-0 flex-1">
      <CraftStage class="min-w-0 flex-1" />
      <aside class="w-[280px] shrink-0 overflow-y-auto border-l border-[var(--exile-color-border-subtle)] p-3">
        <LivePanel />
      </aside>
    </div>
    <!-- 決まり事 (2026-10-07): 非公式のファンサイトであること・素材の権利・相場と確率の出どころ。1 行だけ -->
    <footer class="flex h-7 shrink-0 items-center gap-3 border-t border-[var(--exile-color-border-subtle)] px-4 text-[10px] opacity-50">
      <span>ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。</span>
      <span>相場は <a href="https://poe2scout.com/" target="_blank" rel="noopener" class="underline">poe2scout</a>、確率はゲームのデータからの推定で、結果を保証するものではありません。</span>
      <span class="ml-auto">協賛の枠には PR と表示します</span>
    </footer>
  </div>
</template>

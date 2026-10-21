<!--
  InstallButton.vue — このサイトをアプリとして入れるボタン (PWA)。中身・広告はウェブと同じで、窓がアプリのように独立するだけ。
  - スマホ (phone): 上の帯の「追加」(2026-10-17 オーナー「追加ボタンあれば押すだろうね」)。Chrome・Android は追加の窓、iPhone・iPad の Safari は手順
  - PC (pc): 前の「アプリ版 近日公開」の所に「アプリ版はこちら」(2026-10-17 オーナー「クリックしたらウェブアプリでデスクトップに置けるように」)。
    Chrome・Edge は追加の窓。出せない時はブラウザに合った手順 (Mac の Safari は Dock に追加、Firefox は Chrome か Edge で)
  もうアプリとして開いている時は出さない
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { canInstall, install, iosSafari, standalone } from "./pwa";
import { tr } from "../i18n/lang";
import { useDismiss } from "../utils/use-dismiss";

const props = defineProps<{ phone: boolean; pc?: boolean }>();
const tip = ref(false);
const wrap = ref<HTMLElement | null>(null);
// 手順の吹き出しは枠の外を押す・Esc で閉じる (2026-10-22 オーナー、全部の画面の決まり)
useDismiss(() => tip.value, [wrap], () => { tip.value = false; });
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const edge = /Edg\//.test(ua);
const chromium = /Chrome\//.test(ua);
const macSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !chromium;
/** 窓を出せない時の手順 */
const steps = computed((): string => {
  if (iosSafari) return tr("Safari の下の「共有」ボタン (□↑) を押して、「ホーム画面に追加」を選んでください。", "Tap the Share button (□↑) in Safari, then choose “Add to Home Screen”.");
  if (edge) return tr("右上のメニュー (…) →「アプリ」→「このサイトをアプリとしてインストール」を選んでください。", "Open the menu (…) → Apps → “Install this site as an app”.");
  if (chromium) return tr("右上のメニュー (︙) →「キャスト、保存、共有」→「ページをアプリとしてインストール」を選んでください。", "Open the menu (︙) → Cast, save, and share → “Install page as app”.");
  if (macSafari) return tr("メニューバーの「ファイル」→「Dock に追加」を選んでください (macOS Sonoma 以降)。", "In the menu bar choose File → “Add to Dock” (macOS Sonoma or later).");
  return tr("このブラウザではアプリとして入れられません。Chrome か Edge で開いてください。", "This browser can’t install it as an app. Please open the site in Chrome or Edge.");
});
const shown = computed(() => !standalone && (props.pc || canInstall.value || iosSafari));
async function onClick(): Promise<void> {
  if (await install()) return;
  tip.value = !tip.value;
}
</script>

<template>
  <span v-if="shown" ref="wrap" class="relative" data-pwa-install>
    <button v-if="pc" type="button" data-rec-part="header-app" class="whitespace-nowrap rounded-lg border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 font-bold text-amber-100/80 hover:bg-amber-500/20 hover:text-amber-100" :title="tr('このサイトをアプリとしてデスクトップに置く (中身はウェブと同じ)', 'Install this site as a desktop app (same as the web version)')" @click="onClick">{{ tr("アプリ版はこちら", "Get the app") }}</button>
    <button v-else type="button" class="g-btn sm" :class="phone ? '!min-h-9 !px-0 text-[12px]' : ''" :title="tr('ホーム画面に追加して、アプリのように開く (オフラインでも使える)', 'Add to your home screen and open it like an app (works offline)')" @click="onClick">{{ phone ? tr("追加", "Install") : tr("ホーム画面に追加", "Add to home screen") }}</button>
    <span v-if="tip" class="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-white/15 bg-[var(--exile-color-surface-raised,#16130f)] p-2.5 text-left text-[12px] font-normal leading-relaxed text-[var(--exile-color-text-primary)] shadow-lg" @click="tip = false">{{ steps }}</span>
  </span>
</template>

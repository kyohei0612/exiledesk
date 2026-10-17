/**
 * pwa.ts — ホーム画面に追加 (PWA、2026-10-17 オーナー)。サービスワーカー (public/sw.js) を登録し、追加のボタン (InstallButton.vue) に状態を渡す。
 *   - Chrome・Edge・Android: ブラウザの beforeinstallprompt を取っておき、ボタンで出す
 *   - iPhone・iPad の Safari: 仕組みが無いので、ボタンで「共有 → ホーム画面に追加」の手順を出す
 *   - もう追加して開いている時 (standalone) は出さない
 * 開発中 (vite) は登録しない (作った物の名前が変わり続けるので取っておくと古い物が出る)
 */
import { ref } from "vue";
import { logRecord } from "../utils/log-record";

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let deferred: InstallPrompt | null = null;
/** ブラウザの「追加」の窓を出せる */
export const canInstall = ref(false);
/** iPhone・iPad の Safari (手順を出す) */
export const iosSafari = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(navigator.userAgent);
/** もう追加したアプリとして開いている */
export const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

export function startPwa(): void {
  if (typeof window === "undefined") return;
  // 画面の JS より先に来た知らせは web.html の頭が取っておいてある
  const early = (window as { __bip?: InstallPrompt }).__bip;
  if (early) { deferred = early; canInstall.value = true; }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPrompt; canInstall.value = true; });
  window.addEventListener("appinstalled", () => { canInstall.value = false; deferred = null; logRecord("pwa", { to: "installed" }); });
  if (standalone) logRecord("pwa", { to: "open" });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
  }
}

/** 追加の窓を出す (Chrome・Edge・Android)。出せなければ false */
export async function install(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  logRecord("pwa", { to: outcome });
  deferred = null;
  canInstall.value = false;
  return true;
}

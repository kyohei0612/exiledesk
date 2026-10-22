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

/** 古い塊で読み直した時刻 (sessionStorage)。この間にもう一度起きたら読み直さない (無限に読み直さない印) */
const STALE_KEY = "exiledesk-stale-reload";
const STALE_GAP_MS = 60_000;
/**
 * 版が替わった後の古い塊 (2026-10-22 オーナー OK、notes/2026-10-22-sw-err-failed.md の案 ①): 開いたままのタブが、次のデプロイで消えた
 * 前の版の JS の塊を後から読むと失敗して画面が壊れる。vite が出す vite:preloadError で 1 回だけ読み直して新しい版にする。
 * 1 分以内に 2 回目が起きた時・印を書けない時 (保存を止めた端末) は読み直さず、今までどおりのエラーにする
 */
export function startStaleReload(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    let last = 0;
    try { last = Number(sessionStorage.getItem(STALE_KEY)) || 0; } catch { return; }
    if (Date.now() - last < STALE_GAP_MS) return;
    try { sessionStorage.setItem(STALE_KEY, String(Date.now())); } catch { return; }
    e.preventDefault();
    logRecord("stale_reload", { msg: String((e as Event & { payload?: unknown }).payload ?? "").slice(0, 120) });
    location.reload();
  });
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

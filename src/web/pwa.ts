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

/**
 * 版が替わった後の古い塊 (2026-10-22 オーナー OK、notes/2026-10-22-sw-err-failed.md の案 ①): 開いたままのタブが、次のデプロイで消えた
 * 前の版の JS の塊を後から読むと失敗して画面が壊れる。vite が出す vite:preloadError (後から読む部品の import() は全部これを通る) で読み直して新しい版にする。
 * 読み直しの作りは web.html の頭の __staleReload (入口の塊と同じ 1 か所。新しい版が揃うのを待ってから 1 回、1 分に 3 回まで、10-23)。
 * false (回数を使い切った・印を書けない端末) の時は読み直さず、今までどおりのエラーにする
 */
export function startStaleReload(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    const w = window as { __staleGo?: number; __staleReload?: () => boolean };
    const first = !w.__staleGo;
    if (!w.__staleReload?.()) return;
    e.preventDefault();
    if (!first) return;
    let mark = "";
    try { mark = sessionStorage.getItem("exiledesk-stale-reload") ?? ""; } catch { /* 印は __staleReload が書けた */ }
    logRecord("stale_reload", { mark, msg: String((e as Event & { payload?: unknown }).payload ?? "").slice(0, 120) });
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

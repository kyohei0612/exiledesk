/**
 * PWA (2026-10-15 オーナー「追加ボタンあれば押すだろうね」「計算機だし」オフラインでも全部動く)。service worker の本体は scripts/pwa-sw.js。
 *
 * 更新: 電波がつながった時・戻ってきた時・1 時間おきに新しい版を確かめ、SW が裏で落とし終えたら「新しい版があります → 更新」(updateReady)。
 * 押さなければ次に開いた時に切り替わる (開いた時に待っている版があれば、その場で切り替えて読み直す)。切り替わった後は今の「更新しました」の窓 (changelog.ts) がそのまま 1 回出る。
 * ホーム画面に追加: Android / PC の Chrome はブラウザの案内 (beforeinstallprompt)、iPhone / iPad は手順の窓 (共有 → ホーム画面に追加)。
 * 開発中 (vite dev) とアプリ版 (Tauri) では何もしない
 */
import { ref } from "vue";

/** 電波が無い (navigator.onLine)。相場は最後の値で「◯時の値段」と出す・要望と記録は戻ったら送る */
export const offline = ref(typeof navigator !== "undefined" && navigator.onLine === false);
/** 新しい版を落とし終えて待っている */
export const updateReady = ref(false);

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: InstallPromptEvent | null = null;
const standalone = (): boolean => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
/** iPhone / iPad の Safari (iPadOS は Mac の名乗りでタッチがある) */
export const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** 「ホーム画面に追加」のボタン: prompt = ブラウザの案内を出せる、ios = 手順を出す、null = 出さない (入れた後・出せないブラウザ) */
export const installKind = ref<"prompt" | "ios" | null>(null);
/** iPhone の手順の窓 */
export const iosHelpOpen = ref(false);

function refreshInstallKind(): void {
  installKind.value = standalone() ? null : isIos ? "ios" : deferred ? "prompt" : null;
}

export async function install(): Promise<void> {
  if (installKind.value === "ios") { iosHelpOpen.value = true; return; }
  const ev = deferred;
  if (!ev) return;
  deferred = null;
  await ev.prompt().catch(() => undefined);
  await ev.userChoice.catch(() => undefined);
  refreshInstallKind();
}

let reg: ServiceWorkerRegistration | null = null;
let reloading = false;
/** 押した時: 待っている版に切り替えて読み直す */
export function applyUpdate(): void {
  const w = reg?.waiting;
  if (!w) { location.reload(); return; }
  w.postMessage({ type: "SKIP_WAITING" });
}
function watchInstalling(r: ServiceWorkerRegistration): void {
  const w = r.installing;
  if (!w) return;
  w.addEventListener("statechange", () => {
    // 前の版が動いている時だけ「新しい版」(初めて入れた時は出さない)
    if (w.state === "installed" && navigator.serviceWorker.controller) updateReady.value = true;
  });
}
const UPDATE_GAP_MS = 30 * 60_000;
let lastCheck = 0;
/** 新しい版を確かめる (電波がある時だけ。30 分に 1 回まで) */
export function checkUpdate(force = false): void {
  if (!reg || offline.value || (!force && Date.now() - lastCheck < UPDATE_GAP_MS)) return;
  lastCheck = Date.now();
  void reg.update().catch(() => undefined);
}

/** 電波が戻った時に呼ぶ物 (要望の送り直しなど) */
const onlineHooks: Array<() => void> = [];
export function onOnline(fn: () => void): void { onlineHooks.push(fn); }

export function startPwa(): void {
  addEventListener("online", () => { offline.value = false; checkUpdate(true); for (const f of onlineHooks) { try { f(); } catch { /* 次へ */ } } });
  addEventListener("offline", () => { offline.value = true; });
  // ボタンはブラウザが「入れられる」と言った時だけ (早めに聞いておく)
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; refreshInstallKind(); });
  addEventListener("appinstalled", () => { deferred = null; refreshInstallKind(); });
  refreshInstallKind();
  if (import.meta.env.DEV || !("serviceWorker" in navigator) || location.hostname === "web.exiledesk.workers.dev") return;
  // 初めて入った時 (clients.claim) は読み直さない。版が切り替わった時だけ
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  // 画面と広告を先に読み終えてから (SW は裏で約 30 MB を落とす)
  const go = (): void => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((r) => {
      reg = r;
      lastCheck = Date.now();
      // 前に開いた時に落としてあった版 = 「次に開いた時に切り替わる」。今の窓が古い版のままなら切り替える
      if (r.waiting && navigator.serviceWorker.controller) { r.waiting.postMessage({ type: "SKIP_WAITING" }); return; }
      watchInstalling(r);
      r.addEventListener("updatefound", () => watchInstalling(r));
    }).catch(() => undefined);
  };
  if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
  setInterval(() => checkUpdate(), 60 * 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
}

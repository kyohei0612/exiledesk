/**
 * 操作の印を送る側 (Web 版、2026-10-07 オーナー「どこでつまずいたか・離脱・どこから来たか・スマホか PC か」)。
 * cookie は使わない。uid = localStorage の乱数 (再訪を数える)、sid = このタブの乱数 (訪問を数える)。名前や IP は送らない。
 * 15 秒ごと・画面を離れる時に sendBeacon でまとめて POST /event。直前の流れ (trail) は要望・バグの添付にも使う
 */
import { watch } from "vue";
import { craftStage } from "../state/craft-stage";
import { WEB_API_BASE } from "./config";

const UID_KEY = "exiledesk.web.uid";
const FLUSH_MS = 15_000;
/**
 * 滞在の印は 5 分おき、しかも最後に触ってから 5 分以内の時だけ (放置・裏に回したタブは何も送らない)。
 * 2026-10-07 オーナー「開きっぱなしだけ対策できるかな」(1 分おきだと開きっぱなしの 1 時間で 60 回サーバーを呼んでいた)
 */
const PING_MS = 300_000;
let lastActive = Date.now();

const rand = (): string => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
function uidOf(): { uid: string; first: boolean } {
  try {
    const v = localStorage.getItem(UID_KEY);
    if (v) return { uid: v, first: false };
    const u = rand(); localStorage.setItem(UID_KEY, u);
    return { uid: u, first: true };
  } catch { return { uid: rand(), first: false }; }
}
const { uid, first } = uidOf();
const sid = rand();
const dev = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "pc";
const ref = (() => { try { return document.referrer ? new URL(document.referrer).hostname : "direct"; } catch { return "direct"; } })();

const buf: Array<{ n: string; x?: string }> = [];
/** 直前の流れ (要望・バグに添付)。印の名前と時刻 */
const trail: Array<{ n: string; t: number }> = [];
const once = new Set<string>();

export function track(name: string, extra?: string): void {
  buf.push({ n: name, ...(extra ? { x: extra.slice(0, 120) } : {}) });
  trail.push({ n: name, t: Date.now() });
  if (trail.length > 40) trail.shift();
  if (buf.length >= 40) flush();
}
/** 同じ訪問で 1 回だけ数える印 (段階) */
export function trackOnce(name: string): void {
  if (once.has(name)) return;
  once.add(name);
  track(name);
}
/** 要望・バグに付ける「直前の流れ」(何秒前か) */
export function trailNow(): Array<{ n: string; ago: number }> {
  const now = Date.now();
  return trail.map((e) => ({ n: e.n, ago: Math.round((now - e.t) / 1000) }));
}

/** 直近の JS エラーと console.error (要望・バグの添付用。本文が「バグっぽい」だけでも原因が追えるように) */
const recentErrors: Array<{ t: number; msg: string; stack?: string }> = [];
const recentConsole: Array<{ t: number; msg: string }> = [];
function pushError(msg: string, stack?: string): void {
  recentErrors.push({ t: Date.now(), msg: msg.slice(0, 300), ...(stack ? { stack: stack.slice(0, 600) } : {}) });
  if (recentErrors.length > 8) recentErrors.shift();
}
export function diagNow(): { errors: Array<{ ago: number; msg: string; stack?: string }>; console: Array<{ ago: number; msg: string }> } {
  const now = Date.now();
  return {
    errors: recentErrors.map((e) => ({ ago: Math.round((now - e.t) / 1000), msg: e.msg, ...(e.stack ? { stack: e.stack } : {}) })),
    console: recentConsole.map((e) => ({ ago: Math.round((now - e.t) / 1000), msg: e.msg })),
  };
}

let sentAny = false;
export function flush(): void {
  if (!buf.length) return;
  const body = JSON.stringify({ uid, sid, first: first && !sentAny, dev, ref, ev: buf.splice(0, buf.length) });
  sentAny = true;
  try {
    // text/plain にするとプレフライト (OPTIONS) が要らず、sendBeacon の「資格情報あり」と `*` の組み合わせでも届く (サーバーは中身を JSON として読む)
    const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
    if (!navigator.sendBeacon?.(`${WEB_API_BASE}/event`, blob)) void fetch(`${WEB_API_BASE}/event`, { method: "POST", body, headers: { "content-type": "text/plain;charset=UTF-8" }, keepalive: true, credentials: "omit" }).catch(() => undefined);
  } catch { /* 印は落としてよい */ }
}

/** 入口で 1 回。印の受け口を登録し、自動で付く印 (開いた・段階・滞在・JS エラー) を始める */
export function startTracking(): void {
  (globalThis as { __exiledeskTrack?: (n: string, x?: string) => void }).__exiledeskTrack = track;
  trackOnce("open");
  const s = craftStage;
  watch(s.mode, (m) => trackOnce(`mode:${m}`), { immediate: true });
  watch(() => s.log.value.length, (n) => { if (n > 0) trackOnce("hand:use"); });
  watch(s.simPicked, (v) => { if (v) trackOnce("sim:base"); });
  watch(() => s.simTargets.value.length, (n) => { if (n > 0) trackOnce("sim:targets"); });
  watch(() => s.simOrder.value.length, (n) => { if (n > 0) trackOnce("sim:order"); });
  watch(() => s.simPatterns.value.some((p) => p.steps.length > 0), (v) => { if (v) trackOnce("sim:pattern"); });
  // ResizeObserver の「loop completed」はブラウザの害のない警告 (画面を伸び縮みさせると大量に出る) なので数えない (2026-10-08 日報で 770 件になっていた)
  window.addEventListener("error", (e) => { if (/ResizeObserver loop/.test(String(e.message ?? ""))) return; const m = `${e.message ?? "error"} @${(e.filename ?? "").split("/").pop()}:${e.lineno ?? 0}`; track("error", m); pushError(m, (e.error as Error)?.stack); });
  window.addEventListener("unhandledrejection", (e) => { const m = String((e.reason as Error)?.message ?? e.reason).slice(0, 120); track("error", m); pushError(m, (e.reason as Error)?.stack); });
  // console.error / warn も残す (画面の部品が出す「取れなかった」などの手がかり)
  for (const k of ["error", "warn"] as const) {
    const orig = console[k].bind(console);
    console[k] = (...args: unknown[]) => { try { recentConsole.push({ t: Date.now(), msg: `${k}: ${args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(" ").slice(0, 200)}` }); if (recentConsole.length > 12) recentConsole.shift(); } catch { /* 無視 */ } orig(...args); };
  }
  for (const ev of ["pointerdown", "keydown", "wheel"] as const) window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true });
  setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastActive < PING_MS) { track("ping"); flush(); } }, PING_MS);
  setInterval(flush, FLUSH_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
}

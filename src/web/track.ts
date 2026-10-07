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
const PING_MS = 60_000;

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

let sentAny = false;
export function flush(): void {
  if (!buf.length) return;
  const body = JSON.stringify({ uid, sid, first: first && !sentAny, dev, ref, ev: buf.splice(0, buf.length) });
  sentAny = true;
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(`${WEB_API_BASE}/event`, blob)) void fetch(`${WEB_API_BASE}/event`, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
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
  window.addEventListener("error", (e) => track("error", `${e.message ?? "error"} @${(e.filename ?? "").split("/").pop()}:${e.lineno ?? 0}`));
  window.addEventListener("unhandledrejection", (e) => track("error", String((e.reason as Error)?.message ?? e.reason).slice(0, 120)));
  setInterval(() => { if (document.visibilityState === "visible") { track("ping"); flush(); } }, PING_MS);
  setInterval(flush, FLUSH_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
}

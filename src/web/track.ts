/**
 * 操作の印を送る側 (Web 版、2026-10-07 オーナー「どこでつまずいたか・離脱・どこから来たか・スマホか PC か」)。
 * cookie は使わない。uid = localStorage の乱数 (再訪を数える)、sid = このタブの乱数 (訪問を数える)。名前や IP は送らない。
 * 印は分析用の記録 (log-sender.ts) と同じ 1 本の POST /log に乗せて、画面を離れる時に 1 回だけ送る (2026-10-10 問い合わせを減らす、前は 15 秒おきに別の /event)。
 * 直前の流れ (trail) は要望・バグの添付にも使う
 */
import { watch } from "vue";
import { craftStage, SIM_LOCKED } from "../state/craft-stage";
import { noLog } from "../utils/no-log";
import { lang } from "../i18n/lang";

const UID_KEY = "exiledesk.web.uid";
/**
 * 滞在時間 (2026-10-12 オーナー「表示中の印で本当の滞在時間」「人数が増えても誤差みたいな計測なら」)。
 * 画面が見えていて、最後に触ってから 5 分以内の秒数を端末の中で数え (放置・裏に回したタブは数えない)、送る時に「stay」の印 1 つに合計を載せる。
 * 前は 5 分おきの「表示中」の印 (ping) で、印の数が滞在の長さに比例して増えていた。今は送る回数 (1 時間に 1 回まで) と同じだけ
 */
const TICK_MS = 5_000;
const IDLE_MS = 300_000;
let activeMs = 0;
let staySent = 0;
/**
 * エミュレーターで打った手の数え (日報のベース・カレンシーの順位・一番打った人、2026-10-12 オーナー)。端末の中で数えて、送る時に名前ごと 1 つの印にまとめる
 * (手ごとに印を送らない = 打つ数が増えてもサーバーの記録は増えない)。手で付けた物・発現は数えない
 */
const useTally = new Map<string, number>();
const baseTally = new Map<string, number>();
let stepTally = 0;
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

/** 開いた時刻。印に「開いてから何秒目か」を付ける (まとめて送るとサーバーに着く時刻は全部同じになるので、滞在はこれで測る。2026-10-10) */
const t0 = Date.now();
const buf: Array<{ n: string; x?: string; s: number }> = [];
/** 直前の流れ (要望・バグに添付)。印の名前と時刻 */
const trail: Array<{ n: string; t: number }> = [];
const once = new Set<string>();

export function track(name: string, extra?: string): void {
  buf.push({ n: name, ...(extra ? { x: extra.slice(0, 120) } : {}), s: Math.round((Date.now() - t0) / 1000) });
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
/** 溜まった印を取り出す (log-sender.ts が送る時に呼ぶ)。無ければ null */
function pull(): string | null {
  // この端末は記録しない (no-log.ts)。直前の流れ (trail) は要望・バグの添付用に残す
  if (noLog()) { buf.length = 0; return null; }
  // 見ていた秒数の合計 (増えていれば)。開いてから何秒目かではなく、見ていた秒数そのもの
  const stay = Math.round(activeMs / 1000);
  if (stay > staySent) { buf.push({ n: "stay", s: stay }); staySent = stay; }
  for (const [k, v] of baseTally) buf.push({ n: "base", x: k.slice(0, 80), s: v });
  for (const [k, v] of useTally) buf.push({ n: "cur", x: k.slice(0, 80), s: v });
  if (stepTally) buf.push({ n: "steps", s: stepTally });
  baseTally.clear(); useTally.clear(); stepTally = 0;
  if (!buf.length) return null;
  const body = JSON.stringify({ uid, sid, first: first && !sentAny, dev, ref, ev: buf.splice(0, buf.length) });
  sentAny = true;
  return body;
}
(globalThis as { __exiledeskEvPull?: () => string | null }).__exiledeskEvPull = pull;
/** 今すぐ送る (印が多く溜まった時)。送るのは log-sender */
export function flush(): void {
  (globalThis as { __exiledeskLogFlush?: (beacon?: boolean) => void }).__exiledeskLogFlush?.(false);
}

/** 入口で 1 回。印の受け口を登録し、自動で付く印 (開いた・段階・滞在・JS エラー) を始める */
export function startTracking(): void {
  (globalThis as { __exiledeskTrack?: (n: string, x?: string) => void }).__exiledeskTrack = track;
  trackOnce("open");
  // 流入元の印 (?utm_source=reddit&utm_medium=post&utm_campaign=…、英語の宣伝の効き目を見る。2026-10-16)。訪問ごとに 1 回、source|medium|campaign
  try {
    const q = new URLSearchParams(location.search);
    const utm = ["utm_source", "utm_medium", "utm_campaign"].map((k) => (q.get(k) ?? "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30));
    if (utm[0]) track("utm", utm.join("|"));
  } catch { /* 無くてよい */ }
  // 画面の言語 (英語版の需要を見る。訪問ごとに 1 回、切り替えたらその言語も 1 回。2026-10-12)
  watch(lang, (l) => trackOnce(`lang:${l}`), { immediate: true });
  const s = craftStage;
  // シミュレーターを閉じている間は数えない (前に開いていた人が一瞬 sim になって数えられていた)
  watch(s.mode, (m) => { if (m === "sim" && SIM_LOCKED) return; trackOnce(`mode:${m}`); }, { immediate: true });
  watch(() => s.log.value.length, (n) => { if (n > 0) trackOnce("hand:use"); });
  // 打った手を数える (戻した時は数え直さない。新しく足された最後の手だけ)
  let lastStep: unknown = null;
  watch(s.log, (l) => {
    const p = l[l.length - 1];
    if (!p || p === lastStep || !p.out.applied) { lastStep = p ?? null; return; }
    lastStep = p;
    const cur = p.out.currency;
    if (cur.startsWith("force:") || cur.startsWith("reveal")) return;
    stepTally++;
    const b = p.before.baseJa || p.before.base;
    baseTally.set(b, (baseTally.get(b) ?? 0) + 1);
    useTally.set(p.out.currency_ja, (useTally.get(p.out.currency_ja) ?? 0) + 1);
  });
  // ベースを選ぶと手で打つ方でも simPicked が立つので、シミュレーターの時だけ (2026-10-11 日報でシミュレーション: ベースを選んだ 227 になっていた)
  watch(s.simPicked, (v) => { if (v && s.mode.value === "sim") trackOnce("sim:base"); });
  watch(s.base, () => { if (s.mode.value === "hand") trackOnce("hand:base"); });
  watch(() => s.simTargets.value.length, (n) => { if (n > 0) trackOnce("sim:targets"); });
  watch(() => s.simOrder.value.length, (n) => { if (n > 0) trackOnce("sim:order"); });
  watch(() => s.simPatterns.value.some((p) => p.steps.length > 0), (v) => { if (v) trackOnce("sim:pattern"); });
  // ResizeObserver の「loop completed」はブラウザの害のない警告 (画面を伸び縮みさせると大量に出る) なので数えない (2026-10-08 日報で 770 件になっていた)
  window.addEventListener("error", (e) => { if (/ResizeObserver loop/.test(String(e.message ?? ""))) return;
    // よそのファイル (アプリ内ブラウザ・ウォレットなどが足したスクリプト) のエラーは頭に ext: を付けて、日報で直す対象から外す (2026-10-10)
    // ユーザースクリプト (Tampermonkey など) は同じオリジンの userscript.html から動くので名前で分ける (2026-10-11 日報の「画面のエラー」は Affiliate-killer.user.js だった)
    const ext = !e.filename || !e.filename.startsWith(location.origin) || /userscript|\.user\.js/i.test(e.filename);
    const m = `${ext ? "ext: " : ""}${e.message ?? "error"} @${(e.filename ?? "").split("/").pop()}:${e.lineno ?? 0}`; track("error", m); pushError(m, (e.error as Error)?.stack); });
  // 約束の失敗は、呼び出しの跡にこのサイトのファイルが無ければよそ (アプリ内ブラウザが足した物など。2026-10-11 「response.msg」は ExileDesk に無い)
  window.addEventListener("unhandledrejection", (e) => { const st = (e.reason as Error)?.stack ?? ""; const ext = !st.includes(location.origin) || /userscript|\.user\.js/i.test(st); const m = `${ext ? "ext: " : ""}${String((e.reason as Error)?.message ?? e.reason).slice(0, 120)}`; track("error", m); pushError(m, st || undefined); });
  // console.error / warn も残す (画面の部品が出す「取れなかった」などの手がかり)
  for (const k of ["error", "warn"] as const) {
    const orig = console[k].bind(console);
    console[k] = (...args: unknown[]) => { try { recentConsole.push({ t: Date.now(), msg: `${k}: ${args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(" ").slice(0, 200)}` }); if (recentConsole.length > 12) recentConsole.shift(); } catch { /* 無視 */ } orig(...args); };
  }
  for (const ev of ["pointerdown", "keydown", "wheel"] as const) window.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true });
  // 滞在の印は溜めるだけ (次に送る時に一緒に)。送る間隔・離れる時は log-sender が持つ
  setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastActive < IDLE_MS) activeMs += TICK_MS; }, TICK_MS);
}

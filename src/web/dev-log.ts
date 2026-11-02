/**
 * 開発版の操作の記録 (2026-11-02 オーナー「1手ずつ分析できるような奴で」「シミュだけやないよ触ったボタン全てな」、U-33)。
 * dev サーバーで触った物を全部 1 行ずつ POST /__dev-log へ送り、サーバーが手元の .dev-logs/ に残す。本番のサーバーには送らない (Y-64)。
 * 中身は全部 import.meta.env.DEV の下 = 本番の作りでは devLog は空になり、この台本の残りは消える。
 * 本文は JSON の配列 (2 秒ごとにまとめて送る、受け口 scripts/vite-dev-log.mjs が要素ごとに 1 行)。1 行 = { t, n, sid, page, kind, data }、自動の Chrome は auto: 1 (窓なしは受け口が置かない)
 *   kind: open (開いた) / page (ページが替わった) / click / right / press (押したが click にならない = 無効のボタン・ドラッグ) / key / change / 各画面が devLog で足す物
 */
import { watch } from "vue";

const FLUSH_MS = 2_000;
const FLUSH_LINES = 50;
/** 押した物の見分けで寄る先 (押した所が中の字や絵でも、ボタン 1 つとして残す) */
const PICK = "button,a,input,select,textarea,label,summary,[role],[tabindex]";

let buf: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
let sid = "";
let auto = false;
let pageNow: () => string = () => "";

function flush(leaving = false): void {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!buf.length) return;
  const body = `[${buf.join(",")}]`;
  buf = [];
  if (leaving && navigator.sendBeacon("/__dev-log", body)) return;
  void fetch("/__dev-log", { method: "POST", body, keepalive: body.length < 60_000 }).catch(() => { /* 記録の失敗は画面に関係ない */ });
}

/** 1 行残す。画面の詳しい中身 (ツリーの手など) はここを呼ぶ。本番では何もしない */
export function devLog(kind: string, data: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) return;
  try {
    buf.push(JSON.stringify({ t: stamp(), n: ++seq, sid, page: pageNow(), kind, data, ...(auto ? { auto: 1 } : {}) }));
    if (buf.length >= FLUSH_LINES) flush();
    else timer ??= setTimeout(flush, FLUSH_MS);
  } catch { /* 無視 */ }
}

/** 手元の時刻 (ミリ秒まで)。ファイルを人が読むので UTC にしない */
function stamp(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 23);
}

const clip = (s: string | null | undefined, n = 80): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** data-* を押した所から上へ集める (近い方が勝つ)。data-v-* は Vue の印なので外す */
function dataOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (let e: Element | null = el, i = 0; e && e !== document.documentElement && i < 8; e = e.parentElement, i++) {
    for (const a of e.attributes) {
      if (a.name.startsWith("data-") && !a.name.startsWith("data-v-") && !(a.name in out)) out[a.name] = clip(a.value, 40);
    }
  }
  return out;
}

/** 押した物の見分け: 文字・aria-label・title・data 属性・タグ。文字が無い物 (絵だけ・地) は class の頭も */
function who(target: EventTarget | null): Record<string, unknown> {
  if (!(target instanceof Element)) return {};
  const hit = target.closest(PICK);
  const el = hit ?? target;
  // ボタンでない所 (窓の地など) は中の物の字を拾わず、そこ自身の字だけ
  const text = clip(hit ? el.textContent : [...el.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.textContent).join(" "));
  const aria = clip(el.getAttribute("aria-label"));
  const title = clip(el.getAttribute("title"));
  const data = dataOf(el);
  return {
    tag: el.tagName.toLowerCase(),
    ...(text ? { text } : {}), ...(aria ? { aria } : {}), ...(title ? { title } : {}),
    ...(Object.keys(data).length ? { attrs: data } : {}),
    ...((el as HTMLButtonElement).disabled ? { disabled: true } : {}),
    ...(text || aria || title ? {} : { cls: clip(typeof el.className === "string" ? el.className : "", 60) }),
  };
}

function keyName(e: KeyboardEvent): string {
  return [e.ctrlKey && "Ctrl", e.metaKey && "Cmd", e.altKey && "Alt", e.shiftKey && (e.key.length > 1 || e.ctrlKey || e.metaKey || e.altKey) && "Shift", e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join("+");
}

const editing = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** 入口で 1 回、画面を出す前に。window の capture なので、途中で止められる押下・鍵 (枠の外の 1 押し・窓の Esc) も拾う */
export function startDevLog(page: () => string): void {
  if (!import.meta.env.DEV) return;
  sid = Math.random().toString(36).slice(2, 8);
  auto = navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent);
  pageNow = page;
  const on = { capture: true, passive: true };
  devLog("open", { url: location.pathname + location.search, w: innerWidth, h: innerHeight });

  let down: { who: Record<string, unknown>; el: EventTarget | null; x: number; y: number } | null = null;
  window.addEventListener("pointerdown", (e) => {
    if (e.isTrusted && e.button === 0) down = { who: who(e.target), el: e.target, x: e.clientX, y: e.clientY };
  }, on);
  window.addEventListener("pointercancel", () => { down = null; }, on);
  window.addEventListener("pointerup", (e) => {
    const d = down;
    if (!d) return;
    // click が続かなければ「押したが動かない」(無効のボタン) か、ドラッグ
    setTimeout(() => {
      if (down !== d) return;
      down = null;
      devLog("press", { ...d.who, dx: Math.round(e.clientX - d.x), dy: Math.round(e.clientY - d.y) });
    }, 60);
  }, on);
  window.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    // 押している間に中身が替わると click は親に来るので、その時は押し始めの物も残す
    const d = down;
    down = null;
    const moved = d && d.el !== e.target && !(e.target instanceof Node && d.el instanceof Node && e.target.contains(d.el));
    // ドラッグでも click が来る (同じ親の中) ので、動いた分も残す
    const dx = d ? Math.round(e.clientX - d.x) : 0;
    const dy = d ? Math.round(e.clientY - d.y) : 0;
    devLog("click", { ...who(e.target), x: Math.round(e.clientX), y: Math.round(e.clientY), ...(moved ? { down: d.who } : {}), ...(Math.hypot(dx, dy) > 5 ? { dx, dy } : {}) });
  }, on);
  window.addEventListener("contextmenu", (e) => {
    if (e.isTrusted) devLog("right", { ...who(e.target), x: Math.round(e.clientX), y: Math.round(e.clientY) });
  }, on);
  window.addEventListener("keydown", (e) => {
    if (!e.isTrusted || e.repeat || /^(Control|Shift|Alt|Meta)$/.test(e.key)) return;
    // 打っている文字は 1 字ずつ残さない (入れた値は change で 1 行)
    if (editing(e.target) && e.key.length === 1 && !e.ctrlKey && !e.metaKey) return;
    devLog("key", { key: keyName(e), ...(e.target === document.body ? {} : who(e.target)) });
  }, on);
  window.addEventListener("change", (e) => {
    const t = e.target;
    if (!e.isTrusted || !(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;
    if (t.type === "password" || t.type === "file") return;
    devLog("change", { ...who(t), value: t instanceof HTMLInputElement && /^(checkbox|radio)$/.test(t.type) ? t.checked : clip(t.value, 200) });
  }, on);

  // 戻るなど、押した物の無いページの移りも残す
  watch(page, (to) => devLog("page", { to }), { flush: "sync" });
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(true); });
}

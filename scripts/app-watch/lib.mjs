/**
 * lib.mjs — シミュ以外の見張り (pages.mjs・emu.mjs) の共通: 窓なし Chrome (立てる・止めるは sim-watch の cdp.mjs)・タブ (1 つずつ別の部屋)・本物の押下とキー・変化を待つ・ネットワークの数え・結果の出し方。
 * 回し方は docs/org/dev/app-watch.md。
 * 時間で待たない (G-21、10-29 オーナー「普通に変わったら次へでええやろ時間で待つのやばいわ」): 押す・キー・開くの後は settle = DOM の変化・終わりのある動き・取り物が
 * 静かになるまで待つ。秒数は「止まった」と見る上限だけ。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openChrome, sleep } from "../sim-watch/cdp.mjs";
export { sleep };

const HERE = dirname(fileURLToPath(import.meta.url));
export const BASE_PATH = join(HERE, "baseline.json");
export const args = process.argv.slice(2);
export const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
/** 既定は dev サーバー 1440 (Y-70・R-15)。手元の本番の作り 1460 は出す直前の照らしだけ (R-09)、http://127.0.0.1:1460 を渡す */
export const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1440").replace(/\/$/, "");
/** 本番のホスト (ここへの記録の送り = Y-102 の違反) */
export const PROD_HOST = /(^|\.)exiledesk\.com$|^exiledesk-live\.exiledesk\.workers\.dev$/;

/** DevTools の口 1 本 (送って答えを待つ・出来事の受け口)。答えが 30 秒来なければ空で返す */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); const subs = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    for (const fn of subs.get(m.method) ?? []) fn(m.params);
  };
  const send = (method, params = {}) => Promise.race([
    new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
    sleep(30000).then(() => ({})),
  ]);
  const on = (method, fn) => subs.set(method, [...(subs.get(method) ?? []), fn]);
  return { send, on, close: () => { try { ws.close(); } catch { /* 閉じている */ } } };
}

// ページの中の「最後に DOM が変わってからの ms」。読み込み中・終わりのある動き (開く窓の transition など) の間は 0。ずっと回る動き (光・回転) は数えない
const QUIET_PROBE = `(() => {
  if (document.readyState !== "complete") return 0;
  if (!window.__awMut) { let t = performance.now(); new MutationObserver(() => { t = performance.now(); }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); window.__awMut = () => performance.now() - t; return 0; }
  const moving = document.getAnimations().some((a) => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity));
  return moving ? 0 : window.__awMut();
})()`;
/** 長く開いたままの取り物 (配信の様子見など) は静かさに数えない */
const LONG_REQ_MS = 3000;

/** タブ 1 つ (別の部屋 = 保存も別)。押下・キー・開く・変化待ち・ネットワークの数えを持つ。fixed = 押す・キー・開くの後を前の固定の待ちに (emu.mjs、10-29 変化待ちだと 139 → 240 秒に延びた) */
async function tab(port, browser, fixed = false) {
  const ctx = (await browser.send("Target.createBrowserContext", { disposeOnDetach: true })).result?.browserContextId;
  const targetId = (await browser.send("Target.createTarget", { url: "about:blank", browserContextId: ctx })).result?.targetId;
  if (!targetId) throw new Error("タブが開けない");
  const c = await connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
  const reqs = []; // { t, method, url, type }
  const errors = []; const consoleErr = [];
  const live = new Map(); // requestId → 始まった時刻
  let netAt = Date.now(); let loaded = null;
  c.on("Network.requestWillBeSent", (p) => { reqs.push({ t: Date.now(), method: p.request.method, url: p.request.url, type: p.type }); live.set(p.requestId, Date.now()); netAt = Date.now(); });
  for (const ev of ["Network.loadingFinished", "Network.loadingFailed"]) c.on(ev, (p) => { live.delete(p.requestId); netAt = Date.now(); });
  c.on("Runtime.exceptionThrown", (p) => errors.push(p.exceptionDetails.exception?.description?.split("\n")[0] ?? "error"));
  c.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") consoleErr.push(p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160)); });
  c.on("Page.javascriptDialogOpening", () => c.send("Page.handleJavaScriptDialog", { accept: true }));
  c.on("Page.loadEventFired", () => loaded?.());
  await c.send("Runtime.enable"); await c.send("Page.enable"); await c.send("Network.enable");
  // 並べて開いたタブも前のタブと同じに動かす (後ろのタブの時計・描画を止めない)
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });

  /** ページの中で式を評価して値を返す (await できる) */
  const ev = async (x) => {
    const r = await c.send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`ページの式が落ちた: ${r.result.exceptionDetails.exception?.description?.split("\n")[0]}`);
    return r.result?.result?.value;
  };
  /** 式が真になるまで待つ (ms は上限)。なれば true */
  const until = async (x, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x).catch(() => false)) return true; await sleep(50); } return false; };
  /** 画面が落ち着くまで待つ: DOM の変化・終わりのある動き・取り物が quiet ms 続けて無い。max は止まったと見る上限 (着かなければ false) */
  const settle = async ({ quiet = 200, max = 10000 } = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
      const now = Date.now();
      const busy = [...live.values()].some((t) => now - t < LONG_REQ_MS);
      const dom = await ev(QUIET_PROBE).catch(() => 0);
      if (!busy && now - netAt >= quiet && dom >= quiet) return true;
      await sleep(40);
    }
    return false;
  };
  /** 操作の後の待ち: 落ち着くまで (fixed なら前の固定の ms) */
  const after = (quiet, ms) => (fixed ? sleep(ms) : settle({ quiet }));
  const size = async (w, h, mobile) => { await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile }); if (!fixed) await settle({ quiet: 150 }); };
  /** 開いて、読み込みが終わり画面が落ち着くまで (fixed なら前の 1.5 秒) */
  const go = async (url) => {
    const done = new Promise((r) => { loaded = r; });
    await c.send("Page.navigate", { url });
    if (fixed) { loaded = null; await sleep(1500); return; }
    await Promise.race([done, sleep(20000)]);
    loaded = null;
    await settle();
  };
  /** 要素の真ん中を本物のマウスで押す (selector か {x,y})。押した後は落ち着くまで。押せなければ false */
  const click = async (target) => {
    const at = typeof target === "string"
      ? await ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(target)})].find((x) => { const r = x.getBoundingClientRect(); return r.width && r.height; }); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)
      : target;
    if (!at) return false;
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await c.send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
    await after(150, 250);
    return true;
  };
  const KEYS = { Escape: ["Escape", 27], Tab: ["Tab", 9], z: ["KeyZ", 90], r: ["KeyR", 82] };
  /** 本物のキー (Escape・Tab・z・r)。ctrl で Ctrl を一緒に。押した後は落ち着くまで */
  const key = async (k, ctrl = false) => {
    const [code, vk] = KEYS[k];
    const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: ctrl ? 2 : 0 };
    await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await after(150, 350);
  };
  /** 手元の保存を消して開く (更新内容の窓は出さない)。画面が組み上がって落ち着くまで */
  const fresh = async (path, w, h, mobile) => {
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await go(`${ORIGIN}/web.html`);
    await ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
    await go(`${ORIGIN}${path}`);
    await until(`document.querySelector("#app") && document.querySelector("#app").children.length > 0`, 20000);
    await after(300, 2500);
  };
  const shot = async (path) => { const s = await c.send("Page.captureScreenshot", { format: "png" }); if (s.result?.data) writeFileSync(path, Buffer.from(s.result.data, "base64")); };
  return { send: c.send, on: c.on, ev, until, settle, size, go, click, key, fresh, shot, reqs, errors, consoleErr, close: c.close };
}

/** 窓なし Chrome を立て、n 枚のタブ (それぞれ別の部屋) を返す。close で Chrome ごと止める */
export async function openTabs(port, n, fixed = false) {
  const chrome = await openChrome(port); // 立てる・止める・使い捨ての profile は sim-watch と共通 (最初のタブは使わない)
  try {
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = await connect(ver.webSocketDebuggerUrl);
    const tabs = await Promise.all(Array.from({ length: n }, () => tab(port, browser, fixed)));
    return { tabs, close: () => { for (const t of tabs) t.close(); browser.close(); chrome.close(); } };
  } catch (e) { chrome.close(); throw e; }
}

/** 窓なし Chrome をタブ 1 枚で開く (emu.mjs。操作の後は前の固定の待ち) */
export async function open(port) {
  const { tabs: [t], close } = await openTabs(port, 1, true);
  return { ...t, close };
}

/** 決まりごとの結果を貯めて最後に出す。合わない所があれば終わりの値 1 */
export function report(name) {
  const results = new Map(); // rule → { title, seen, bad: [] , note: [] }
  const r = (rule, title) => { if (!results.has(rule)) results.set(rule, { rule, title, seen: 0, bad: [], note: [] }); return results.get(rule); };
  const done = () => {
    const all = [...results.values()];
    const total = all.reduce((a, x) => a + x.bad.length, 0);
    if (args.includes("--json")) console.log(JSON.stringify({ origin: ORIGIN, total, results: all }, null, 1));
    else {
      console.log(`== ${name} ${ORIGIN}`);
      for (const x of all) {
        console.log(`${x.bad.length ? "✗" : x.seen ? "✓" : "－"} ${x.rule} ${x.title} — 見た ${x.seen}・合わない ${x.bad.length}${x.note.length ? `・見られない ${x.note.length}` : ""}`);
        for (const b of x.bad.slice(0, 12)) console.log(`    ${b}`);
        if (x.bad.length > 12) console.log(`    …ほか ${x.bad.length - 12} 件`);
        for (const n of x.note.slice(0, 4)) console.log(`    (見られない) ${n}`);
      }
      console.log(`合わない所: ${total}`);
    }
    if (args.includes("--update")) {
      const b = existsSync(BASE_PATH) ? JSON.parse(readFileSync(BASE_PATH, "utf8")) : {};
      b[name] = Object.fromEntries(all.map((x) => [x.rule, { seen: x.seen, bad: x.bad.length }]));
      writeFileSync(BASE_PATH, `${JSON.stringify(b, null, 1)}\n`);
      console.log(`基準を書いた: ${name}`);
    }
    process.exitCode = total ? 1 : 0;
  };
  return { r, done };
}

/** 記録の送り (Y-102): 本番のホストへの POST・/log・/event・/forget */
export function prodWrites(reqs) {
  return reqs.filter((q) => { try { const u = new URL(q.url); return PROD_HOST.test(u.hostname) && (q.method !== "GET" || /^\/(log|event|forget|feedback|share)\b/.test(u.pathname)); } catch { return false; } });
}
/**
 * Worker へ行く取り物 (Y-100)。画面が Worker を呼ぶ道 (WEB_API_BASE の後ろ = /api/・/boot.json・/feedback・/forget・/log と、
 * run_worker_first の /s/・/og/・/r/、シェアの /tree/・/live.json) だけを数える。置いてあるだけの物 (/assets/・.json・絵) と、見張りが自分で開いたページ (Document) は数えない
 */
const WORKER_PATH = /^\/(api\/|boot\.json|feedback|forget|log|event|live\.json|s\/|og\/|r\/|tree\/|share)/;
export function workerHits(reqs) {
  return reqs.filter((q) => {
    if (q.type === "Document") return false;
    let u; try { u = new URL(q.url); } catch { return false; }
    if (!/^https?:$/.test(u.protocol)) return false;
    return WORKER_PATH.test(u.pathname) && (u.origin === new URL(ORIGIN).origin || PROD_HOST.test(u.hostname) || /\.workers\.dev$/.test(u.hostname));
  });
}

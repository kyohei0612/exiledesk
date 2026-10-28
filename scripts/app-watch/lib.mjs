/**
 * lib.mjs — シミュ以外の見張り (pages.mjs・emu.mjs) の共通: 窓なし Chrome (sim-watch の cdp.mjs をそのまま使う)・本物の押下とキー・ネットワークの数え・結果の出し方。
 * 回し方は docs/org/dev/app-watch.md。
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
/** 既定は手元の本番の作り 1460。1440 (dev サーバー) なら http://localhost:1440 を渡す */
export const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://127.0.0.1:1460").replace(/\/$/, "");
/** 本番のホスト (ここへの記録の送り = Y-102 の違反) */
export const PROD_HOST = /(^|\.)exiledesk\.com$|^exiledesk-live\.exiledesk\.workers\.dev$/;

/** 窓なし Chrome を開き、押下・キー・ネットワークの道具を足して返す */
export async function open(port) {
  const c = await openChrome(port);
  const reqs = []; // { t, method, url }
  const consoleErr = [];
  c.on("Network.requestWillBeSent", (p) => reqs.push({ t: Date.now(), method: p.request.method, url: p.request.url, type: p.type }));
  c.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") consoleErr.push(p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160)); });
  await c.send("Network.enable");
  /** 要素の真ん中を本物のマウスで押す (selector か {x,y})。押せなければ false */
  const click = async (target) => {
    const at = typeof target === "string"
      ? await c.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(target)})].find((x) => { const r = x.getBoundingClientRect(); return r.width && r.height; }); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`)
      : target;
    if (!at) return false;
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await c.send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
    await sleep(250);
    return true;
  };
  const KEYS = { Escape: ["Escape", 27], Tab: ["Tab", 9], z: ["KeyZ", 90], r: ["KeyR", 82] };
  /** 本物のキー (Escape・Tab・z・r)。ctrl で Ctrl を一緒に */
  const key = async (k, ctrl = false) => {
    const [code, vk] = KEYS[k];
    const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: ctrl ? 2 : 0 };
    await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(350);
  };
  /** 手元の保存を消して開く (更新内容の窓は出さない) */
  const fresh = async (path, w, h, mobile) => {
    await c.size(w, h, mobile);
    await c.go(`${ORIGIN}/web.html`);
    await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
    await c.go(`${ORIGIN}${path}`);
    await c.until(`document.querySelector("#app") && document.querySelector("#app").children.length > 0`, 20000);
    await sleep(2500);
  };
  return { ...c, reqs, consoleErr, click, key, fresh };
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

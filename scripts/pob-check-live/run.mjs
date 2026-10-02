/**
 * 火力チェックのエンジン点検をアプリ本体 (開発ビルド) で流す (2026-10-02)。
 *
 *   node scripts/pob-check-live/run.mjs builds.json trade.json [out.json]
 *
 *   builds.json = { "名前": { "code": "<PoB コード>" }, … } (poe.ninja から取った物や自分のキャラ。アカウント名が入るので repo には置かない)
 *   trade.json  = { "weapon": { "jp": { "item": <取引所の item> }, "en": {...} }, "armour.gloves": {...} } (取引所の応答。日本語 / 英語の文面を作る元)
 *   ONLY=名前,名前 で絞れる
 *
 * 前提: 開発ビルドを CDP つきで起動しておく (memory: app-verification-cdp):
 *   WEBVIEW2_USER_DATA_FOLDER=C:/Users/kyohei/AppData/Local/ExileDesk-dev/webview WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 src-tauri/target/debug/exiledesk.exe
 * 流す中身は check.js (ビルドごとに 読み込み → 本家の左の数字 (MAIN) と行の pobDps が同じか → 取引所の武器・手袋を日本語 / 英語で貼って戻す → ジェムの丸め)。
 * ページは毎回読み直す (Vite の古いモジュールを捨てる) ので、pck.lua を直した直後でも最新で流れる。
 */
import fs from "fs";
import path from "path";
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const [buildsPath, tradePath, outPath] = process.argv.slice(2);
if (!buildsPath || !tradePath) { console.error("使い方: node run.mjs builds.json trade.json [out.json]"); process.exit(2); }
const builds = JSON.parse(fs.readFileSync(buildsPath, "utf8"));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const sel = only ? Object.fromEntries(Object.entries(builds).filter(([k]) => only.includes(k))) : builds;
const trade = JSON.parse(fs.readFileSync(tradePath, "utf8"));
let code = fs.readFileSync(path.join(dir, "check.js"), "utf8");
code = code.replace("BUILDS", JSON.stringify(sel)).replace("TRADE", JSON.stringify(trade));
const list = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = list.find((p) => p.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
// 共有 AppData を書き換えない guard (memory: app-verification-cdp) を新しい document にも入れてから、ページを読み直す (Vite の古いモジュールを捨てる)
const GUARD = `(() => { const t = window.__TAURI_INTERNALS__; if (!t || t.__guarded) return "already"; const orig = t.invoke.bind(t);
  const BLOCK = new Set(["market_flow_set_watches","market_flow_record","market_flow_sample","market_flow_sample_now","market_flow_import_seed","craft_v2_fetch_all","craft_v2_cache_save"]);
  t.invoke = (cmd, ...a) => BLOCK.has(cmd) ? Promise.resolve(null) : orig(cmd, ...a); t.__guarded = true; return "guarded"; })()`;
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.addEventListener("DOMContentLoaded", () => { ${GUARD} });` });
await send("Page.reload");
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 300));
  const st = await send("Runtime.evaluate", { expression: `document.readyState === "complete" && !!window.__TAURI_INTERNALS__ && !!document.querySelector("#app *")`, returnByValue: true });
  if (st.result?.result?.value === true) break;
}
console.log("guard:", (await send("Runtime.evaluate", { expression: GUARD, returnByValue: true })).result?.result?.value);
await new Promise((r) => setTimeout(r, 1500));
const r = await send("Runtime.evaluate", { expression: `(async()=>{${code}})()`, awaitPromise: true, returnByValue: true, timeout: 1800000 });
const v = r.result.result?.value ?? r.result;
const txt = JSON.stringify(v, null, 1);
const out = outPath;
if (out) { fs.writeFileSync(out, txt); console.log("saved", out, txt.length); } else console.log(txt);
ws.close();

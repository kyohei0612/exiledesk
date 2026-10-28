/**
 * cdp.mjs — 見張り (watch.mjs) の窓なし Chrome。1 つだけ立てて 1 タブで動かし、終わったら Chrome ごと止めて使い捨ての profile も消す。
 * 外のパッケージは使わない (Node 22+ の fetch・WebSocket と Chrome の DevTools の口だけ)。
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openChrome(port = 9371) {
  const prof = mkdtempSync(join(tmpdir(), "sim-watch-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore", windowsHide: true });
  const close = () => {
    try { execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { try { chrome.kill("SIGKILL"); } catch { /* もう無い */ } }
    try { rmSync(prof, { recursive: true, force: true }); } catch { /* 後で消える */ }
  };
  let list;
  for (let i = 0; i < 80 && !list; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { await sleep(250); } }
  if (!list) { close(); throw new Error("Chrome が立たない"); }
  const ws = new WebSocket(list.find((p) => p.type === "page").webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); const errors = []; const subs = new Map();
  const send = (method, params = {}) => Promise.race([
    new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
    sleep(30000).then(() => ({})),
  ]);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); }
    if (m.method === "Page.javascriptDialogOpening") send("Page.handleJavaScriptDialog", { accept: true });
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0] ?? "error");
    for (const fn of subs.get(m.method) ?? []) fn(m.params);
  };
  /** 出来事の受け口 (Network.requestWillBeSent・Runtime.consoleAPICalled など。app-watch が使う) */
  const on = (method, fn) => subs.set(method, [...(subs.get(method) ?? []), fn]);
  await send("Runtime.enable"); await send("Page.enable");
  /** ページの中で式を評価して値を返す (await できる) */
  const ev = async (x) => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`ページの式が落ちた: ${r.result.exceptionDetails.exception?.description?.split("\n")[0]}`);
    return r.result?.result?.value;
  };
  /** 式が真になるまで待つ (ms まで)。なれば true */
  const until = async (x, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x).catch(() => false)) return true; await sleep(300); } return false; };
  const size = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  const go = async (url) => { await send("Page.navigate", { url }); await sleep(1500); };
  const shot = async (path) => { const s = await send("Page.captureScreenshot", { format: "png" }); if (s.result?.data) writeFileSync(path, Buffer.from(s.result.data, "base64")); };
  return { send, on, ev, until, size, go, shot, errors, close: () => { try { ws.close(); } catch { /* 閉じている */ } close(); } };
}

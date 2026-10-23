#!/usr/bin/env node
/**
 * compare-snaps.mjs — 本番 (exiledesk.com) と手元の本番環境を同じページ・同じ操作で撮って見比べる (2026-10-24、main を本番に出す前の照らし)
 *   1. 手元を立てる:   pnpm preview:prod -- --live [--port 1462]   (--live = 相場・訪問者を本番の live から読む。本番と同じに見せるため)
 *   2. 照らす:         node scripts/compare-snaps.mjs [--local http://127.0.0.1:1462] [--cdp 9333] [--only pc|phone] [--steps 01,02]
 * 出す物: data-cache/snap-compare/<日時>/ に 本番・手元・差 (赤) の PNG と report.md (違いの一覧)。違いが 0 なら「違い 0」。
 * 決まり:
 *   - 本番は撮るだけ。ページの読み込みは 1 回の照らしで PC・スマホ合わせて 40 前後 (絵・JS は静的で Worker を通らない)。
 *   - 分析の送り (/log・/event・Cloudflare の beacon)・広告は Chrome の中で止める (本番の記録に入れない)。Service Worker は通さない
 *     (新しい profile の窓なしの Chrome では CacheStorage が開けず ERR_FAILED になる、10-24)。
 *   - 毎回変わる物 (版の番号・本日の訪問者の数) は両方とも同じ字に置き換えてから撮る。乱数の手は打たない (持つだけ)。
 *   - Chrome はこの台本が立てて、終わったら止めて profile を消す (確認用 Chrome は使用表に書いてから)。
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SIDES = { 本番: "https://exiledesk.com", 手元: arg("--local", "http://127.0.0.1:1462").replace(/\/$/, "") };
const CDP = Number(arg("--cdp", "9333"));
const ONLY = arg("--only", null);
const STEPS_ONLY = arg("--steps", null)?.split(",");
const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, "");
const OUT = resolve(ROOT, arg("--out", `data-cache/snap-compare/${stamp}`));
const VIEWS = {
  pc: { width: 1660, height: 860, mobile: false, ua: null },
  phone: { width: 375, height: 812, mobile: true, ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" },
};
const BLOCK = [/exiledesk-live\.[^/]+\/(log|event)\b/, /cloudflareinsights\.com/, /googlesyndication\.com|doubleclick\.net|adtrafficquality\.google/];

// 撮る並び。go = その道を開く (本番を 1 回読む)、それ以外は前の画面のまま操作する。full = 下まで撮る (読み物)
const STEPS = [
  { id: "01-base", go: "/", note: "初めて開いた時 (ベースを選ぶ)" },
  // 押す所は録画用の目印 data-rec (普段も付いている、src/utils/rec-mode.ts)。白のベースを選ぶので乱数は入らない
  // PC は部位のタイル (指輪) を押してからベースのカードが出る。スマホは先に出ているので無ければ飛ばす (撮らない)
  { id: "02a-rings", sel: '[data-rec="family:Rings"]', optional: true, noshot: true },
  { id: "02-craft", sel: '[data-rec="base:Gold Ring"]', note: "ベース (金の指輪) を選ぶ → クラフト台" },
  { id: "03-hold", sel: '[data-rec="shelf:transmute"]', note: "カレンシー (変成) を持つ" },
  { id: "04-modlist", sel: '[data-rec="mod-list-open"]', note: "段の表 (MOD 一覧) を開く" },
  { id: "05-esc", key: "Escape", note: "Esc で閉じる" },
  { id: "06-routes", go: "/?page=routes", note: "スパムシミュレーター" },
  { id: "07-guide-app", go: "/?page=guide", note: "使い方・コツ (画面)" },
  { id: "08-feedback", go: "/?page=feedback", note: "要望・バグを送る" },
  { id: "09-guide", go: "/guide", full: true },
  { id: "10-craft-basics", go: "/craft-basics", full: true },
  { id: "11-about", go: "/about", full: true },
  { id: "12-faq", go: "/faq", full: true },
  { id: "13-blog", go: "/blog/", full: true },
  { id: "14-blog-article", go: "/blog/are-omens-worth-it/", full: true },
  { id: "15-privacy", go: "/privacy", full: true },
  { id: "16-contact", go: "/contact", full: true },
  { id: "17-bases", go: "/bases/", full: true },
  { id: "18-en-about", go: "/en/about", full: true },
  { id: "19-en-blog", go: "/en/blog/", full: true },
  { id: "20-en-app", go: "/?lang=en", note: "英語の画面 (最後: 言語を覚えるので)" },
].filter((s) => !STEPS_ONLY || STEPS_ONLY.some((p) => s.id.startsWith(p)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect(url, onEvent) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else onEvent?.(m, send); };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { send, close: () => ws.close() };
}

// Chrome を立てる
const prof = mkdtempSync(join(tmpdir(), "exiledesk-snaps-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${prof}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore", windowsHide: true });
const stop = () => { try { execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { /* もう止まっている */ } try { rmSync(prof, { recursive: true, force: true }); } catch { /* 掴まれていれば残る */ } };
process.on("exit", stop);
let ver;
for (let i = 0; i < 60 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await sleep(250); } }
if (!ver) { console.error(`Chrome が立たない (ポート ${CDP} が使われている?)`); process.exit(1); }

let blocked = 0;
const cdp = await connect(ver.webSocketDebuggerUrl, async (m, send) => {
  if (m.method === "Fetch.requestPaused") {
    const u = m.params.request.url;
    if (BLOCK.some((re) => re.test(u))) { blocked++; await send("Fetch.failRequest", { requestId: m.params.requestId, errorReason: "BlockedByClient" }, m.sessionId); }
    else await send("Fetch.continueRequest", { requestId: m.params.requestId }, m.sessionId);
  }
});
const { send } = cdp;

/** 新しい窓 (別の保存場所) を開いて、決まった大きさ・止める物を付ける */
async function openTab(view) {
  const ctx = (await send("Target.createBrowserContext", { disposeOnDetach: true })).result.browserContextId;
  const target = (await send("Target.createTarget", { url: "about:blank", browserContextId: ctx })).result.targetId;
  const s = (await send("Target.attachToTarget", { targetId: target, flatten: true })).result.sessionId;
  const t = (m, p) => send(m, p, s);
  await t("Page.enable"); await t("Runtime.enable"); await t("Network.enable");
  await t("Network.setBypassServiceWorker", { bypass: true });
  await t("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await t("Emulation.setTimezoneOverride", { timezoneId: "Asia/Tokyo" });
  await t("Emulation.setDeviceMetricsOverride", { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: view.mobile });
  if (view.mobile) { await t("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); await t("Network.setUserAgentOverride", { userAgent: view.ua }); }
  return { t, close: () => send("Target.disposeBrowserContext", { browserContextId: ctx }) };
}
const ev = async (t, expr) => (await t("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
/** 毎回変わる字を同じにする (版・訪問者の数)、動きを止める */
const STEADY = `(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){const v=n.nodeValue;const r=v.replace(/v0\\.1\\.\\d+/g,'v0.1.x').replace(/(本日の訪問者|本日|Visitors today|today)\\s*\\d[\\d,]*\\s*(人)?/g,'$1 N $2');if(r!==v)n.nodeValue=r}const st=document.createElement('style');st.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';document.head.appendChild(st);return true})()`;
/** 見えている字 (比べる用。同じ置き換えの後) */
const TEXT = `document.body.innerText.split('\\n').map(s=>s.replace(/\\s+/g,' ').trim()).filter(Boolean)`;
/** 字で押す: その字が丸ごと入っている一番小さな押せる物 */
const CLICK = (txt) => `(()=>{const want=${JSON.stringify(txt)};const els=[...document.querySelectorAll('button,a,[role=button],[role=tab],[tabindex],li,div,span')].filter(e=>e.offsetParent!==null&&(e.innerText||'').replace(/\\s+/g,' ').trim().includes(want));if(!els.length)return null;els.sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);const e=els[0].closest('button,a,[role=button],[role=tab],[tabindex]')||els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,label:(e.innerText||'').trim().slice(0,30)}})()`;

/** 目印で押す: 見えている最初の物 */
const SEL = (sel) => `(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(x=>x.offsetParent!==null);if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`;

async function shoot(t, full) {
  let clip;
  if (full) {
    const h = Math.min(6000, Math.ceil(await ev(t, "document.documentElement.scrollHeight")));
    const w = Math.ceil(await ev(t, "document.documentElement.clientWidth"));
    clip = { x: 0, y: 0, width: w, height: h, scale: 1 };
  }
  const r = await t("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  return r.result.data;
}

async function runSide(side, view) {
  const base = SIDES[side];
  const tab = await openTab(view);
  const shots = {};
  for (const st of STEPS) {
    let ok = true;
    if (st.go) {
      await tab.t("Page.navigate", { url: base + st.go }); await sleep(st.full ? 3500 : 6000);
      // 下まで撮るページは、遅れて読む絵 (loading=lazy) を読ませるため 1 回下まで送ってから上へ戻す (10-24 ブログの一覧の下の札の絵が毎回違う所で欠けた)
      if (st.full) { await ev(tab.t, `(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=600){scrollTo(0,y);await new Promise(r=>setTimeout(r,120))}scrollTo(0,0);await Promise.all([...document.images].filter(i=>!i.complete).map(i=>new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,4000)})));return true})()`); await sleep(500); }
    }
    else if (st.click || st.sel) {
      const at = await ev(tab.t, st.sel ? SEL(st.sel) : CLICK(st.click));
      if (!at) ok = !!st.optional;
      else {
        for (const type of ["mousePressed", "mouseReleased"]) await tab.t("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 });
        await sleep(2500);
      }
    } else if (st.key) {
      await tab.t("Input.dispatchKeyEvent", { type: "keyDown", key: st.key, code: st.key, windowsVirtualKeyCode: 27 });
      await tab.t("Input.dispatchKeyEvent", { type: "keyUp", key: st.key, code: st.key, windowsVirtualKeyCode: 27 });
      await sleep(1500);
    }
    if (st.noshot) continue;
    await ev(tab.t, STEADY);
    await sleep(300);
    shots[st.id] = { ok, png: await shoot(tab.t, st.full), text: (await ev(tab.t, TEXT)) ?? [], url: await ev(tab.t, "location.pathname+location.search"), title: await ev(tab.t, "document.title") };
  }
  await tab.close();
  return shots;
}

// 差を数える: 2 枚を canvas に描いて、色の差が大きい点を数え、差の絵 (赤) を作る
const cmpTab = await openTab({ width: 800, height: 600, mobile: false });
async function pixelDiff(a, b) {
  const expr = `(async()=>{const ld=(s)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s});const [A,B]=await Promise.all([ld(${JSON.stringify(a)}),ld(${JSON.stringify(b)})]);
const w=Math.max(A.width,B.width),h=Math.max(A.height,B.height);const c=(img)=>{const cv=new OffscreenCanvas(w,h);const x=cv.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,w,h);x.drawImage(img,0,0);return x.getImageData(0,0,w,h).data};
const da=c(A),db=c(B);const out=new OffscreenCanvas(w,h);const ox=out.getContext('2d');ox.drawImage(A,0,0);ox.fillStyle='rgba(0,0,0,0.55)';ox.fillRect(0,0,w,h);const od=ox.getImageData(0,0,w,h);let n=0,x0=w,y0=h,x1=0,y1=0;
for(let i=0;i<da.length;i+=4){if(Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2])>60){n++;const p=i/4,x=p%w,y=(p/w)|0;if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;od.data[i]=255;od.data[i+1]=40;od.data[i+2]=40;od.data[i+3]=255}}
ox.putImageData(od,0,0);const blob=await out.convertToBlob({type:'image/png'});const buf=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=0x8000)s+=String.fromCharCode(...buf.subarray(i,i+0x8000));
return {n,total:w*h,size:[A.width,A.height,B.width,B.height],box:n?[x0,y0,x1,y1]:null,png:btoa(s)}})()`;
  return ev(cmpTab.t, expr);
}

const lineDiff = (a, b) => { const sa = new Set(a), sb = new Set(b); return { onlyA: a.filter((l) => !sb.has(l)), onlyB: b.filter((l) => !sa.has(l)) }; };

mkdirSync(OUT, { recursive: true });
const rows = [];
let loads = 0;
for (const [vName, view] of Object.entries(VIEWS)) {
  if (ONLY && ONLY !== vName) continue;
  const res = {};
  for (const side of Object.keys(SIDES)) { res[side] = await runSide(side, view); if (side === "本番") loads += STEPS.filter((s) => s.go).length; }
  for (const st of STEPS.filter((s) => !s.noshot)) {
    const p = res.本番[st.id], l = res.手元[st.id];
    const d = await pixelDiff(p.png, l.png);
    const td = lineDiff(p.text, l.text);
    const dir = join(OUT, vName); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${st.id}-本番.png`), Buffer.from(p.png, "base64"));
    writeFileSync(join(dir, `${st.id}-手元.png`), Buffer.from(l.png, "base64"));
    if (d.n) writeFileSync(join(dir, `${st.id}-差.png`), Buffer.from(d.png, "base64"));
    const same = !d.n && !td.onlyA.length && !td.onlyB.length && p.ok === l.ok && p.title === l.title && p.url === l.url;
    rows.push({ v: vName, st, same, d, td, p, l });
    console.log(`${same ? "  同じ" : "★違う"} ${vName.padEnd(5)} ${st.id}  差 ${d.n} 点${d.box ? ` (枠 ${d.box.join(",")})` : ""}${d.size[0] !== d.size[2] || d.size[1] !== d.size[3] ? ` 大きさ ${d.size.slice(0, 2).join("x")} / ${d.size.slice(2).join("x")}` : ""}${td.onlyA.length + td.onlyB.length ? ` 字 本番だけ ${td.onlyA.length}・手元だけ ${td.onlyB.length}` : ""}${p.ok && l.ok ? "" : ` 操作できなかった (本番 ${p.ok ? "○" : "×"}・手元 ${l.ok ? "○" : "×"})`}`);
  }
}

// 一覧
const diffRows = rows.filter((r) => !r.same);
const esc = (s) => String(s).replace(/\|/g, "\\|").slice(0, 120);
let md = `# 本番と手元のスナップの照らし (${stamp})\n\n本番 ${SIDES.本番} / 手元 ${SIDES.手元}。PC 1660×860・スマホ 375×812。本番のページの読み込み ${loads} 回、止めた送り ${blocked} 件。\n\n**違い ${diffRows.length} / ${rows.length}**\n\n`;
md += `| 画面 | 端末 | 差の点 | 違い |\n|---|---|---|---|\n`;
for (const r of rows) {
  const why = [];
  if (r.p.title !== r.l.title) why.push(`題: 「${esc(r.p.title)}」→「${esc(r.l.title)}」`);
  if (r.p.url !== r.l.url) why.push(`道: ${esc(r.p.url)} → ${esc(r.l.url)}`);
  if (r.p.ok !== r.l.ok) why.push(`操作: 本番 ${r.p.ok ? "できた" : "できない"}・手元 ${r.l.ok ? "できた" : "できない"}`);
  if (r.d.size[0] !== r.d.size[2] || r.d.size[1] !== r.d.size[3]) why.push(`高さ ${r.d.size[1]} → ${r.d.size[3]}`);
  for (const x of r.td.onlyA.slice(0, 4)) why.push(`本番だけの字: ${esc(x)}`);
  for (const x of r.td.onlyB.slice(0, 4)) why.push(`手元だけの字: ${esc(x)}`);
  md += `| ${r.st.id}${r.st.note ? ` ${r.st.note}` : ""} | ${r.v} | ${r.d.n}${r.d.box ? ` (${r.d.box.join(",")})` : ""} | ${r.same ? "同じ" : why.join("<br>") || "絵だけ (差.png)"} |\n`;
}
writeFileSync(join(OUT, "report.md"), md);
console.log(`\n違い ${diffRows.length} / ${rows.length}。本番の読み込み ${loads} 回。一覧 ${join(OUT, "report.md")}`);
await cmpTab.close();
cdp.close();
process.exit(0);

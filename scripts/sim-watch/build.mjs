/**
 * build.mjs — 見本の木を 1 本ずつ台本で組み直す (10-29 オーナー「イ」)。
 *   node scripts/sim-watch/build.mjs [origin] [--only key,key] [--out <json>] [--off flag,flag]   … 既定 http://localhost:1442 (開発版、スイッチを開いた形。--off はそのスイッチを閉じて組む = 前後の比べ)
 * 木ごとに: 古い木 (trees-old.json の code、無ければ trees.json) を開いて完成形と始まりだけ残し → kit.js → build/<key>.js (その木の打ち方) → kit.finish (残った箱を決める) → 精査・100 人。
 * 出す物: 組み直した木の code・合格か・完成・止まり・精査の知らせ・打った記録。--out で JSON
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const { openChrome, sleep } = await import("./cdp.mjs");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1442").replace(/\/$/, "");
const here = (p) => new URL(p, import.meta.url);
const KIT = readFileSync(here("./kit.js"), "utf8");
const src = existsSync(here("./trees-old.json")) ? "./trees-old.json" : "./trees.json";
const list = JSON.parse(readFileSync(here(src), "utf8"));
const only = opt("--only")?.split(",");
const OFF = opt("--off") ? `&off=${opt("--off")}` : "";
const trees = [...list.trees, ...(list.owner ?? [])].filter((t) => existsSync(here(`./build/${t.key}.js`)) && (!only || only.includes(t.key)));
// 長い処理 (精査・100 人) は 30 秒を超えるので、ページに結果を置かせて待つ (cdp の send は 30 秒で諦める)
const long = async (js, ms = 600000) => { await c.ev(`(window.__done = undefined, (async () => { try { window.__done = { v: await (${js}) }; } catch (e) { window.__done = { err: String(e && e.stack || e) }; } })(), 1)`); if (!(await c.until("window.__done !== undefined", ms))) throw new Error("時間切れ"); const r = await c.ev("JSON.stringify(window.__done)"); const o = JSON.parse(r); if (o.err) throw new Error(o.err); return o.v; };
const expr = (s) => s.replace(/^\/\/.*$/gm, "").trim().replace(/;$/, "");
const c = await openChrome(Number(process.env.WATCH_PORT ?? 9372));
const out = [];
try {
  for (const t of trees) {
    await c.size(1660, 860, false);
    await c.go(`${ORIGIN}/web.html`);
    await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
    await c.go(`${ORIGIN}/web.html?page=sim-tree${OFF}#recipe=${t.code}`);
    if (!(await c.until(`document.querySelectorAll("[data-tree-box]").length > 0 && !!window.__simMonkey`, 40000))) { console.log(`${t.key}: 開かない`); continue; }
    await sleep(2500);
    // 完成形と始まりだけ残す (箱は start だけ)
    await c.ev(`(async () => { const { useTree } = await import("/src/views/simulator/tree/use-tree.ts"); const t = useTree(); const d = JSON.parse(JSON.stringify(t.doc.value)); d.boxes = { start: { ...d.boxes.start, hand: null, outs: [], back: null, done: null } }; delete d.boxes.start.autoBack; t.open(d); return 1; })()`);
    await sleep(500);
    await c.ev(KIT);
    const body = expr(readFileSync(here(`./build/${t.key}.js`), "utf8"));
    let err = null;
    try { await long(`(async () => { const K = window.__kit; await (${body})(K); return 1; })()`); } catch (e) { err = String(e).slice(0, 400); }
    await long(`(async () => { await window.__kit.finish(); return 1; })()`);
    await sleep(500);
    const r = await long(`(async () => ({ ...(await window.__kit.report()), log: window.__kit.log, tree: window.__kit.tree() }))()`);
    out.push({ key: t.key, err, ...r });
    console.log(`=== ${t.key}: 箱 ${r.boxes} / 合格 ${r.passed} / 完成 ${r.finished}/${r.n} / 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)} / 失敗 ${r.failed} / 打ち止め ${r.capped} / 未設定 ${r.unset.length}${err ? " / 台本の落ち " + err : ""}`);
    for (const l of r.log) console.log(`  · ${l}`);
    for (const n of r.issues) console.log(`  - ${n}`);
    if (args.includes("--tree")) for (const l of r.tree) console.log(`    ${l}`);
  }
} finally { c.close(); }
if (opt("--out")) writeFileSync(opt("--out"), JSON.stringify(out, null, 1));

/**
 * rebuild.mjs — 見本の木 (trees.json) とオーナーの木を、今の仕組みで打ち直して回す (10-29 オーナー「見本も新ツリーにした状態で回そうか」)。
 *   node scripts/sim-watch/rebuild.mjs [origin] [--only key] [--out <json>]   … 既定 http://localhost:1442 (開発版、スイッチを開いた形)
 * 木ごとに rebuild-tree.js をページの中で評価し、打ち直しの記録・精査・100 人の結果・新しいレシピ (code) を出す。--out で JSON に書く
 */
import { readFileSync, writeFileSync } from "node:fs";
const { openChrome, sleep } = await import("./cdp.mjs");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1440").replace(/\/$/, "");
const SRC = readFileSync(new URL("./rebuild-tree.js", import.meta.url), "utf8");
const list = JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8"));
const trees = [...list.trees, ...(list.owner ?? [])].filter((t) => !opt("--only") || t.key === opt("--only"));
const c = await openChrome(Number(process.env.WATCH_PORT ?? 9372));
const out = [];
try {
  for (const t of trees) {
    await c.size(1660, 860, false);
    await c.go(`${ORIGIN}/web.html`);
    await c.ev(`(() => { try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("exiledesk.changelog.seen", "9.9.9"); } catch {} return 1; })()`);
    await c.go(`${ORIGIN}/web.html?page=sim-tree#recipe=${t.code}`);
    if (!(await c.until(`document.querySelectorAll("[data-tree-box]").length > 0 && !!window.__simMonkey`, 40000))) { console.log(`${t.key}: 開かない`); continue; }
    await sleep(2500);
    await c.ev(`(window.__rebuildOpt = ${JSON.stringify(t.rebuild ?? {})}, 1)`);
    const r = JSON.parse(await c.ev(`(async () => JSON.stringify(await ${SRC.replace(/^\/\/.*$/gm, "").trim().replace(/;$/, "")}))()`));
    out.push({ key: t.key, ...r });
    console.log(`${t.key}: 箱 ${r.oldBoxes} → ${r.boxes} / 合格 ${r.passed} / 完成 ${r.finished} / 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)} / 未設定 ${r.unset.length}`);
    for (const l of r.log) console.log(`  · ${l}`);
    for (const n of r.notices) console.log(`  - ${n}`);
  }
} finally { c.close(); }
if (opt("--out")) writeFileSync(opt("--out"), JSON.stringify(out, null, 1));

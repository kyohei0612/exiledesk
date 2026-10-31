/**
 * light.mjs — スイッチ treeLight (S-71b) のオン / オフで結果が同じかの見張り (10-31)。見本の木を両方で開き、精査の結果・n 人の結果・開いた後の木の中身の JSON を比べ、時間も出す。
 * treeLight が RELEASED に入ると ?off= が効かなくなるので、この見張りは本番に出すまでの物
 *   node scripts/sim-watch/light.mjs [origin] [--only key,key] [--n 30] [--port 9482]
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { openChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1440").replace(/\/$/, "");
const N = Number(opt("--n") ?? 30), only = opt("--only")?.split(",");
const t = JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8"));
const list = [...t.trees, ...t.rules, ...t.pass, ...t.owner].filter((x) => !only || only.includes(x.key));
const c = await openChrome(Number(opt("--port") ?? 9482));
const probe = `(async () => { const M = __simMonkey, t0 = performance.now(); const k = await M.check(); const t1 = performance.now(); const r = M.run(${N}, 1); const t2 = performance.now(); return JSON.stringify({ check: k, run: r, ms: [Math.round(t1 - t0), Math.round(t2 - t1)], doc: M.dump() }); })()`;
const sig = (x) => createHash("sha1").update(x).digest("hex").slice(0, 10);
let diff = 0, lost = 0;
try {
  for (const x of list) {
    const got = [];
    for (const q of ["off=treeLight", "x=1"]) {
      // 片方の読み込みが遅くて時間切れになった時は 1 回だけ開き直す
      for (let i = 0; i < 2 && !got[q === "x=1" ? 1 : 0]; i++) {
        await c.go("about:blank"); await c.size(1440, 900, false);
        await c.send("Page.navigate", { url: `${ORIGIN}/web.html?page=sim-tree&lang=ja&${q}#recipe=${x.code}` }); await sleep(800);
        if (!(await c.until(`Object.keys(window.__simMonkey?.dump?.()?.boxes ?? {}).length > 1`, 120000))) continue;
        await sleep(500);
        const raw = await Promise.race([c.ev(probe), sleep(180000).then(() => null)]).catch(() => null);
        if (raw) { const { ms, ...rest } = JSON.parse(raw); got[q === "x=1" ? 1 : 0] = { ms, sig: sig(JSON.stringify(rest)) }; }
      }
    }
    const [a, b] = got;
    if (!a || !b) { lost++; console.log(x.key.padEnd(14), "測れない"); continue; }
    if (a.sig !== b.sig) diff++;
    console.log(x.key.padEnd(14), a.sig === b.sig ? "同じ" : "違う", `精査 ${a.ms[0]} → ${b.ms[0]}  回す ${a.ms[1]} → ${b.ms[1]}`);
  }
} finally { c.close(); }
console.log(`違う木 ${diff}・測れない木 ${lost} / ${list.length}`);
process.exit(diff || lost ? 1 : 0);

/**
 * light-edit.mjs — S-71b ② (見本を道の鍵で覚え続ける、スイッチ treeLight) の見張り (11-01)。light.mjs は開いた時だけなので、こちらは手を足し続けた時を見る。
 * 見本の木を ?off=treeLight と開いた形で開き、同じ順で手を足す・戻りを外す・完成の狙いを替えるたびに、木の中身と全部の箱の見本 (__simMonkey.samples) を比べる。最後に 100 人も比べる。
 * オンの側は前の手からの覚えを持ったまま読むので、覚えの鍵の抜けがあれば違いが出る。手の選び方は決まった順 (乱数なし)
 *   node scripts/sim-watch/light-edit.mjs [origin] [--only key,key] [--steps 8] [--n 100] [--port 9483]
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { openChrome, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ORIGIN = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:1440").replace(/\/$/, "");
const STEPS = Number(opt("--steps") ?? 8), N = Number(opt("--n") ?? 100), only = opt("--only")?.split(",");
const t = JSON.parse(readFileSync(new URL("./trees.json", import.meta.url), "utf8"));
const list = [...t.trees, ...t.rules, ...t.pass, ...t.owner].filter((x) => !only || only.includes(x.key));
const extra = args.filter((a) => a.endsWith(".txt")).map((f) => ({ key: f.split(/[\\/]/).pop().replace(".txt", ""), code: readFileSync(f, "utf8").match(/#recipe=([A-Za-z0-9_-]+)/)[1] }));
const sig = (x) => createHash("sha1").update(x).digest("hex").slice(0, 10);
const c = await openChrome(Number(opt("--port") ?? 9483));

/** 1 歩: 手の足せる箱へ順に手を足す。無ければ自動の ↩ を外して足す。step を見て種類を変える (☑ あり・狙い無し・狙いの札を変える) */
const stepJs = (i) => `(() => {
  const M = __simMonkey, i = ${i}, d = M.dump(), boxes = Object.values(d.boxes);
  const open = M.addable().filter((x) => !x.needAim);
  let id = open.length ? open[i % open.length].id : null;
  let log = "";
  if (!id) { const bs = boxes.filter((b) => b.back && b.autoBack); const b = bs[i % (bs.length || 1)]; if (!b) return "手の足せる箱が無い"; M.setBack(b.id, null); id = b.id; log = "↩外す " + id + " "; }
  const s = M.shelf(id).filter((x) => x.ok);
  if (!s.length) { M.setDone(id, i % 2 ? "fail" : true); return log + "印 " + id; }
  const pick = s.find((x) => (i % 3 === 0 ? /^カオスオーブ$/ : i % 3 === 1 ? /高貴/ : /消去|ヒステリー|変成|増強/).test(x.name)) ?? s[i % s.length];
  const ch = M.hitChoices(id, pick.key, []);
  const o = i % 2 && ch.length ? { hitAims: [ch[i % ch.length].modId] } : { hitAims: [] };
  const r = M.add(id, pick.key, [], o);
  if (!r.ok) { M.setDone(id, "fail"); return log + "印 " + id + " (" + r.problem + ")"; }
  return log + id + " " + pick.key + " " + JSON.stringify(o.hitAims) + " → " + r.boxes.length;
})()`;
const state = `JSON.stringify({ doc: __simMonkey.dump(), samples: __simMonkey.samples(4) })`;
/** 重い式は裏で回して受け取る (cdp の send は 30 秒で切れる。前の形の木は 1 回の読みが 30 秒を超える) */
async function long(x) {
  await c.ev(`window.__r=undefined;setTimeout(()=>{window.__r=[${x}]},0);0`);
  for (let i = 0; i < 1200; i++) { const v = await c.ev(`window.__r&&window.__r[0]`).catch(() => undefined); if (v !== undefined && v !== null) return v; await sleep(500); }
  throw new Error("時間切れ");
}

async function walk(x, q) {
  await c.go("about:blank"); await c.size(1440, 900, false);
  await c.send("Page.navigate", { url: `${ORIGIN}/web.html?page=sim-tree&lang=ja&${q}#recipe=${x.code}` }); await sleep(800);
  if (!(await c.until(`Object.keys(window.__simMonkey?.dump?.()?.boxes ?? {}).length > 1`, 120000))) return null;
  await sleep(500);
  const out = [{ log: "開いた", sig: sig(await long(state)) }];
  for (let i = 0; i < STEPS; i++) {
    const t0 = Date.now(), log = await long(stepJs(i)), ms = Date.now() - t0;
    out.push({ log, ms, sig: sig(await long(state)) });
  }
  const run = await long(`JSON.stringify(__simMonkey.run(${N}, 1))`);
  return { steps: out, run: sig(run) };
}

let diff = 0, lost = 0;
try {
  for (const x of [...list, ...extra]) {
    const a = await walk(x, "off=treeLight"), b = await walk(x, "x=1");
    if (!a || !b) { lost++; console.log(x.key.padEnd(24), "測れない"); continue; }
    const bad = a.steps.findIndex((s, i) => s.sig !== b.steps[i]?.sig || s.log !== b.steps[i]?.log);
    const same = bad < 0 && a.run === b.run;
    if (!same) diff++;
    const ms = (l) => l.steps.slice(1).reduce((v, s) => v + s.ms, 0);
    console.log(x.key.padEnd(24), same ? "同じ" : bad >= 0 ? `違う (${bad} 歩目: ${a.steps[bad].log} / ${b.steps[bad]?.log})` : "100 人が違う", `手 ${STEPS} 回 ${ms(a)} → ${ms(b)} ms`);
  }
} finally { c.close(); }
console.log(`違う木 ${diff}・測れない木 ${lost} / ${list.length + extra.length}`);
process.exit(diff || lost ? 1 : 0);

#!/usr/bin/env node
/**
 * check-tree-pool.mjs — 照らし (check-monkey-engine) でツリーの数字がずれた箱を、箱に着いた実物で比べ直す (シミュ部長 25 本目、2026-10-25)。
 *   node scripts/check-tree-pool.mjs <猿のフォルダー (e-0 など)…> [--out <JSON>]
 * 照らしは手の箱の見本 1 つ (boxItem の raw) でエンジンの割合を出すが、ツリーの回しでは人ごとに着いた時のアイテムが違う (前の手の結果・戻り)。
 * ここでは同じ木を照らしと同じ設定 (300 人・seed 1・値段 1) で回し、手を打つ直前のアイテム (tree-run の onHand) ごとにエンジンの割合 (oddsOf・untilOf) を出して平均し、
 * ツリーの数字と比べる。合えば「見本 1 つで比べた違い」(ツリーもエンジンも正しい)、合わなければ「残る」(どちらかを見る)。
 * 触媒の手 (品質を入れてから打つ) は、打つ前のアイテムでは割合が違うので「比べない」に。手元だけで、外へは出ない
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const args = process.argv.slice(2);
const outAt = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const dirs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (!dirs.length) { console.error("使い方: node scripts/check-tree-pool.mjs <猿のフォルダー>… [--out <JSON>]"); process.exit(1); }

const M = await bundleEntry("scripts/_tree-pool-entry.ts");
M.load();
const data = M.loadPatch();
const ECHO = "OmenofAbyssalEchoes";
/** 1 つの箱の来訪で untilOf を回す人数 (来訪ごとに数人、来訪の数だけ足すので全体では数百人) */
const UNTIL_PEOPLE = Number(process.env.UNTIL_PEOPLE ?? 8);

const rows = [];
for (const dir of dirs) {
  const eng = join(dir, "engine");
  if (!existsSync(eng)) continue;
  for (const f of readdirSync(eng).filter((x) => /^m-\d+\.json$/.test(x))) {
    const e = JSON.parse(readFileSync(join(eng, f), "utf8"));
    const offBoxes = (e.treeCheck?.boxes ?? []).filter((b) => b.off.some((x) => !x.startsWith("渡したアイテム")));
    if (!offBoxes.length) continue;
    const rec = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const doc = rec.tree?.dump, run = rec.tree?.run;
    if (!doc?.boxes || !run) continue;
    delete doc.startRarity;
    const want = new Set(offBoxes.map((b) => b.box));
    const seen = new Map();
    M.runTree(data, doc, { n: run.n ?? 300, seed: 1, price: () => 1, startCost: 0, capDiv: Number.POSITIVE_INFINITY, onHand: (box, item) => { if (want.has(box)) { const l = seen.get(box) ?? []; l.push(item); seen.set(box, l); } } });
    for (const ob of offBoxes) {
      const b = doc.boxes[ob.box], items = seen.get(ob.box) ?? [];
      const row = { at: `${dir}/${f.replace(".json", "")} ${ob.box}`, hand: b.hand.currency, omens: b.hand.omens, repeat: !!b.hand.repeat, arrivals: items.length, was: ob.off, cmp: [], verdict: null };
      if (b.hand.catalyst || b.hand.currency.includes("catalyst")) { row.verdict = "比べない (触媒)"; rows.push(row); continue; }
      const outs = b.outs.map((id) => doc.boxes[id]).filter(Boolean);
      const aims = outs.filter((o) => o.out === "hit" && o.aim).map((o) => o.aim);
      const allAims = Object.values(doc.boxes).filter((o) => o.out === "hit" && o.aim).map((o) => o.aim);
      const omens = b.hand.omens.filter((o) => o !== ECHO), echo = b.hand.omens.includes(ECHO);
      let off = false;
      if (b.hand.repeat) {
        const tr = ob.rows.find((r) => r.what.startsWith("当たるまで"));
        let sum = 0, n = 0, stuck = 0;
        for (const it of items) { const u = M.untilOf(it, b.hand.currency, omens, aims, b.hand.repeat.max ?? 5000, UNTIL_PEOPLE); if (!u) continue; sum += u.mean * u.people; stuck += u.stuck * u.people; n += u.people; }
        const pooled = n ? sum / n : NaN;
        const q = tr?.tree ?? NaN;
        off = !(Number.isFinite(pooled) && Math.abs(q - pooled) / pooled <= 0.25);
        row.cmp.push({ what: "当たるまでの個数", tree: q, sample1: tr?.engine, pooled, stuck: n ? stuck / n : null });
      } else {
        const ps = items.map((it) => M.oddsOf(it, b.hand.currency, omens, aims, allAims, echo));
        const ok = ps.filter(Boolean);
        const hasLost = b.hand.currency.startsWith("essence:") && outs.some((o) => o.out === "lost");
        for (const r of ob.rows) {
          const m = /^当たり (\S+) T(\d+)$/.exec(r.what);
          let pooled;
          if (m) { const k = `${m[1]}|${m[2]}`; pooled = ok.reduce((s, p) => s + ((hasLost ? p.hitKept[k] : p.hit[k]) ?? 0), 0) / Math.max(1, ok.length); }
          else { const hitP = (p) => outs.filter((o) => o.out === "hit" && o.aim).reduce((s, o) => s + (((hasLost ? p.hitKept : p.hit)[`${o.aim.modId}|${o.aim.tier}`]) ?? 0), 0); pooled = ok.reduce((s, p) => s + Math.max(0, 1 - hitP(p)), 0) / Math.max(1, ok.length); }
          const sd = Math.sqrt(Math.max(pooled * (1 - pooled), 1e-9) / Math.max(1, r.n ?? 1));
          const bad = (pooled === 0 && r.tree > 0) || (Math.abs(r.tree - pooled) > 4 * sd && Math.abs(r.tree - pooled) > 0.03);
          if (bad) off = true;
          row.cmp.push({ what: r.what, tree: r.tree, sample1: r.engine, pooled, n: r.n, bad });
        }
        if (!ok.length) { off = true; row.cmp.push({ what: "エンジンで打てない (着いた実物のどれでも)" }); }
      }
      row.verdict = !items.length ? "着いた人 0 (回しが違う)" : off ? "残る" : "見本 1 つで比べた違い";
      rows.push(row);
    }
  }
}
const by = {};
for (const r of rows) { const k = `${r.hand.replace(/:.*$/, "")}${r.repeat ? " 当たるまで" : ""}${r.omens.length ? " +" + r.omens.join("+") : ""}`; by[k] ??= {}; by[k][r.verdict] = (by[k][r.verdict] ?? 0) + 1; }
console.log(`ずれた箱 ${rows.length}: ` + Object.entries(rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join("・"));
for (const [k, v] of Object.entries(by).sort((a, b) => Object.values(b[1]).reduce((s, x) => s + x, 0) - Object.values(a[1]).reduce((s, x) => s + x, 0))) console.log(`  ${k}: ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join("・")}`);
const fmt = (x) => (typeof x === "number" ? (x < 1.5 && x >= 0 && !Number.isInteger(x) ? `${(x * 100).toFixed(1)}%` : x.toFixed(1)) : String(x));
for (const r of rows.filter((x) => x.verdict === "残る").slice(0, Number(process.env.SHOW ?? 30))) console.log(`残る ${r.at} ${r.hand}${r.omens.length ? "+" + r.omens.join("+") : ""} (来訪 ${r.arrivals}): ${r.cmp.map((c) => `${c.what} ツリー ${fmt(c.tree)} / 見本1 ${fmt(c.sample1)} / 実物 ${fmt(c.pooled)}`).join(" ; ")}`);
if (outAt) writeFileSync(outAt, JSON.stringify(rows, null, 1));

/**
 * _tree-odds-probe.test.ts — 猿の記録 (TREE=<猿の JSON>) の 1 つの箱 (BOX=<id>) で、ツリーの手の結果の分け方とエンジンの行き先を並べる台本
 * (2026-10-24 シミュ部長 19 本目、照らし m-602・m-8・m-56・指輪 m-61 b11 のずれ)。
 *
 *   TREE=<猿の JSON> BOX=<箱> pnpm exec vitest run -c scripts/_tree-odds-probe.config.ts
 *
 * 並べる物: ① 箱の見本 (sampleOf、seed 1〜3) と猿が渡した boxItem (今の作りで組み直さない) に、エンジンの stepOutcomes の全部の枝を
 * ツリーの outcomeOf で分けた割合 ② playHand を 2,000 回打って outcomeOf で分けた割合 (骨の発現まで) ③ runTree 300 人の、その箱から次に着いた箱。
 * 並べるだけ (見張りではない)
 */
import fs from "node:fs";
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { mulberry32, type StageItem } from "../src/services/craft-stage/engine";
import { stepOutcomes } from "../src/services/craft-stage/engine-sim";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { aimsOf, handAims, outcomeOf, playHand, sampleOf } from "../src/services/simulator/tree/tree-sample";
import { engineOmens } from "../src/services/simulator/tree/tree-hands";
import { withTreeTune } from "../src/services/simulator/tree/tree-tune";
import type { TreeDoc } from "../src/services/simulator/tree/tree-model";

const show = (it: StageItem): string => `${it.rarity} ${[...it.prefixes, ...it.suffixes].map((m) => `${m.side[0]}:${m.modId}#${m.tierName}${m.unrevealed ? "?" : ""}${m.fractured ? "✦" : ""}`).join(" ")}`;
const pct = (m: Map<string, number>, n: number): string => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((100 * v) / n).toFixed(1)}%`).join(" / ");

/** RERUN=<猿の記録のフォルダー> OUT=<書き出すフォルダー> … 記録の tree.run を今の作りの runTree (100 人・seed 1・値段 1) で回し直して書き出す (照らしの check-monkey-engine.mjs に掛け直す用) */
it.runIf(!!process.env.RERUN)("回し直し", () => {
  const data = loadPatch(), dir = process.env.RERUN!, out = process.env.OUT!;
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const raw = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
    if (raw.tree?.dump?.boxes && raw.tree.run) raw.tree.run = runTree(data, raw.tree.dump, { n: 100, seed: 1, price: () => 1 });
    fs.writeFileSync(`${out}/${f}`, JSON.stringify(raw));
  }
});

it.runIf(!process.env.RERUN)("箱の手の分け方とエンジン", () => {
  const raw = JSON.parse(fs.readFileSync(process.env.TREE!, "utf8"));
  const doc: TreeDoc = raw.tree?.dump ?? raw;
  const id = process.env.BOX!, b = doc.boxes[id]!, h = b.hand!;
  const data = loadPatch();
  const aims = aimsOf(doc);
  console.log(`箱 ${id} 手 ${h.currency} ${h.omens.join(",")} → ${b.outs.map((o) => `${o}:${doc.boxes[o]?.out}${doc.boxes[o]?.aim ? `(${doc.boxes[o]!.aim!.modId} T${doc.boxes[o]!.aim!.tier})` : ""}`).join(" ")}`);
  console.log(`狙い ${aims.map((a) => `${a.modId} T${a.tier}`).join(", ")}`);
  withTreeTune(doc, () => {
    const forms: [string, StageItem][] = [1, 2, 3].map((s) => [`見本 ${s}`, sampleOf(data, doc, id, s).item]);
    const bi = raw.tree?.items?.[id];
    if (bi?.raw) forms.push(["boxItem", bi.preRaw ?? bi.raw]);
    for (const [name, item] of forms) {
      console.log(`${name}: ${show(item)}`);
      const outs = stepOutcomes(data, item, h.currency, engineOmens(h));
      if (outs) {
        const m = new Map<string, number>();
        for (const o of outs) { if (o.void) continue; const r = outcomeOf(data, item, o.item, aims, h.currency); const k = `${r.out}${r.hits.length ? `(${r.hits.map((a) => a.modId).join(",")})` : ""}`; m.set(k, (m.get(k) ?? 0) + o.p); }
        console.log(`  エンジンの枝 → ツリーの分け: ${pct(m, 1)}`);
      } else console.log("  エンジンの枝: 数えられない手");
      const m = new Map<string, number>(), ex = new Map<string, string>();
      const rng = mulberry32(7);
      for (let i = 0; i < 2000; i++) {
        const r = playHand(data, item, h, rng, handAims(doc, id, aims));
        const k = r.applied ? (({ out, hits }) => `${out}${hits.length ? `(${hits.map((a) => a.modId).join(",")})` : ""}`)(outcomeOf(data, item, r.item, aims, h.currency)) : `打てない ${r.reason}`;
        m.set(k, (m.get(k) ?? 0) + 1);
        if (!ex.has(k) && r.applied) ex.set(k, show(r.item));
      }
      console.log(`  playHand 2,000 回: ${pct(m, 2000)}`);
      for (const [k, v] of ex) console.log(`    例 ${k}: ${v}`);
    }
  });
  // PAT=<"b6 b3"> … その並びを通った人の道を 2 人分
  let shown = 0;
  const run = runTree(data, doc, { n: 300, seed: 1, price: () => 1, onPerson: (p) => { const s = p.visits.map((v) => v.box).join(" "); if (process.env.PAT && s.includes(process.env.PAT) && shown++ < 2) console.log(`道 ${s.slice(0, 400)}`); } });
  const from = Object.entries(run.edges).filter(([k]) => k.startsWith(`${id}>`));
  console.log(`300 人: ${id} から ${from.map(([k, v]) => `${k} ${v}`).join(" / ")} · 完成 ${run.finished} 止まり ${run.stuck} ${JSON.stringify(run.stuckAt)} 想定外 ${JSON.stringify(run.unexpected)}`);
});

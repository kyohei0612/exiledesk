/**
 * _tree-file-check-probe.test.ts — 保存した木 (JSON) にルート精査と 100 人回しを掛けて並べる台本 (2026-10-22 シミュ部長 8 本目、白紙から組んだ靴・手袋の止まりと精査の突き合わせ)。
 *
 *   TREE=<木の JSON のパス> pnpm exec vitest run -c scripts/_tree-file-check-probe.config.ts
 *   SAMPLE=<見本の名前> …  (tree-samples.ts の見本、10-22 10 本目)
 *   PATHS=<n> …  止まった人の先頭 n 人の通った箱を並べる (10-22 11 本目)
 *
 * 精査の穴 (種類・箱・文) と、100 人 (seed 1・値段 0) の完成・止まりの箱。並べるだけ (見張りではない)
 */
import fs from "node:fs";
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { runTree } from "../src/services/simulator/tree/tree-run";
import type { TreeDoc } from "../src/services/simulator/tree/tree-model";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

it("保存した木の精査と回し", () => {
  const path = process.env.TREE, name = process.env.SAMPLE;
  if (!path && !name) throw new Error("TREE=<木の JSON> か SAMPLE=<見本の名前> を渡す");
  const raw = path ? JSON.parse(fs.readFileSync(path, "utf8")) : null;
  const doc: TreeDoc | null = raw ? raw.tree ?? raw : treeSample(name!);
  if (!doc) throw new Error(`見本が無い: ${name}`);
  const data = loadPatch();
  const t0 = Date.now();
  const issues = checkTree(data, doc);
  console.log(`精査 ${Date.now() - t0}ms 穴 ${issues.length}`);
  for (const x of issues) console.log(`  ${x.kind.padEnd(10)} ${x.boxId.padEnd(5)} ${x.text}`);
  let shown = Number(process.env.PATHS ?? 0);
  const r = runTree(data, doc, { n: 100, seed: 1, price: () => 0, onPerson: (p, i) => { if ((p.end !== "done" || p.at === process.env.DONE_AT) && shown-- > 0) console.log(`  ${i + 1} 人目 ${p.end} ${p.at} ${p.visits.length} 箱: ${p.visits.slice(-12).map((v) => v.box).join(" → ")}${p.why ? ` / 前 ${p.why.item.prefixes.map((m) => m.modId + (m.fractured ? "✦" : "")).join(", ")} / 後 ${p.why.item.suffixes.map((m) => m.modId).join(", ")}` : ""}`); } });
  console.log(`100 人: 完成 ${r.finished} · 打ち止め ${r.capped} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
  for (const [id, w] of Object.entries(r.stuckWhy)) console.log(`  止まり ${id} (戻り ${w.backs.join(" → ")}): ${w.reason} / 前 ${w.item.prefixes.map((m) => m.modId).join(", ")} / 後 ${w.item.suffixes.map((m) => m.modId).join(", ")}`);
});

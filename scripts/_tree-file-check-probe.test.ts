/**
 * _tree-file-check-probe.test.ts — 保存した木 (JSON) にルート精査と 100 人回しを掛けて並べる台本 (2026-10-22 シミュ部長 8 本目、白紙から組んだ靴・手袋の止まりと精査の突き合わせ)。
 *
 *   TREE=<木の JSON のパス> pnpm exec vitest run -c scripts/_tree-file-check-probe.config.ts
 *
 * 精査の穴 (種類・箱・文) と、100 人 (seed 1・値段 0) の完成・止まりの箱。並べるだけ (見張りではない)
 */
import fs from "node:fs";
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { runTree } from "../src/services/simulator/tree/tree-run";
import type { TreeDoc } from "../src/services/simulator/tree/tree-model";

it("保存した木の精査と回し", () => {
  const path = process.env.TREE;
  if (!path) throw new Error("TREE=<木の JSON> を渡す");
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  const doc: TreeDoc = raw.tree ?? raw;
  const data = loadPatch();
  const t0 = Date.now();
  const issues = checkTree(data, doc);
  console.log(`精査 ${Date.now() - t0}ms 穴 ${issues.length}`);
  for (const x of issues) console.log(`  ${x.kind.padEnd(10)} ${x.boxId.padEnd(5)} ${x.text}`);
  const r = runTree(data, doc, { n: 100, seed: 1, price: () => 0 });
  console.log(`100 人: 完成 ${r.finished} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
});

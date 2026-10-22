/**
 * _tree-split-probe.test.ts — 分かれ目の箱 (打たずに分ける、2026-10-22 シミュ部長 9 本目) で白から組んだ靴の木を組み直し、精査と 100 人を解析君の boots と並べる台本。
 *
 *   TREE=<白から組んだ靴の木の JSON> [OUT=<組み直した木の JSON>] pnpm exec vitest run -c scripts/_tree-split-probe.config.ts
 *
 * 組み直し (画面と同じ tree-model の関数で): カオスの当たり (火の箱 b2) を分かれ目に → 狙い 2 つ以上 = 完成 / 狙い 0 = カオスの箱へ戻る /
 * サフィの外れ 2 つ以上 = 消去 (結果は分かれ目へ戻る) / それ以外 = 右側の高貴 + 上級 (結果は全部分かれ目へ戻る)。冷気・雷の当たりは前から分かれ目 (b2) へ戻る。
 * 値段は解析君の check-tree-run.mjs と同じ表 (EX)。並べるだけ (見張りではない)
 */
import fs from "node:fs";
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { addSplitRow, setBack, setDone, setHand, setSplit, type Hand, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { aimsOf } from "../src/services/simulator/tree/tree-sample";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { runTree } from "../src/services/simulator/tree/tree-run";

const EX: Record<string, number> = { chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.83 };
const price = (k: string): number => (EX[k] ?? 0) / 696.929;
const hand = (currency: string, omens: string[] = []): Hand => ({ currency, omens, catalyst: null, quality: 0, repeat: null });

it("分かれ目で組んだ靴", () => {
  const data = loadPatch();
  const raw = JSON.parse(fs.readFileSync(process.env.TREE!, "utf8"));
  const before: TreeDoc = raw.tree ?? raw;
  const d: TreeDoc = JSON.parse(JSON.stringify(before));
  const aims = aimsOf(d);
  const J = "b2";
  setSplit(d, J);
  addSplitRow(d, J, { heldCount: [2, 99] });
  addSplitRow(d, J, { heldCount: [0, 0] });
  addSplitRow(d, J, { junk: { suffix: [2, 99] } });
  const [cDone, cNone, cJunk, cElse] = d.boxes[J]!.split!.map((r) => r.to!);
  setDone(d, cDone!, "main");
  setBack(d, cNone!, "b1");
  setHand(d, cJunk!, hand("annul"), "remove");
  for (const o of d.boxes[cJunk!]!.outs) setBack(d, o, J);
  setHand(d, cElse!, hand("exalt_greater", ["OmenofDextralExaltation"]), "add", aims);
  for (const o of d.boxes[cElse!]!.outs) setBack(d, o, J);
  console.log("分かれ目の行", JSON.stringify(d.boxes[J]!.split), "/ 箱", Object.keys(d.boxes).length);
  for (const [name, doc] of [["白から組んだまま", before], ["分かれ目で組み直し", d]] as const) {
    const issues = checkTree(data, doc);
    console.log(`■ ${name}: 精査 穴 ${issues.length}`);
    for (const x of issues) console.log(`    ${x.kind.padEnd(10)} ${x.boxId.padEnd(5)} ${x.text.slice(0, 90)}`);
    const r = runTree(data, doc, { n: 100, seed: 1, price });
    console.log(`  100 人: 完成 ${r.finished}% · 1 個 ${r.perItem.toFixed(2)} 神 · 中央 ${r.median.toFixed(1)} · 90% ${r.p90.toFixed(1)} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(d));
});

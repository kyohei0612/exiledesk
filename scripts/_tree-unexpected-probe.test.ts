/**
 * _tree-unexpected-probe.test.ts — 結果の箱に無い結果が出た時 (結果が 1 通りとして箱を 1 つにした手など) の扱いを確かめる台本 (2026-10-22 シミュ部長 7 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-unexpected-probe.config.ts   (人数は N=、既定 300)
 *
 * 見本の木をわざと崩す: 崩し 1 = 外れの箱 jR (消去) の結果を「外れが消えた」1 箱に (狙いが消えた結果は形の合う箱 = 始まりへ進むはず (a))、
 * 崩し 2 = d1 (素の高貴) の結果を「当たり」1 箱に (外れは形の合う箱が無いので止まるはず (b))。回す側の unexpected・stuckAt と精査の ! を並べる
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { treeSample } from "../src/services/simulator/tree/tree-samples";
import type { TreeDoc } from "../src/services/simulator/tree/tree-model";

const drop = (d: TreeDoc, id: string): void => { for (const k of d.boxes[id]?.outs ?? []) drop(d, k); delete d.boxes[id]; };

it("想定外の結果", () => {
  const data = loadPatch();
  const N = Number(process.env.N ?? 300);
  const cases: [string, (d: TreeDoc) => void][] = [
    ["見本のまま", () => {}],
    ["崩し 1: jR を外れが消えた 1 箱", (d) => { drop(d, "jR_l"); d.boxes.jR!.outs = ["jR_g"]; }],
    ["崩し 2: d1 を当たり 1 箱", (d) => { drop(d, "pJ"); d.boxes.d1!.outs = ["pR"]; }],
  ];
  for (const [name, f] of cases) {
    const doc = treeSample("gold-ring-suffix")!;
    f(doc);
    const r = runTree(data, doc, { n: N, seed: 1, price: () => 0 });
    const odd = checkTree(data, doc).filter((x) => x.kind === "unexpected" || x.kind === "cantUse" || x.kind === "noMatch");
    console.log(`${name}: ${N} 人 完成 ${r.finished} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)} · 想定外 ${JSON.stringify(r.unexpected)}\n  精査 ${odd.map((x) => `[${x.boxId}] ${x.text}`).join(" / ") || "なし"}`);
  }
});

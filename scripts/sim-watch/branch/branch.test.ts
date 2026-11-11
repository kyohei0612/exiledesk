// 木の決められた枝 ⇄ エンジンで打った結果の突き合わせを回す口 (S-210、中身は sweep.ts、使い方は README.md)。tests/ の自動テストには入れない
import fs from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadPatch } from "../../../tests/helpers/patch";
import { allowedRows, BASES, newTally, shapesOf, sweepShape, type Find } from "./sweep";

const data = loadPatch(), rows = allowedRows(), t = newTally();
const all: Find[] = [];
const log = (line: string): void => { if (process.env.LOG) fs.appendFileSync(process.env.LOG, `${new Date().toTimeString().slice(0, 8)} [枝の突き合わせ] ${line}\n`); };
// PART=i/n で部位を割る (裏で並べて回す時)。BASE=<名前の一部> で 1 部位
const [pi, pn] = (process.env.PART ?? "0/1").split("/").map(Number) as [number, number];
const bases = BASES.filter((b, i) => i % pn === pi && (!process.env.BASE || b.includes(process.env.BASE)));

afterAll(() => {
  const bad = all.filter((f) => !f.allow), ok = all.filter((f) => f.allow);
  const sum = `部位 ${bases.length} / 置いた手 ${t.hands} (打てない ${t.cant}・同じ手の戻り ${t.back}・対象の外 ${t.skipped}) / 比べた ${t.compared} / 打った ${t.draws} 回 (不成立 ${t.voids}) / 食い違い ${bad.length} / わざとの上書き ${ok.length}`;
  console.log(`枝の突き合わせ: ${sum}`);
  log(`済み ${sum}`);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ sum, tally: t, finds: all }, null, 1));
});

for (const base of bases) {
  describe(`枝の突き合わせ ${base}`, () => {
    for (const shape of shapesOf()) {
      it(shape, async () => {
        const t0 = Date.now();
        const finds = await sweepShape(data, base, shape, rows, t);
        if (!finds) { log(`${base} / ${shape}: この形は作れない (飛ばした)`); return; }
        all.push(...finds);
        const bad = finds.filter((f) => !f.allow);
        log(`${base} / ${shape}: ${((Date.now() - t0) / 1000).toFixed(1)} 秒 / 食い違い ${bad.length} / わざと ${finds.length - bad.length}`);
        expect(bad.map((f) => `${f.kind} | ${f.hand} | ${f.what}`), bad.slice(0, 30).map((f) => `${f.kind} | ${f.hand} | ${f.what}`).join("\n")).toEqual([]);
      }, 1_800_000);
    }
  });
}

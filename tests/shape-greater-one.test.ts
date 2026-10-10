// 偉大で 1 つしか付かない時 (お告げの側の空きが 1 つ) は「2 つ」の文を出さない (2026-10-10)
import { expect, it } from "vitest";
import { shapeOutcomes, type ShapeCtx } from "../src/services/craft-stage/shape-table";
import type { PatternSet } from "../src/services/craft-stage/pattern";

it("左 + 偉大で左の空きが 1 つ → 1 つの文", () => {
  const c: ShapeCtx = { side: "prefix", limit: 3, need: 1, otherRemovable: 0, sets: [] };
  const x = { key: "k", kind: "exalt", currency: "exalt_perfect", omens: ["OmenofSinistralExaltation", "OmenofGreaterExaltation"], group: "高貴" } as PatternSet;
  const out = shapeOutcomes(c, x, 0, 2);
  expect(out.map((o) => o.label).some((l) => /2 つ/.test(l))).toBe(false);
  expect(out.every((o) => o.h + o.j === 3)).toBe(true);
  expect(out.some((o) => /空きが 1 つなので 1 つだけ/.test(o.label))).toBe(true);
  // 空きが 2 つなら 2 つの文
  const two = shapeOutcomes(c, x, 0, 1);
  expect(two.map((o) => o.label)).toContain("狙い以外が 2 つ");
});

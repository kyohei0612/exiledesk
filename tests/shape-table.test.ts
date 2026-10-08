import { describe, expect, it } from "vitest";
import { reachableShapes, shapeOutcomes, shapesLeft, type ShapeCtx } from "../src/services/craft-stage/shape-table";
import type { PatternSet } from "../src/services/craft-stage/pattern";

const S = (kind: PatternSet["kind"], currency: string, omens: string[]): PatternSet => ({ key: `${kind}|${currency}|${omens.join("+")}`, kind, currency, omens, group: "" });
const G = S("exalt", "exalt_perfect", ["OmenofSinistralExaltation", "OmenofGreaterExaltation"]);
const ONE = S("exalt", "exalt_perfect", ["OmenofSinistralExaltation"]);
const AN = S("annul", "annul", []);
const c: ShapeCtx = { side: "prefix", limit: 3, need: 3, otherRemovable: 0, pHit: () => 0.25, sets: [G, ONE, AN] };

describe("打って決める (形の決まり、2026-10-09)", () => {
  it("偉大の結果は 3 つで確率の合計は 1。サフィが固定だけなら素の消去もプレの中から", () => {
    const o = shapeOutcomes(c, G, 1, 0);
    expect(o.map((x) => `${x.h}-${x.j}`)).toEqual(["3-0", "2-1", "1-2"]);
    expect(o.reduce((a, x) => a + x.p!, 0)).toBeCloseTo(1);
    const a = shapeOutcomes(c, AN, 2, 1);
    expect(a.find((x) => x.h === 2 && x.j === 0)!.p).toBeCloseTo(1 / 3);
    expect(shapeOutcomes({ ...c, otherRemovable: 1 }, AN, 2, 1).some((x) => x.h === 2 && x.j === 1)).toBe(true);
  });
  it("決めた手の結果を辿って形が増え、全部決めると残り 0", () => {
    const pol: Record<string, { set?: string; then?: "miss" }> = {};
    expect(shapesLeft(c, G, 1, 0, pol)).toBe(2);
    pol["2-1"] = { set: AN.key };
    pol["1-2"] = { set: AN.key };
    // 消去の結果で 2-0 / 1-1 / 0-2 が増える
    expect(reachableShapes(c, G, 1, 0, pol).map((r) => `${r.h}-${r.j}`).sort()).toEqual(["0-2", "1-1", "1-2", "2-0", "2-1"]);
    pol["2-0"] = { set: ONE.key };
    pol["1-1"] = { set: AN.key };
    pol["0-2"] = { then: "miss" };
    pol["1-0"] = { set: G.key };
    pol["0-1"] = { then: "miss" };
    expect(shapesLeft(c, G, 1, 0, pol)).toBe(0);
  });
});

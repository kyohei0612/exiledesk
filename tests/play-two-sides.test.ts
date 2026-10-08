import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runRecipe } from "../src/services/craft-stage/recipe-sim";
import { aimTarget, compilePlay, sideNeedBefore, type PlayDecision, type PlayRecipe } from "../src/services/craft-stage/play-recipe";
import { keyOfShape, reachableShapes, shapeOutcomes, type ShapeCtx } from "../src/services/craft-stage/shape-table";
import type { PatternSet, PolicyAct } from "../src/services/craft-stage/pattern";

const S = (kind: PatternSet["kind"], currency: string, omens: string[] = []): PatternSet => ({ key: `${kind}|${currency}|${omens.join("+")}`, kind, currency, omens, group: "" });
const ALC = S("alchemy", "alchemy"), CH = S("chaos", "chaos"), AN = S("annul", "annul");
const EXL = S("exalt", "exalt_perfect", ["OmenofSinistralExaltation"]);
const SETS = [ALC, CH, AN, EXL];

describe("両側に狙いがある時の形 (2026-10-09)", () => {
  it("サフィを作るカオスでプレの狙いが消えた形は、サフィが揃っても揃った扱いにしない", () => {
    const c: ShapeCtx = { side: "suffix", limit: 3, need: 1, otherRemovable: 1, otherHits: 1, otherLimit: 3, otherFixed: 0, sets: SETS };
    const outs = shapeOutcomes(c, CH, { h: 0, j: 1, g: 1, o: 0 });
    // プレの狙いが消えてサフィに狙いが付いた (h 1・g 0) がある
    const lost = outs.find((o) => o.h === 1 && o.j === 1 && o.g === 0);
    expect(lost?.label).toContain("プレの狙いが消えて");
    const r = reachableShapes(c, CH, 0, 1, {});
    expect(r.some((x) => keyOfShape(x) === "1-1-0")).toBe(true);
  });

  it("金の指輪: 錬金 → 左の完全高貴でプレにライフ → カオスでサフィに火耐性。ライフが消えた形は 2 手目に戻す、と決めると回って揃う", async () => {
    const data = await loadPatch();
    const life = { modId: "Rings/IncreasedLife", minTierIndex: Math.max(0, data.mods.get("Rings/IncreasedLife")!.tiers.length - 4) };
    const fire = { modId: "Rings/FireResistance", minTierIndex: Math.max(0, data.mods.get("Rings/FireResistance")!.tiers.length - 4) };
    const recipe: PlayRecipe = {
      v: 2,
      moves: [
        { use: ALC.key, aim: null },
        { use: EXL.key, aim: { mods: [life], need: 1, side: "prefix" } },
        { use: CH.key, aim: { mods: [fire], need: 1, side: "suffix" } },
      ],
    };
    // 形を全部決める: プレ (2 手目) は狙い以外を消去してもう一度、満杯なら消去。サフィ (3 手目) はカオスを打ち直し、ライフが消えたら 2 手目へ
    const toPol = (sh: Record<string, PlayDecision>): Record<string, PolicyAct> => Object.fromEntries(Object.entries(sh).map(([k, d]) => [k, "use" in d ? { set: d.use } : { then: "goto" as const, goto: 0 }]));
    const fill = (i: number, c: ShapeCtx, starts: Array<[number, number]>, pick: (s: { h: number; j: number; g?: number }) => PlayDecision): void => {
      const m = recipe.moves[i]!;
      const x = SETS.find((y) => y.key === m.use)!;
      m.shapes = {};
      for (let n = 0; n < 30; n++) {
        const left = starts.flatMap(([h0, j0]) => reachableShapes(c, x, h0, j0, toPol(m.shapes!))).filter((r) => !m.shapes![keyOfShape(r)]);
        if (!left.length) break;
        for (const r of left) m.shapes[keyOfShape(r)] = pick(r);
      }
    };
    fill(1, { side: "prefix", limit: 3, need: 1, otherRemovable: 2, sets: SETS }, [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2]], (s) => ({ use: s.h + s.j >= 3 ? AN.key : EXL.key }));
    expect(sideNeedBefore(recipe, 2, "prefix")).toBe(1);
    fill(2, { side: "suffix", limit: 3, need: 1, otherRemovable: 3, otherHits: 1, sets: SETS }, [[0, 0], [0, 1], [0, 2], [0, 3]], (s) => (s.g === 0 ? { go: "move", to: 1 } : { use: CH.key }));
    const pattern = compilePlay(recipe, SETS)!;
    expect(pattern[2]!.gNeed).toBe(1);
    expect(Object.keys(pattern[2]!.policy ?? {}).every((k) => k.split("-").length === 3)).toBe(true);
    const r = await runRecipe({ data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 21, whiteBasePrice: 0, maxSteps: 20_000, targets: [aimTarget(recipe.moves[1]!.aim!), aimTarget(recipe.moves[2]!.aim!)], pattern });
    expect(r!.pDone).toBeGreaterThan(0.8);
  });
});

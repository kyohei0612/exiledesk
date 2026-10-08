import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runRecipe } from "../src/services/craft-stage/recipe-sim";
import { aimTarget, compilePlay, playLeft, type PlayRecipe } from "../src/services/craft-stage/play-recipe";
import type { PatternSet } from "../src/services/craft-stage/pattern";

const S = (kind: PatternSet["kind"], currency: string, omens: string[] = []): PatternSet => ({ key: `${kind}|${currency}|${omens.join("+")}`, kind, currency, omens, group: "" });
const ALC = S("alchemy", "alchemy"), CH = S("chaos", "chaos"), AN = S("annul", "annul", ["OmenofSinistralAnnulment"]);
const G = S("exalt", "exalt_perfect", ["OmenofSinistralExaltation", "OmenofGreaterExaltation"]), ONE = S("exalt", "exalt_perfect", ["OmenofSinistralExaltation"]);
const SETS = [ALC, CH, AN, G, ONE];

describe("打って作るレシピの型 (ADR-002、2026-10-09)", () => {
  it("金の指輪のトリフラ: 錬金 (打つだけ) → カオスでどれか 1 つ → 偉大左で残り。形を全部決めると残り 0 で、計算もつながる", async () => {
    const data = await loadPatch();
    const ids = ["Rings/FireDamage", "Rings/ColdDamage", "Rings/LightningDamage"];
    const mods = ids.map((id) => ({ modId: id, minTierIndex: data.mods.get(id)!.tiers.length - 4 }));
    const spam = { mods, need: 1, side: "prefix" as const };
    const rest = { mods, need: 3, side: "prefix" as const };
    const back = { go: "move" as const, to: 1, strip: 1 };
    const recipe: PlayRecipe = {
      v: 2,
      moves: [
        { use: ALC.key, aim: null },
        { use: CH.key, aim: spam, shapes: { "0-0": { use: CH.key }, "0-1": { use: CH.key }, "0-2": { use: CH.key }, "0-3": { use: CH.key } } },
        { use: G.key, aim: rest, shapes: { "2-1": { use: AN.key }, "1-2": { use: AN.key }, "1-1": { use: AN.key }, "2-0": { use: ONE.key }, "1-0": { use: G.key }, "0-1": back, "0-2": back } },
      ],
    };
    expect(playLeft(recipe, SETS, 3, 0)).toEqual([0, 0, 0]);
    // 偉大の手の形を 1 つ外すと、その手が残り 1
    const holed: PlayRecipe = { ...recipe, moves: recipe.moves.map((m, i) => (i === 2 ? { ...m, shapes: { ...m.shapes } } : m)) };
    delete holed.moves[2]!.shapes!["1-1"];
    expect(playLeft(holed, SETS, 3, 0)[2]).toBeGreaterThan(0);

    const pattern = compilePlay(recipe, SETS)!;
    const r = await runRecipe({ data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 11, whiteBasePrice: 0, maxSteps: 20_000, targets: [aimTarget(rest)], pattern });
    expect(r!.pDone).toBeGreaterThan(0.8);
    expect(r!.bases).toBeLessThan(1.01);
  });
});

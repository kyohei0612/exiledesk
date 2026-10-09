import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runRecipe, runRecipeOnce, type RecipeTarget } from "../src/services/craft-stage/recipe-sim";
import { aimTarget, compilePlay, pathTo, type PlayRecipe } from "../src/services/craft-stage/play-recipe";
import type { PatternSet } from "../src/services/craft-stage/pattern";

const S = (kind: PatternSet["kind"], currency: string, omens: string[] = []): PatternSet => ({ key: `${kind}|${currency}|${omens.join("+")}`, kind, currency, omens, group: "" });

/**
 * 両側の狙い (side any) と、当たった側で分かれる道 (2026-10-10 MazBro のキャスターの指輪)。
 * カオスで「T1 の最大マナ量 (プレ) / マナ回復・レアリティ・全耐性 (サフィ)」のどれか → プレの道 / サフィの道
 */
describe("両側の狙いと分かれる道", () => {
  const R = "Rings/";
  const FLAT = { modId: R + "IncreasedMana", minTierIndex: 11 };
  const MAXP = { modId: R + "PerfectEssence_MaximumManaIncreasePercent", minTierIndex: 0 };
  const REGEN = { modId: R + "ManaRegeneration", minTierIndex: 5 };
  const RAR = { modId: R + "ItemFoundRarityIncrease", minTierIndex: 2 };
  const RES = { modId: R + "AllResistances", minTierIndex: 4 };
  const ESS = `essence:perfect:${MAXP.modId}`;
  const CH = S("chaos", "chaos");
  const ESS_L = S("essence_perfect", ESS, ["OmenofSinistralCrystallisation"]);
  const ESS_R = S("essence_perfect", ESS, ["OmenofDextralCrystallisation"]);
  const EX_L = S("exalt", "exalt_greater", ["OmenofSinistralExaltation"]);
  const AN_L = S("annul", "annul");
  const EX_R2 = S("exalt", "exalt_perfect", ["OmenofDextralExaltation", "OmenofGreaterExaltation"]);
  const EX_R = S("exalt", "exalt_perfect", ["OmenofDextralExaltation"]);
  const AN_R = S("annul", "annul");
  const MBL = { modId: R + "Otherworldly_DamageRemovedFromManaBeforeLife", minTierIndex: 0 };
  const DES = S("desecrate", "desecrate_altered", ["OmenofSinistralNecromancy", "OmenofAbyssalEchoes"]);
  const LIGHT = S("annul", "annul", ["OmenofLight"]);
  const SETS = [CH, ESS_L, ESS_R, EX_L, AN_L, EX_R2, EX_R, AN_R, DES, LIGHT];
  const recipe: PlayRecipe = {
    v: 2,
    moves: [
      { use: CH.key, aim: { mods: [FLAT, REGEN, RAR, RES], need: 1, side: "any" }, branch: { prefix: 3, suffix: 1 } },
      { use: ESS_L.key, aim: { mods: [MAXP], need: 1, side: "prefix" } },
      { use: EX_L.key, aim: { mods: [FLAT], need: 1, side: "prefix" }, shapes: { "1-1": { use: AN_L.key }, "1-0": { go: "move", to: 2 }, "0-1": { go: "move", to: 1 } }, next: 5 },
      { use: ESS_R.key, aim: { mods: [MAXP], need: 1, side: "prefix" } },
      { use: EX_R2.key, aim: { mods: [REGEN, RAR, RES], need: 1, side: "suffix" }, shapes: { "0-2-2": { use: AN_R.key }, "0-1-2": { use: EX_R.key }, "0-2-1": { go: "move", to: 4 } }, next: 2 },
      // (プレの道はサフィの当たりの後、サフィの道の「上級高貴 + 左」へ合流: 途中で最大マナ量が消えても取り直せる)
      // 仕上げ: 変質した鎖骨 + 左のネクロマンシーでマナ・ビフォア・ライフ。外れは光のお告げ + 消去でもう一度
      { use: DES.key, aim: { mods: [MBL], need: 1, side: "prefix" }, shapes: { "2-1": { use: LIGHT.key }, "2-0": { go: "move", to: 5 } } },
    ],
  };
  // 画面と同じ: フラクチャー + 手の狙い (同じ MOD の組は need の一番大きい物)
  const targets: RecipeTarget[] = [
    { modId: R + "IncreasedCastSpeed", minTierIndex: 4, method: "fracture" },
    ...recipe.moves.flatMap((m) => (m.aim && m.aim.side !== "any" ? [aimTarget(m.aim)] : [])).filter((t, i, a) => a.findIndex((x) => [x.modId, ...(x.alts ?? []).map((y) => y.modId)].sort().join() === [t.modId, ...(t.alts ?? []).map((y) => y.modId)].sort().join()) === i),
  ];

  it("道: サフィの道の手はプレの道の手を前に数えない", () => {
    expect(pathTo(recipe, 2).map((x) => x.k)).toEqual([0, 1]);
    expect(pathTo(recipe, 4).map((x) => x.k)).toEqual([0, 3]);
    // 両方の道が仕上げの手に合流する
    expect([2, 4]).toContain(pathTo(recipe, 5).map((x) => x.k).slice(-1)[0]);
    expect(pathTo(recipe, 2)[0]!.side).toBe("suffix");
  });

  it("回すと完成する (固定済みを買って始める)", async () => {
    const data = await loadPatch();
    const pattern = compilePlay(recipe, SETS)!;
    expect(pattern).not.toBeNull();
    const spec = { data, base: "Mnemonic Ring", itemLevel: 82, runs: 20, price: () => 1, seed: 3, whiteBasePrice: 0, maxSteps: 20_000, targets, pattern, fractureStart: { kind: "bought" as const, price: 1 } };
    const one = runRecipeOnce(spec, 5);
    expect(one.done).toBe(true);
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.8);
    // 消去でカオスの当たりが消えたらカオスへ戻る (固定済みのベースを買い直さない)
    expect(r!.bases).toBeLessThan(1.2);
  });

  it("高貴でも両側のどれか 1 つで道が分かれる: 空きがある間は打ち、埋まったら外れを消して打つ (2026-10-09)", async () => {
    const data = await loadPatch();
    const EXP = S("exalt", "exalt_perfect");
    const any = { mods: [{ modId: R + "IncreasedMana", minTierIndex: 0 }, { modId: R + "AllResistances", minTierIndex: 0 }], need: 1, side: "any" as const };
    const r2: PlayRecipe = { v: 2, moves: [{ use: EXP.key, aim: any, branch: { prefix: "end", suffix: "end" } }] };
    const pattern = compilePlay(r2, [EXP, AN_L])!;
    expect(pattern[0]!.spam).toBeUndefined();
    expect(pattern[0]!.onMiss).toBe("redo");
    const t2: RecipeTarget[] = [{ modId: R + "IncreasedCastSpeed", minTierIndex: 4, method: "fracture" }, { ...any.mods[0]!, alts: [any.mods[1]!] }];
    const spec = { data, base: "Mnemonic Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 7, whiteBasePrice: 0, maxSteps: 20_000, targets: t2, pattern, fractureStart: { kind: "bought" as const, price: 1 } };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.95);
    // 当たった側はプレとサフィの両方がある
    const sides = new Set(Array.from({ length: 30 }, (_, k) => runRecipeOnce(spec, k)).filter((o) => o.done).flatMap((o) => (o.hits ?? []).filter((id) => any.mods.some((a) => a.modId === id)).map((id) => data.mods.get(id)?.type)));
    expect(sides.has("prefix") && sides.has("suffix")).toBe(true);
  });
});

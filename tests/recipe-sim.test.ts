// 決めた順番と付け方どおりに作るシミュレーション (2026-10-05)。完成すること、記録した 1 回を手順 JSON で再生すると同じ物になること
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runRecipe, runRecipeOnce, recipePlan, type RecipeSpec } from "../src/services/craft-stage/recipe-sim";
import { playPlan } from "../src/services/craft-stage/run-plan";
import { allMods } from "../src/services/craft-stage/stage-core";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";

function targetOf(data: PatchData, base: string, re: RegExp, rank: number): { modId: string; minTierIndex: number } {
  const m = [...data.mods.values()].find((x) => x.id.startsWith(`${base}/`) && x.source === "normal" && re.test(x.id))!;
  return { modId: m.id, minTierIndex: m.tiers.length - rank };
}

describe("順番どおりのシミュレーション", () => {
  it("金の指輪: ライフ (高貴) → 火耐性 (高貴) → 雷耐性 (冒涜) が作れて、再生で同じ物になる", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 3);
    const fire = targetOf(data, "Rings", /FireResistance$/, 3);
    const light = targetOf(data, "Rings", /LightningResistance$/, 3);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 1000,
      targets: [{ ...life, method: "exalt" }, { ...fire, method: "exalt" }, { ...light, method: "desecrate" }],
    };
    const r = await runRecipe(spec);
    expect(r).not.toBeNull();
    expect(r!.pDone).toBeGreaterThan(0.9);
    const run = r!.sample!;
    const { final } = playPlan(data, recipePlan(spec, run), {});
    for (const t of spec.targets) expect(allMods(final).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex)).toBe(true);
  });

  it("フラクチャー: 作る (確率込み) と 付いた状態 の両方で完成し、固定済みが残る", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 4);
    const fire = targetOf(data, "Rings", /FireResistance$/, 4);
    for (const fractureStart of [{ kind: "make" as const }, { kind: "bought" as const, price: 50 }]) {
      const spec: RecipeSpec = {
        data, base: "Gold Ring", itemLevel: 82, runs: 1, price: () => 1, fractureStart,
        targets: [{ ...life, method: "fracture" }, { ...fire, method: "exalt" }],
      };
      const run = runRecipeOnce(spec, 77_000);
      expect(run.done, run.reason).toBe(true);
      const { final } = playPlan(data, recipePlan(spec, run), {});
      expect(allMods(final).find((m) => m.fractured)?.modId).toBe(life.modId);
      expect(allMods(final).some((m) => m.modId === fire.modId)).toBe(true);
    }
  });
});

describe("フラクチャーの作り方と白のベースの値段 (2026-10-05)", () => {
  it("変成・増強ガチャ → 王者 → 高貴 / 骨の壁、狙い 2 つのどちらか固定、白の値段も数える", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 5);
    const fire = targetOf(data, "Rings", /FireResistance$/, 5);
    for (const blocker of [false, true]) {
      const spec: RecipeSpec = {
        data, base: "Gold Ring", itemLevel: 82, runs: 1, price: (k) => (k === "annul" ? 100 : 1), whiteBasePrice: 5,
        fractureStart: { kind: "make", route: "magic", blocker },
        targets: [{ ...life, method: "fracture" }, { ...fire, method: "fracture" }],
      };
      const run = runRecipeOnce(spec, 55_000);
      expect(run.done, run.reason).toBe(true);
      // 消去 (100) より白 5 + 変成 1 が安いので、マジックの外れは消去せずに買い直す
      expect(run.steps.filter((s) => s.currency === "annul" && !s.omen).length).toBeLessThanOrEqual(3);
      expect(run.cost).toBeGreaterThanOrEqual(5);
      const { final } = playPlan(data, recipePlan(spec, run), {});
      const fixed = allMods(final).find((m) => m.fractured)!;
      expect([life.modId, fire.modId]).toContain(fixed.modId);
      if (blocker) expect(run.steps.some((s) => s.currency === "desecrate")).toBe(true);
    }
  });
});

describe("流れの確かめで見つけた物 (2026-10-05)", () => {
  it("骨の壁が発現で候補の MOD になっても、冒涜の狙いが止まらない。守る物が無い側の外れは素の消去", async () => {
    const data = await loadPatch();
    const fire = targetOf(data, "Rings", /FireResistance$/, 2);
    const light = targetOf(data, "Rings", /LightningResistance$/, 2);
    const life = targetOf(data, "Rings", /IncreasedLife$/, 2);
    const chaos = targetOf(data, "Rings", /ChaosResistance$/, 2);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 40, price: (k) => (k.startsWith("Omen") ? 50 : 1), whiteBasePrice: 1, seed: 3000,
      fractureStart: { kind: "make", route: "magic", blocker: true },
      targets: [{ ...fire, method: "fracture" }, { ...light, method: "fracture" }, { ...life, method: "exalt" }, { ...chaos, method: "desecrate" }],
    };
    const r = (await runRecipe(spec))!;
    expect(r.stops.find((x) => x.reason.includes("1 つまで"))).toBeUndefined();
    expect(r.pDone).toBeGreaterThan(0.9);
  });
});

describe("どれか 1 つが当たりの手順 (2026-10-05)", () => {
  it("金の指輪: ライフ → 火 / 冷気 / 雷耐性のどれか (高貴) で完成し、どれか 1 つが付いている", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 3);
    const fire = targetOf(data, "Rings", /FireResistance$/, 2);
    const cold = targetOf(data, "Rings", /ColdResistance$/, 2);
    const light = targetOf(data, "Rings", /LightningResistance$/, 2);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 30, price: () => 1, seed: 5000,
      targets: [{ ...life, method: "exalt" }, { ...fire, method: "exalt", alts: [cold, light] }],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect([fire, cold, light].some((t) => allMods(final).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex))).toBe(true);
  });
});

describe("ソケット付きの白のベース (2026-10-05)", () => {
  it("胴 (ソケット 3 = 規格外) から作っても完成し、再生でもソケット 3 のまま", async () => {
    const data = await loadPatch();
    const base = "Warlord Cuirass";
    const life = [...data.mods.values()].find((x) => x.id.startsWith("Body_Armours_str/") && x.source === "normal" && /IncreasedLife$/.test(x.id))!;
    const spec: RecipeSpec = {
      data, base, itemLevel: 82, runs: 10, price: () => 1, seed: 9000, sockets: 3,
      targets: [{ modId: life.id, minTierIndex: life.tiers.length - 4, method: "exalt" }],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect(final.sockets).toBe(3);
  });
});

describe("どれか N つ (2026-10-05)", () => {
  it("金の指輪: 火 / 冷気 / 雷耐性のどれか 2 つ (高貴) で完成し、2 つ付いている", async () => {
    const data = await loadPatch();
    const fire = targetOf(data, "Rings", /FireResistance$/, 3);
    const cold = targetOf(data, "Rings", /ColdResistance$/, 3);
    const light = targetOf(data, "Rings", /LightningResistance$/, 3);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 30, price: () => 1, seed: 7000,
      targets: [{ ...fire, method: "exalt", alts: [cold, light], need: 2 }],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect([fire, cold, light].filter((t) => allMods(final).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("冒涜でどれか N つ (2026-10-05)", () => {
  it("金の指輪: 火 / 冷気 / 雷耐性のどれか 2 つを冒涜で: 冒涜で 1 つ、残りは高貴で 2 つ付いて完成する", async () => {
    const data = await loadPatch();
    const fire = targetOf(data, "Rings", /FireResistance$/, 3);
    const cold = targetOf(data, "Rings", /ColdResistance$/, 3);
    const light = targetOf(data, "Rings", /LightningResistance$/, 3);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 30, price: () => 1, seed: 8100,
      targets: [{ ...fire, method: "desecrate", alts: [cold, light], need: 2 }],
    };
    const r = await runRecipe(spec);
    expect(r!.stops.find((x) => /1 つまで/.test(x.reason))).toBeUndefined();
    expect(r!.pDone).toBeGreaterThan(0.8);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect([fire, cold, light].filter((t) => allMods(final).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex)).length).toBeGreaterThanOrEqual(2);
  });
});

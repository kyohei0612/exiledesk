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

describe("同じ候補のグループをコピーして並べる (2026-10-05)", () => {
  it("金の指輪: 耐性 3 つのどれか × 2 (グループを 2 つ) で、違う耐性が 2 つ付いて完成する", async () => {
    const data = await loadPatch();
    const fire = targetOf(data, "Rings", /FireResistance$/, 3);
    const cold = targetOf(data, "Rings", /ColdResistance$/, 3);
    const light = targetOf(data, "Rings", /LightningResistance$/, 3);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 30, price: () => 1, seed: 9100,
      targets: [{ ...fire, method: "exalt", alts: [cold, light] }, { ...cold, method: "exalt", alts: [fire, light] }],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect([fire, cold, light].filter((t) => allMods(final).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex)).length).toBeGreaterThanOrEqual(2);
  });
});

describe("フラクチャーの候補が両側 (2026-10-05)", () => {
  it("金の指輪: ライフ (プレ) か 火耐性 (サフィ) のどちらかを固定して完成する", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 5);
    const fire = targetOf(data, "Rings", /FireResistance$/, 5);
    const cold = targetOf(data, "Rings", /ColdResistance$/, 5);
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 20, price: () => 1, seed: 9300,
      fractureStart: { kind: "make", route: "magic", blocker: true },
      targets: [{ ...life, method: "fracture" }, { ...fire, method: "fracture" }, { ...cold, method: "exalt" }],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.8);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect([life.modId, fire.modId]).toContain(allMods(final).find((m) => m.fractured)?.modId);
  });
});

describe("ルーンの MOD を狙う (2026-10-05)", () => {
  it("手袋: コルの狩りの MOD を狙うと、コルの狩りを差した白から始めて完成し、再生でも差したまま", async () => {
    const data = await loadPatch();
    const kol = [...data.mods.values()].find((x) => x.id.startsWith("Gloves_dex/") && x.rune === "kolrs-hunt")!;
    expect(kol).toBeTruthy();
    const spec: RecipeSpec = {
      data, base: "Suede Bracers", itemLevel: 82, runs: 10, price: () => 1, seed: 7000,
      targets: [{ modId: kol.id, minTierIndex: kol.tiers.length - 1, method: "exalt" }],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect(final.sockets).toBe(1);
    expect(final.augments?.length).toBe(1);
    expect(allMods(final).some((m) => m.modId === kol.id)).toBe(true);
  });
});

describe("パターンで回す (2026-10-06)", () => {
  it("金の指輪: 固定済みのライフから、高貴で火耐性 → 冷気耐性 (外れは消去してもう一度) で完成する", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 3);
    const fire = targetOf(data, "Rings", /FireResistance$/, 3);
    const cold = targetOf(data, "Rings", /ColdResistance$/, 3);
    const fireT = { ...fire, method: "exalt" as const }, coldT = { ...cold, method: "exalt" as const };
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 30, price: () => 1, seed: 4242,
      targets: [{ ...life, method: "fracture" }, fireT, coldT],
      fractureStart: { kind: "bought", price: 10 },
      pattern: [
        { kind: "exalt", currency: "exalt", omens: ["OmenofDextralExaltation"], target: fireT, onMiss: "annul_redo" },
        { kind: "exalt", currency: "exalt", omens: ["OmenofDextralExaltation"], target: coldT, onMiss: "annul_redo" },
      ],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.5);
  });
  it("手袋: ルーンの手でコルの狩りを差してから、その MOD を高貴で狙える", async () => {
    const data = await loadPatch();
    const kol = [...data.mods.values()].find((x) => x.id.startsWith("Gloves_dex/") && x.rune === "kolrs-hunt")!;
    const t = { modId: kol.id, minTierIndex: kol.tiers.length - 1, method: "exalt" as const };
    const spec: RecipeSpec = {
      data, base: "Suede Bracers", itemLevel: 82, runs: 10, price: () => 1, seed: 777,
      targets: [t],
      pattern: [
        { kind: "rune", currency: "", omens: [], target: null, rune: "Kolr's Hunt", onMiss: "next" },
        { kind: "transmute", currency: "transmute", omens: [], target: null, onMiss: "next" },
        { kind: "regal", currency: "regal", omens: [], target: null, onMiss: "next" },
        { kind: "chaos", currency: "chaos", omens: [], target: t, onMiss: "redo" },
      ],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    expect(allMods(final).some((m) => m.modId === kol.id)).toBe(true);
  });
});

describe("自前のフラクチャーの手 (2026-10-07)", () => {
  it("金の指輪: 白から変成でライフ → 王者・高貴・骨 (壁) → フラクチャーでライフを固定。外れは最初から、固定した物は残る", async () => {
    const data = await loadPatch();
    const life = { ...targetOf(data, "Rings", /IncreasedLife$/, 4), method: "exalt" as const };
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 30, price: () => 1, seed: 99,
      targets: [life],
      pattern: [
        { kind: "transmute", currency: "transmute", omens: [], target: life, onMiss: "restart" },
        { kind: "regal", currency: "regal", omens: [], target: null, onMiss: "next" },
        { kind: "exalt", currency: "exalt", omens: [], target: null, onMiss: "next" },
        { kind: "desecrate", currency: "desecrate", omens: [], target: null, onMiss: "next" },
        { kind: "fracture", currency: "fracture", omens: [], target: life, onMiss: "restart" },
      ],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.9);
    const { final } = playPlan(data, recipePlan(spec, r!.sample!), {});
    const fixed = allMods(final).filter((m) => m.fractured);
    expect(fixed.length).toBe(1);
    expect(fixed[0]!.modId).toBe(life.modId);
    // 骨は発現させずに壁として残す (フラクチャーの候補を 3 つにする)
    expect(allMods(final).some((m) => m.unrevealed)).toBe(true);
  });
});

describe("増強で 2 つ狙う (2026-10-07)", () => {
  it("金の指輪: 変成 (ライフか火耐性) → 増強で残り。普通の消去で当たった方が消えても、マジックのまま増強をもう一度 (新しいベースにしない)", async () => {
    const data = await loadPatch();
    const life = { ...targetOf(data, "Rings", /IncreasedLife$/, 4), method: "exalt" as const };
    const fire = { ...targetOf(data, "Rings", /FireResistance$/, 4), method: "exalt" as const };
    const spec: RecipeSpec = {
      data, base: "Gold Ring", itemLevel: 82, runs: 60, price: () => 1, seed: 5,
      targets: [life, fire],
      pattern: [
        { kind: "transmute", currency: "transmute", omens: [], target: { ...life, alts: [fire], need: 1 }, onMiss: "next" },
        { kind: "augment", currency: "augment", omens: [], target: { ...life, alts: [fire], need: 2 }, onMiss: "annul_redo", miss: { kind: "annul", currency: "annul", omens: [] } },
      ],
    };
    const r = await runRecipe(spec);
    expect(r!.pDone).toBeGreaterThan(0.95);
    expect(r!.bases).toBeLessThan(1.2);
  });
});

describe("増強 + お告げ無しの消去の枝 (2026-10-07)", () => {
  it("指輪のライフ (プレ): サフィの外れは消さず、プレの外れが残った時だけ消す方が、毎回消すより消去が少ない", async () => {
    const data = await loadPatch();
    const m = data.mods.get("Rings/IncreasedLife")!;
    const life = { modId: m.id, minTierIndex: m.tiers.length - 2, method: "exalt" as const };
    const annuls = async (extra: { otherGone?: "annul"; otherJunk?: "keep" }): Promise<number> => {
      const r = await runRecipe({
        data, base: "Gold Ring", itemLevel: 82, runs: 300, price: (k: string) => (k === "annul" ? 10 : 0.01), seed: 11,
        targets: [life],
        pattern: [
          { kind: "transmute", currency: "transmute", omens: [], target: null, onMiss: "next" },
          { kind: "augment", currency: "augment", omens: [], target: life, onMiss: "annul_redo", miss: { kind: "annul", currency: "annul", omens: [] }, ...extra },
        ],
      });
      expect(r!.pDone).toBeGreaterThan(0.95);
      return r!.usage.find((u) => u.key === "annul")!.count;
    };
    const always = await annuls({});
    const owner = await annuls({ otherGone: "annul", otherJunk: "keep" });
    expect(owner).toBeLessThan(always * 0.8);
  });
});

describe("「そのまま次へ」の手 (2026-10-08 レビュー B1)", () => {
  it("金の指輪 (固定済み): 高貴で火耐性 (外れたらそのまま次へ) → 冷気耐性 (外して繰り返す)。火耐性が外れた人は戻らずに最後まで行き、揃っていなければ新しいベースで最初から", async () => {
    const data = await loadPatch();
    const life = targetOf(data, "Rings", /IncreasedLife$/, 3);
    const fireT = { ...targetOf(data, "Rings", /FireResistance$/, 3), method: "exalt" as const };
    const coldT = { ...targetOf(data, "Rings", /ColdResistance$/, 3), method: "exalt" as const };
    const r = await runRecipe({
      data, base: "Gold Ring", itemLevel: 82, runs: 60, price: () => 1, seed: 31,
      targets: [{ ...life, method: "fracture" }, fireT, coldT],
      fractureStart: { kind: "bought", price: 10 },
      pattern: [
        { kind: "exalt", currency: "exalt", omens: ["OmenofDextralExaltation"], target: fireT, onMiss: "next" },
        { kind: "exalt", currency: "exalt", omens: ["OmenofDextralExaltation"], target: coldT, onMiss: "annul_redo", miss: { kind: "annul", currency: "annul", omens: [] } },
      ],
    });
    // 2026-10-08 完成判定 2: 最後まで来て揃っていなければ、新しいベースで最初から (止まったにしない)。外れた人はベースを買い直す
    expect(r!.pDone).toBeGreaterThan(0.9);
    expect(r!.stops.some((s) => /揃っていない/.test(s.reason))).toBe(false);
    expect(r!.bases).toBeGreaterThan(1);
  });
});

describe("人ごとの乱数の種 (2026-10-07)", () => {
  it("人の間隔は 1 人の上限の手の数より広い (n 手目の乱数は seed + n なので、重なると隣の人と同じ乱数になる)", async () => {
    const { seedsOf } = await import("../src/services/craft-stage/recipe-sim");
    for (const maxSteps of [4000, 10_000, 20_000, 50_000]) {
      const s = seedsOf({ seed: 1, runs: 5, maxSteps });
      for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]!).toBeGreaterThan(maxSteps);
    }
    expect(seedsOf({ seed: 7, runs: 3, maxSteps: 4000 })).toEqual([7, 10_007, 20_007]);
  });
});

describe("状況ごとの反応 (2026-10-08 オーナー「起こりうる状況を全てに対応する選択肢を 1 個 1 個」)", () => {
  it("金の指輪: 錬金でライフが付かなかったらカオスで振り直す (錬金の手に「ハズレ → カオスでもう一度」)", async () => {
    const data = await loadPatch();
    const life = { ...targetOf(data, "Rings", /IncreasedLife$/, 4), method: "chaos" as const };
    const r = await runRecipe({
      data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 11, whiteBasePrice: 0,
      targets: [life],
      pattern: [
        { kind: "alchemy", currency: "alchemy", omens: [], target: life, onMiss: "next", on: {
          miss_t: { pre: null, then: "repeat", again: { kind: "chaos", currency: "chaos", omens: [] } },
          miss_o: { pre: null, then: "repeat", again: { kind: "chaos", currency: "chaos", omens: [] } },
          partial: { pre: null, then: "repeat", again: { kind: "chaos", currency: "chaos", omens: [] } },
        } },
      ],
    });
    expect(r!.pDone).toBeGreaterThan(0.9);
    expect(r!.usage.some((u) => u.key === "chaos" && u.count > 1)).toBe(true);
    // 白は 1 個で足りる (振り直しはカオス。新しいベースにしない)
    expect(r!.bases).toBeLessThan(1.5);
  });
});

describe("流れ (2026-10-08、Craft of Exile の Simulator と同じ形)", () => {
  it("金の指輪: 錬金 → カオスでどれか 1 つ → 偉大 + 左の完全高貴 → 外れは消去、全部消えたらカオスへ。手ごと・行き先ごとの数も返す", async () => {
    const data = await loadPatch();
    const ids = ["Rings/FireDamage", "Rings/ColdDamage", "Rings/LightningDamage"];
    const T = ids.map((id) => ({ modId: id, minTierIndex: data.mods.get(id)!.tiers.length - 4 }));
    const targets = T.map((t, i) => ({ ...t, method: "exalt" as const, alts: T.filter((_, k) => k !== i) }));
    const L = "prefix" as const;
    const r = await runRecipe({
      data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 21, whiteBasePrice: 0, maxSteps: 20_000, targets,
      flow: [
        { act: { kind: "alchemy", currency: "alchemy", omens: [] }, routes: [{ conds: [], to: 1 }], onNone: "loop" },
        { act: { kind: "chaos", currency: "chaos", omens: [] }, routes: [{ conds: [{ k: "hits", op: ">=", n: 1 }], to: 2 }], onNone: "loop" },
        { act: { kind: "exalt", currency: "exalt_perfect", omens: ["OmenofSinistralExaltation", "OmenofGreaterExaltation"] }, routes: [
          { conds: [{ k: "all" }], to: "done" },
          { conds: [{ k: "hits", op: "=", n: 0 }], to: 1 },
          { conds: [{ k: "junk", side: L, op: ">=", n: 1 }], to: 3 },
          { conds: [{ k: "free", side: L, op: ">=", n: 1 }], to: 4 },
        ], onNone: "loop" },
        { act: { kind: "annul", currency: "annul", omens: [] }, routes: [{ conds: [{ k: "hits", op: "=", n: 0 }], to: 1 }, { conds: [{ k: "free", side: L, op: ">=", n: 2 }], to: 2 }, { conds: [], to: 4 }], onNone: "loop" },
        { act: { kind: "exalt", currency: "exalt_perfect", omens: ["OmenofSinistralExaltation"] }, routes: [
          { conds: [{ k: "all" }], to: "done" },
          { conds: [{ k: "hits", op: "=", n: 0 }], to: 1 },
          { conds: [{ k: "junk", side: L, op: ">=", n: 1 }], to: 3 },
        ], onNone: "loop" },
      ],
    });
    expect(r!.pDone).toBeGreaterThan(0.5);
    expect(r!.flowAvg?.visits.length).toBe(5);
    expect(r!.flowAvg!.visits[1]).toBeGreaterThan(1);
    expect(r!.flowAvg!.routes[2]!.length).toBe(5);
  });
});

describe("結果ごとの行動 (2026-10-08 オーナー「打った結果全てにどういう行動をとるか」)", () => {
  it("金の指輪: カオスでどれか 1 つ → 偉大 + 左の完全高貴、結果の 狙い・狙い以外 ごとに 消去 (左) / 完全高貴 (左) / カオスへ戻る", async () => {
    const data = await loadPatch();
    const ids = ["Rings/FireDamage", "Rings/ColdDamage", "Rings/LightningDamage"];
    const T = ids.map((id) => ({ modId: id, minTierIndex: data.mods.get(id)!.tiers.length - 4 }));
    const group = { ...T[0]!, method: "exalt" as const, alts: T.slice(1), need: 3 };
    const one = { ...T[0]!, method: "chaos" as const, alts: T.slice(1), need: 1 };
    const g = { kind: "exalt" as const, currency: "exalt_perfect", omens: ["OmenofSinistralExaltation", "OmenofGreaterExaltation"] };
    const s1 = { kind: "exalt" as const, currency: "exalt_perfect", omens: ["OmenofSinistralExaltation"] };
    const an = { kind: "annul" as const, currency: "annul", omens: ["OmenofSinistralAnnulment"] };
    const r = await runRecipe({
      data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 5, whiteBasePrice: 0, maxSteps: 20_000,
      targets: [group],
      pattern: [
        { kind: "alchemy", currency: "alchemy", omens: [], target: null, onMiss: "next" },
        { kind: "chaos", currency: "chaos", omens: [], target: one, onMiss: "annul_redo", miss: { kind: "chaos", currency: "chaos", omens: [] } },
        { ...g, target: group, onMiss: "next", policy: {
          "2-1": { act: an }, "1-2": { act: an }, "1-1": { act: an }, "2-0": { act: s1 }, "1-0": { act: g }, "2-2": { act: an },
          "0-0": { then: "goto", goto: 1 }, "0-1": { then: "goto", goto: 1 }, "0-2": { then: "goto", goto: 1 }, "0-3": { then: "goto", goto: 1 },
        } },
      ],
    });
    expect(r!.pDone).toBeGreaterThan(0.8);
    expect(r!.usage.some((u) => u.key === "annul" && u.count > 1)).toBe(true);
  });
  it("形の表 (2026-10-09): 狙いが 0 の形は 1 MOD 残し消去 (スパムまでリセット) でカオスの手へ。新しいベースは使わない", async () => {
    const data = await loadPatch();
    const ids = ["Rings/FireDamage", "Rings/ColdDamage", "Rings/LightningDamage"];
    const T = ids.map((id) => ({ modId: id, minTierIndex: data.mods.get(id)!.tiers.length - 4 }));
    const group = { ...T[0]!, method: "exalt" as const, alts: T.slice(1), need: 3 };
    const one = { ...T[0]!, method: "chaos" as const, alts: T.slice(1), need: 1 };
    const g = { kind: "exalt" as const, currency: "exalt_perfect", omens: ["OmenofSinistralExaltation", "OmenofGreaterExaltation"] };
    const s1 = { kind: "exalt" as const, currency: "exalt_perfect", omens: ["OmenofSinistralExaltation"] };
    const an = { kind: "annul" as const, currency: "annul", omens: ["OmenofSinistralAnnulment"] };
    const r = await runRecipe({
      data, base: "Gold Ring", itemLevel: 82, runs: 40, price: () => 1, seed: 7, whiteBasePrice: 0, maxSteps: 20_000,
      targets: [group],
      pattern: [
        { kind: "alchemy", currency: "alchemy", omens: [], target: null, onMiss: "next" },
        { kind: "chaos", currency: "chaos", omens: [], target: one, onMiss: "annul_redo", miss: { kind: "chaos", currency: "chaos", omens: [] } },
        { ...g, target: group, onMiss: "next", policy: {
          "2-1": { act: an }, "1-2": { act: an }, "1-1": { act: an }, "2-0": { act: s1 }, "1-0": { act: g }, "2-2": { act: an },
          "0-0": { then: "reset", goto: 1 }, "0-1": { then: "reset", goto: 1 }, "0-2": { then: "reset", goto: 1 }, "0-3": { then: "reset", goto: 1 },
        } },
      ],
    });
    expect(r!.pDone).toBeGreaterThan(0.8);
    expect(r!.bases).toBeLessThan(1.01);
  });
});

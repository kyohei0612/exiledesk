// クイズのレシピ (ADR-003): 動画の見本が答えの無い状況に来ずに最後まで回る
// 開いている状況を見る時は QUIZ_OPEN=1 で回す
import { describe, expect, it } from "vitest";
import { loadPatch } from "../helpers/patch";
import { routeDone, routeOf, ruleFor, runQuiz, runQuizOnce, situationOf, type QuizRecipe, type QuizSlot } from "../../src/services/simulator/quiz-recipe";
import { QUIZ_SAMPLES } from "../../src/services/simulator/quiz-samples";
import { freshItem } from "../../src/services/craft-stage/run-plan";
import type { StageItem } from "../../src/services/craft-stage/types";

const data = loadPatch();
const price = (): number => 1;
const show = (it: StageItem): string => [...it.prefixes, ...it.suffixes].map((m) => `${m.side[0]} ${m.modId}${m.fractured ? " (固定)" : ""}${m.desecrated ? " (冒涜)" : ""}`).join(" | ");

describe("状況と答え", () => {
  it("中身が同じ札は区別しない・条件の配列はどれか・項目の多い答えが先", () => {
    const goal: QuizSlot[] = [
      { id: "A", side: "prefix", mods: [{ modId: "x", minTierIndex: 0 }], kind: "normal" },
      { id: "B", side: "prefix", mods: [{ modId: "x", minTierIndex: 0 }], kind: "normal" },
    ];
    const it0 = freshItem(data, "Emerald", 82);
    const sit = situationOf(it0, goal);
    expect(sit).toMatchObject({ A: 0, B: 0, r: "n", "p.n": 0, n: 0 });
    const rules = [{ when: { A: 0 }, do: { use: "a" } }, { when: { A: [0, 2], B: 0 }, do: { use: "b" } }];
    expect(ruleFor(rules, sit)?.do).toEqual({ use: "b" });
    expect(routeDone({ id: "r", goal, rules }, sit)).toBe(false);
  });
});

describe("動画の見本が最後まで回る", () => {
  for (const s of QUIZ_SAMPLES) {
    it(s.id, () => {
      const recipe = s.make();
      const res = runQuiz(data, recipe, Number(process.env.QUIZ_RUNS ?? 30), { price, seed: 11 });
      if (process.env.QUIZ_OPEN) {
        console.log(s.id, "完成", res.pDone, "平均", res.perDone.toFixed(1), JSON.stringify(res.usage.map((u) => [u.key, +u.count.toFixed(1)])));
        for (const o of res.open.slice(0, 8)) console.log("未回答", o.n, JSON.stringify(o.situation), "\n   ", show(o.item));
        for (const o of res.blocked.slice(0, 8)) console.log("打てない", o.n, o.reason, JSON.stringify(o.situation), "\n   ", show(o.item));
      }
      expect(res.open.map((o) => o.key)).toEqual([]);
      expect(res.blocked.map((o) => `${o.reason} ${o.key}`)).toEqual([]);
      expect(res.pDone).toBe(1);
      const one = runQuizOnce(data, recipe, 5, { price });
      expect(one.done).toBe(true);
    }, 120000);
  }
});

describe("両側のどれか = プレの道とサフィの道", () => {
  it("カオスでプレ (物理) かサフィ (全耐性) のどれか。付いた側の工程へ切り替わり、どちらの道でも完成する", () => {
    const X: QuizSlot = { id: "X", side: "prefix", mods: [{ modId: "Rings/PhysicalDamage", minTierIndex: 0 }], kind: "normal" };
    const Y: QuizSlot = { id: "Y", side: "suffix", mods: [{ modId: "Rings/AllResistances", minTierIndex: 0 }], kind: "normal" };
    const recipe: QuizRecipe = {
      v: 3, base: "Amethyst Ring", itemLevel: 82, start: { kind: "white", price: 1 },
      routes: [
        { id: "prefix", goal: [X], entry: ["X"], rules: [{ when: { r: "n" }, do: { use: "alchemy" } }, { when: { r: "r", X: 0 }, do: { use: "chaos" } }] },
        { id: "suffix", goal: [Y], entry: ["Y"], rules: [] },
      ],
    };
    const res = runQuiz(data, recipe, 60, { price, seed: 3 });
    expect(res.open).toEqual([]);
    expect(res.pDone).toBe(1);
    expect(res.routes.map((r) => r.id).sort()).toEqual(["prefix", "suffix"]);
    const one = runQuizOnce(data, recipe, 9, { price });
    expect(routeOf(recipe, one.item).id).toBe(one.route);
  });
});

describe("シミュレーターの入力から組む (quizFromSim)", () => {
  it("両側のどれかはプレの工程とサフィの工程に分かれ、入口の札が付く。どれか 2 つは札 2 つ", async () => {
    const { quizFromSim } = await import("../../src/services/simulator/quiz-build");
    const { recipe, error } = quizFromSim({
      data, base: "Amethyst Ring", itemLevel: 82, start: "white", startPrice: 2,
      targets: [
        { modId: "Rings/PhysicalDamage", minTierIndex: 0, method: "chaos", alts: [{ modId: "Rings/AllResistances", minTierIndex: 0 }] },
        { modId: "Rings/IncreasedLife", minTierIndex: 0, method: "exalt", alts: [{ modId: "Rings/IncreasedMana", minTierIndex: 0 }], need: 2 },
      ],
    }, { v: 3, rules: { suffix: [{ when: { r: "n" }, do: { use: "alchemy" } }] } });
    expect(error).toBeNull();
    expect(recipe.routes.map((r) => [r.id, r.entry, r.goal.map((g) => `${g.id}${g.side[0]}`).join(",")])).toEqual([
      ["prefix", ["A"], "Bp,Cp,Ap"],
      ["suffix", ["A"], "Bp,Cp,As"],
    ]);
    expect(recipe.routes[1]!.rules).toHaveLength(1);
    expect(recipe.start).toEqual({ kind: "white", price: 2 });
  });
});

describe("マジックを買う始め方", () => {
  it("狙う MOD (普通の付け方) の最初のプレ 1 つ・サフィ 1 つが下限の段で付いたマジックから始まる", async () => {
    const { quizFromSim } = await import("../../src/services/simulator/quiz-build");
    const S = "Spears/";
    const { recipe } = quizFromSim({
      data, base: "Steelhead Spear", itemLevel: 82, start: "magic", startPrice: 5,
      targets: [
        { modId: S + "LocalPhysicalDamagePercent", minTierIndex: 5, method: "exalt" },
        { modId: S + "Essence_PhysicalDamage", minTierIndex: 0, method: "essence" },
        { modId: S + "GlobalIncreaseMeleeSkillGemLevel", minTierIndex: 2, method: "exalt" },
        { modId: S + "LocalIncreasedPhysicalDamagePercentAndAccuracyRating", minTierIndex: 0, method: "desecrate" },
      ],
    }, { v: 3, rules: { main: [
      { when: { r: "m", A: 2, C: 2 }, do: { use: "essence:greater:" + S + "Essence_PhysicalDamage" } },
      { when: { r: "r", A: 2, B: 2, C: 2, D: 0, "p.hid": 0, "p.bad": 0, "p.n": 2 }, do: { use: "desecrate", omens: ["OmenofSinistralNecromancy"] } },
      { when: { "p.hid": 1 }, do: { reveal: { echoes: true } } },
      { when: { "p.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } },
    ] } });
    expect(recipe.start).toMatchObject({ kind: "bought", rarity: "magic", price: 5, mods: [{ mod: S + "LocalPhysicalDamagePercent", tier: "T3" }, { mod: S + "GlobalIncreaseMeleeSkillGemLevel", tier: "T2" }] });
    const res = runQuiz(data, recipe, 40, { price, seed: 5 });
    expect(res.open.map((o) => o.key)).toEqual([]);
    expect(res.pDone).toBe(1);
  });
});

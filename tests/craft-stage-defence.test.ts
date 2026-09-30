/**
 * 防御の仕組みの計算 (要望 ㉒-B): 式は PoB の CalcDefence.lua と同じか、ゲームの説明文の決まり (混沌は ES 2 倍、出血は ES 素通り、ES は 4 秒後に 12.5%/秒)
 */
import { describe, expect, it } from "vitest";
import { armourReduction, attackRow, DEF, deflectChance, esTimeline, evadeChance, hitChance, layersOf } from "../src/services/craft-stage/defence";

describe("数字の表", () => {
  it("ゲームの定数を読めている", () => {
    expect(DEF.constants).toMatchObject({ evadeCap: 95, deflectPct: 40, esDelay: 4, esRatePct: 12.5, shockPct: 20, armourRatio: 10, armourCap: 90 });
    expect(DEF.monsterAccuracy.length).toBeGreaterThan(80);
    expect(DEF.bases.find((b) => b.en === "Warlord Cuirass")).toMatchObject({ slot: "body", ar: 496, ev: 0, es: 0 });
  });
});

describe("式", () => {
  it("当てる率は PoB と同じ (回避 0 なら 100%、上限は 95% 回避)", () => {
    expect(hitChance(0, 500)).toBe(100);
    expect(hitChance(1000, 250)).toBe(Math.round((1 - 950 / 2000) * 100));
    expect(evadeChance(1e9, 1)).toBe(95);
  });
  it("受け流し: 0 なら 0、上限 95", () => {
    expect(deflectChance(0, 300)).toBe(0);
    expect(deflectChance(1e9, 1)).toBe(95);
  });
  it("アーマー: 一撃の 10 倍のアーマーで 50%、上限 90%", () => {
    expect(armourReduction(1000, 100)).toBeCloseTo(50);
    expect(armourReduction(1e9, 1)).toBe(90);
  });
});

describe("減っていく順番", () => {
  const d = { life: 1000, es: 200, armour: 1000, evasion: 500, deflection: 300, block: 20, resist: 90 };
  it("元素: 耐性は上限 75%、アーマーは効かない、ES → ライフ", () => {
    const l = layersOf(d, 400, "fire", 300, "hit", false);
    const by = Object.fromEntries(l.map((x) => [x.key, x]));
    expect(by.resist!.after).toBeCloseTo(100);
    expect(by.armour!.skipped).toBe(true);
    expect(by.es!.after).toBe(0);
  });
  it("混沌は ES を 2 倍削る", () => {
    const l = layersOf({ ...d, resist: 0 }, 150, "chaos", 300, "hit", false);
    const es = l.find((x) => x.key === "es")!;
    expect(es.after).toBeCloseTo(50);
  });
  it("回避で止まる。赤い技は回避もブロックも飛ばし、受け流しは効く", () => {
    expect(layersOf(d, 400, "physical", 300, "evade", false).find((x) => x.key === "evade")!.stopped).toBe(true);
    const red = layersOf(d, 400, "physical", 300, "deflect", true);
    expect(red.find((x) => x.key === "evade")!.skipped).toBe(true);
    expect(red.find((x) => x.key === "block")!.skipped).toBe(true);
    expect(red.find((x) => x.key === "deflect")!.after).toBeCloseTo(240);
  });
});

describe("攻撃の並びと ES の流れ", () => {
  it("確率の通りの回数を並べる (乱数なし)", () => {
    const r = attackRow(10, 40, 50, false);
    expect(r.filter((x) => x === "evade").length).toBe(4);
    expect(r.filter((x) => x === "deflect").length).toBe(3);
    expect(attackRow(10, 40, 50, false)).toEqual(r);
    expect(attackRow(10, 40, 50, true).filter((x) => x === "evade").length).toBe(0);
  });
  it("ES は 4 秒後から 12.5%/秒で戻る。出血は ES を素通り", () => {
    const p = esTimeline(1000, 400, 100, [0], "phys", 8, 0.5);
    expect(p.find((x) => x.t === 3.5)!.es).toBe(300);
    expect(p.find((x) => x.t === 6)!.es).toBeCloseTo(400);
    const b = esTimeline(1000, 400, 100, [0], "bleed", 2, 0.5);
    expect(b[0]).toMatchObject({ es: 400, life: 900 });
    const c = esTimeline(1000, 400, 100, [0], "chaos", 1, 0.5);
    expect(c[0]!.es).toBe(200);
  });
});

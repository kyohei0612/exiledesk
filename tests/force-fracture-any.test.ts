// 手で付ける「フラクチャー」(f) は、未発現の冒涜以外どの MOD でも固定で付けられる (2026-10-10 要望「創生の樹 (冒涜も) フラクチャーできるように」、オーナー確認の決まり)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { allMods } from "../src/services/craft-stage/stage-core";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const rare = (): StageItem => {
  const m = applyCurrency(data, freshItem(data, "Gold Ring", 82), "transmute", mulberry32(1)).item;
  return applyCurrency(data, m, "regal", mulberry32(2)).item;
};
const fix = (it: StageItem, id: string) => applyCurrency(data, it, `force:${id}||f`, mulberry32(3));

describe("手で固定して付ける (f)", () => {
  it("創生の樹の MOD", () => {
    const r = fix(rare(), "Rings/Special_genesis_tree_caster_SpellDamage");
    expect(r.applied, r.reason).toBe(true);
    const m = allMods(r.item).find((x) => x.modId === "Rings/Special_genesis_tree_caster_SpellDamage")!;
    expect(m.fractured).toBe(true);
  });
  it("冒涜の MOD は冒涜の印も付く (冒涜は 1 つまで)", () => {
    const r = fix(rare(), "Rings/Desecrated_Strength");
    expect(r.applied, r.reason).toBe(true);
    const m = allMods(r.item).find((x) => x.modId === "Rings/Desecrated_Strength")!;
    expect({ f: m.fractured, d: m.desecrated }).toEqual({ f: true, d: true });
  });
  it("エッセンスの MOD はクラフトの印も付く", () => {
    const r = fix(rare(), "Rings/Essence_FireResistance");
    expect(r.applied, r.reason).toBe(true);
    const m = allMods(r.item).find((x) => x.modId === "Rings/Essence_FireResistance")!;
    expect({ f: m.fractured, c: m.crafted }).toEqual({ f: true, c: true });
  });
  it("フラクチャーは 1 つまで", () => {
    const r = fix(rare(), "Rings/Special_genesis_tree_caster_SpellDamage");
    expect(fix(r.item, "Rings/Desecrated_Strength").applied).toBe(false);
  });
});

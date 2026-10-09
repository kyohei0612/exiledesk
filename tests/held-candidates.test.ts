// 持っているカレンシーで次に付く候補 (addCandidates、2026-10-09): 確率表が持った物・お告げ・触媒で変わる
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { addCandidates, applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const shareOf = (cs: ReturnType<typeof addCandidates>, id: string): number => {
  if (!cs) return 0;
  const total = cs.reduce((a, c) => a + c.w, 0);
  return (cs.find((c) => c.mod.id === id)?.w ?? 0) / total;
};

describe("持っているカレンシーで次に付く候補", () => {
  const ring0 = freshItem(data, "Gold Ring", 82);
  const rare: StageItem = applyCurrency(data, ring0, "alchemy", mulberry32(5)).item;

  it("白の指輪: 変成は候補あり、高貴・増強は MOD を足せないので null", () => {
    expect(addCandidates(data, ring0, "transmute", [])?.length).toBeGreaterThan(0);
    expect(addCandidates(data, ring0, "exalt", [])).toBeNull();
    expect(addCandidates(data, ring0, "augment", [])).toBeNull();
  });
  it("完全の変成は強さの下限より下の段を候補にしない (上級・完全で付かない段がある)", () => {
    const base = addCandidates(data, ring0, "transmute", [])!;
    const perfect = addCandidates(data, ring0, "transmute_perfect", [])!;
    const tiers = (cs: typeof base) => cs.reduce((a, c) => a + c.tiers.length, 0);
    expect(tiers(perfect)).toBeLessThan(tiers(base));
  });
  it("左側の高貴なお告げを掛けた高貴はプレだけ", () => {
    const cs = addCandidates(data, rare, "exalt", ["OmenofSinistralExaltation"])!;
    expect(cs.length).toBeGreaterThan(0);
    expect(cs.every((c) => c.side === "prefix")).toBe(true);
  });
  it("触媒: マナの品質があると、触媒の高貴のお告げで最大マナの確率が上がり、ほかは下がる (お告げ無しは品質で変わらない)", () => {
    // プレを空にして、最大マナが必ず候補に入るように
    const open: StageItem = { ...rare, prefixes: [] };
    const withQ: StageItem = { ...open, quality: 20, qualityTag: "mana" };
    const mana = "Rings/IncreasedMana";
    const plain = shareOf(addCandidates(data, withQ, "exalt", []), mana);
    const noQuality = shareOf(addCandidates(data, open, "exalt", []), mana);
    const boosted = shareOf(addCandidates(data, withQ, "exalt", ["OmenofCatalysingExaltation"]), mana);
    expect(plain).toBeCloseTo(noQuality, 6);
    expect(plain).toBeGreaterThan(0);
    expect(boosted).toBeGreaterThan(plain * 1.5);
  });
});

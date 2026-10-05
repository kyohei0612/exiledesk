// 最低 MOD レベル (上級・完全・古代の骨) の決まり (2026-10-06 POE2Tube 要望 ㉝ の 2 / 3、用語集 BetterCurrencyMinimumLevel)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { candidates } from "../src/services/craft-stage/stage-core";
import { modTierWeight } from "../src/vendor/poe2htc/engine/pool";
import { mulberry32 } from "../src/services/htc/rng";

describe("最低 MOD レベル", () => {
  it("下限より上の段が無い系統も一番上の段だけ残る (系統が丸ごと消えない)", async () => {
    const data = await loadPatch();
    const ring = freshItem(data, "Gold Ring", 82);
    const all = candidates(data, ring, ["prefix", "suffix"], 0);
    const hi = candidates(data, ring, ["prefix", "suffix"], 70);
    expect(hi.length).toBe(all.length);
    for (const c of hi) {
      const tops = c.mod.tiers.filter((t) => t.ilvl <= 82 && t.weight > 0);
      if (tops.every((t) => t.ilvl < 70)) {
        expect(c.tiers.length).toBe(1);
        expect(c.mod.tiers[c.tiers[0]!.index]!.ilvl).toBe(Math.max(...tops.map((t) => t.ilvl)));
        expect(modTierWeight(c.mod, 70, 82)).toBe(c.tiers[0]!.w);
      }
    }
  });
  it("アイテムレベルが下限より低い品には使えない (上級カオスはレアの MOD を減らさない)", async () => {
    const data = await loadPatch();
    let it = freshItem(data, "Gold Ring", 30);
    it = applyCurrency(data, it, "alchemy", mulberry32(5)).item;
    const r = applyCurrency(data, it, "chaos_greater", mulberry32(6));
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("35 未満");
  });
});

describe("エッセンスの段は普通の MOD の段 (要望 ㉝ の 4)", () => {
  it("肉体のグレーターエッセンス (アミュレット) = ライフの T3 Rotund", async () => {
    const data = await loadPatch();
    let it = freshItem(data, "Gold Amulet", 82);
    it = applyCurrency(data, it, "transmute", mulberry32(1)).item;
    // 付いた MOD と側がぶつからないよう、マジックの MOD を消してから
    it = { ...it, prefixes: [], suffixes: [] };
    const r = applyCurrency(data, it, "essence:greater:Amulets/Essence_IncreasedLife", mulberry32(2));
    expect(r.applied).toBe(true);
    expect(r.added[0]!.tierName).toBe("T3");
    expect(r.added[0]!.affix).toBe("Rotund");
  });
});

describe("ユニーク・抽出・小数 (要望 ㉝ の 6 / 13 / 10)", () => {
  it("古代のお告げでユニークになったらそのユニークのベースになる", async () => {
    const { uniqueBaseOf } = await import("../src/services/craft-stage/stage-bases");
    const data = await loadPatch();
    for (let s = 1; s < 40; s++) {
      const r = applyCurrency(data, freshItem(data, "Sapphire Ring", 82), "chance", mulberry32(s), ["OmenoftheAncients"], { outcome: "unique" });
      expect(r.applied).toBe(true);
      const want = uniqueBaseOf(r.item.unique!.en);
      if (want) expect(r.item.base).toBe(want);
    }
  });
  it("抽出のオーブはソケットバウンドでないオーグメントを取り戻す", async () => {
    const data = await loadPatch();
    let it = { ...freshItem(data, "Warlord Cuirass", 82), sockets: 2 };
    it = applyCurrency(data, it, "rune:Greater Iron Rune", mulberry32(1)).item;
    expect(it.augments?.length).toBe(1);
    const r = applyCurrency(data, it, "extraction", mulberry32(2));
    expect(r.item.destroyed).toBe(true);
    expect(r.returned?.map((a) => a.en)).toEqual(["Greater Iron Rune"]);
  });
});

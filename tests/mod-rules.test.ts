/**
 * MOD の決まり (系統・重み・出やすさ) は services/mods/mod-rules.ts に 1 つ。
 * 計算機・クラフトステージ・MOD の一覧が同じ答えを出すことを押さえる (2026-09-29 統一)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { essenceClash, familyBlocked, familyKeysOf, fillShares, rawFamiliesOf, tierWeight } from "../src/services/mods/mod-rules";
import { excluded, modTierWeight } from "../src/vendor/poe2htc/engine/pool";
import { CRAFTED_SOURCES } from "../src/vendor/poe2htc/engine/pool";

const data = loadPatch();
const all = [...data.mods.values()];

describe("系統", () => {
  it("2 つの系統にまたがる MOD は、どちらの系統が付いていても弾かれる", () => {
    const multi = all.find((m) => (m.families?.length ?? 0) >= 2)!;
    expect(multi).toBeTruthy();
    for (const f of multi.families!) expect(familyBlocked(multi, new Set([f]))).toBe(true);
  });
  it("エッセンスの MOD は普通の MOD と同じ系統でも並ぶ (抽選)。エッセンス同士はぶつかる", () => {
    const ess = all.find((m) => CRAFTED_SOURCES.has(m.source) && m.family)!;
    const normal = all.find((m) => m.source === "normal" && m.family === ess.family);
    if (normal) {
      expect(familyBlocked(ess, new Set(familyKeysOf(normal)))).toBe(false);
      expect(familyBlocked(normal, new Set(familyKeysOf(ess)))).toBe(false);
    }
    expect(familyBlocked(ess, new Set(familyKeysOf(ess)))).toBe(true);
  });
  it("エッセンスを打つ時は生の系統で見る (同じ系統が付いていれば打てない)", () => {
    const ess = all.find((m) => CRAFTED_SOURCES.has(m.source) && m.family)!;
    expect(essenceClash(ess, new Set(rawFamiliesOf(ess)))).toBe(true);
    expect(essenceClash(ess, new Set(["存在しない系統"]))).toBe(false);
  });
  it("判定はエンジンの excluded と全部同じ", () => {
    const taken = new Set(all.slice(0, 40).flatMap(familyKeysOf));
    for (const m of all) expect(familyBlocked(m, taken)).toBe(excluded(m, taken));
  });
});

describe("重みと出やすさ", () => {
  it("段の重みはエンジンの modTierWeight と同じ", () => {
    for (const m of all.slice(0, 300)) {
      expect(tierWeight(m, 0, 82)).toBe(modTierWeight(m, 0, 82, 0));
      expect(tierWeight(m, 1, 60, 40)).toBe(modTierWeight(m, 40, 60, 1));
    }
  });
  it("出やすさは同じ側・同じ種類の合計で割る。分母は絞る前の全部", () => {
    const base = [
      { side: "P", group: "normal", weight: 300 }, { side: "P", group: "normal", weight: 100 },
      { side: "S", group: "normal", weight: 50 }, { side: "P", group: "essence", weight: 0 },
    ];
    const rows = [{ ...base[1]!, share: 0 }, { ...base[3]!, share: 0 }];
    fillShares(rows, base);
    expect(rows[0]!.share).toBeCloseTo(0.25);
    expect(rows[1]!.share).toBe(0);
  });
});

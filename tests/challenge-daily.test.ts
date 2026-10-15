// 今日のお題: お題と乱数が日付で決まる・沼カウンターの数え方 (src/services/challenge, 2026-10-16)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { CHALLENGE_ILVL, dailyChallenge, stepSeedOf } from "../src/services/challenge/daily";
import { countSwamp, swampTotal } from "../src/services/challenge/swamp";
import type { PlayedStep } from "../src/services/craft-stage/run-plan";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 9, 16 + i)).toISOString().slice(0, 10));

describe("お題は日付で決まる", () => {
  it("同じ日は何度作っても同じ", () => {
    for (const d of days.slice(0, 4)) expect(JSON.stringify(dailyChallenge(data, d))).toBe(JSON.stringify(dailyChallenge(data, d)));
  });
  it("日が変わるとお題も変わる (2 週間で何種類も出る)", () => {
    const keys = new Set(days.map((d) => { const c = dailyChallenge(data, d); return `${c.base}|${c.targets.map((t) => t.modId).join(",")}`; }));
    expect(keys.size).toBeGreaterThan(10);
    expect(new Set(days.map((d) => dailyChallenge(data, d).seed)).size).toBe(days.length);
  });
  it("狙いはプレ 1・サフィ 1 (+ もう 1 つ)、段の下限はこのアイテムレベルで付く段", () => {
    for (const d of days) {
      const c = dailyChallenge(data, d);
      expect(c.itemLevel).toBe(CHALLENGE_ILVL);
      expect(c.targets.length).toBeGreaterThanOrEqual(2);
      expect(c.targets.length).toBeLessThanOrEqual(3);
      expect(c.targets.some((t) => t.side === "prefix")).toBe(true);
      expect(c.targets.some((t) => t.side === "suffix")).toBe(true);
      expect(new Set(c.targets.map((t) => t.modId)).size).toBe(c.targets.length);
      for (const t of c.targets) {
        const tier = data.mods.get(t.modId)!.tiers[t.minTierIndex]!;
        expect(tier.ilvl).toBeLessThanOrEqual(CHALLENGE_ILVL);
        expect(t.rank).toBe(`T${data.mods.get(t.modId)!.tiers.length - t.minTierIndex}`);
      }
    }
  });
  it("n 手目の乱数は種と手目だけで決まる", () => {
    const s = dailyChallenge(data, days[0]!).seed;
    expect(stepSeedOf(s, 3)).toBe(stepSeedOf(s, 3));
    expect(new Set(Array.from({ length: 50 }, (_, n) => stepSeedOf(s, n))).size).toBe(50);
    expect(stepSeedOf(s, 0)).not.toBe(stepSeedOf(s + 1, 0));
  });
});

describe("沼カウンター", () => {
  const T = [{ modId: "A", minTierIndex: 2 }, { modId: "B", minTierIndex: 0 }];
  const it2 = (mods: Array<[string, number]>): StageItem => ({ prefixes: mods.map(([modId, tierIndex]) => ({ modId, tierIndex })), suffixes: [] }) as unknown as StageItem;
  const step = (currency: string, before: StageItem, after: StageItem, omen: string | null = null, applied = true): PlayedStep =>
    ({ out: { currency, omen, applied }, before, after, added: [], removed: [] }) as unknown as PlayedStep;
  it("進まなかったカオス・削減・狙いを外した消去・振り出しを数える", () => {
    const none = it2([]), a = it2([["A", 3]]), aLow = it2([["A", 1]]), ab = it2([["A", 2], ["B", 0]]);
    const log = [
      step("chaos", none, aLow), // 下限より弱い = 進まない
      step("chaos_greater", aLow, a), // 進んだ
      step("chaos", a, a, "OmenofWhittling"), // 削減沼
      step("annul", ab, a), // 狙いが外れた = 消去沼
      step("annul", it2([["A", 3], ["X", 0]]), a), // 狙い以外を外した = 沼ではない
      step("chaos", a, a, null, false), // 打てなかった手は数えない
    ];
    const s = countSwamp(log, T, 2);
    expect(s).toEqual({ chaos: 1, whittle: 1, annul: 1, resets: 2 });
    expect(swampTotal(s)).toBe(5);
  });
});

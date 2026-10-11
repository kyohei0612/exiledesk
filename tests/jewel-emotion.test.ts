// ジュエルの液化した感情 (デリリウム、2026-10-11)。決まりは apply-emotion.ts の頭の注
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods } from "../src/services/craft-stage/stage-core";
import { emotionKeysFor } from "../src/services/craft-stage/apply-emotion";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const A = (it: StageItem, k: string, s = 1): StageItem => { const r = applyCurrency(data, it, k, mulberry32(s), []); if (!r.applied) throw new Error(`${k}: ${r.reason}`); return r.item; };
const rare = (base: string): StageItem => A(A(A(freshItem(data, base, 82), "transmute", 2), "regal", 3), "exalt", 4);

describe("液化した感情", () => {
  it("ジュエルごとに使える物が違う (獰猛・侮蔑のプレ / サフィ 2 版の物はまだ出さない)", () => {
    expect(emotionKeysFor(rare("Ruby"))).toHaveLength(11);
    expect(emotionKeysFor(rare("Time-Lost Ruby")).every((k) => k.startsWith("emotion:Ancient "))).toBe(true);
    expect(emotionKeysFor(rare("Diamond"))).toEqual(["emotion:Concentrated Liquid Isolation"]);
    expect(emotionKeysFor(freshItem(data, "Gold Ring", 82))).toEqual([]);
  });
  it("1 つ消して決まった作った MOD を付ける、作った MOD は 1 つまで、レアだけ、古代は時を失ったジュエルだけ", () => {
    const r = rare("Ruby");
    const a = applyCurrency(data, r, "emotion:Diluted Liquid Ire", mulberry32(5), []);
    expect(a.applied).toBe(true);
    expect(a.added?.[0]?.crafted).toBe(true);
    expect(a.added?.[0]?.modId).toBe("Jewels_str/Emotion_JewelArmour");
    expect(a.removed?.length).toBeGreaterThanOrEqual(1);
    const b = A(a.item, "emotion:Liquid Envy", 6);
    expect(allMods(b).filter((m) => m.crafted)).toHaveLength(1);
    expect(applyCurrency(data, A(freshItem(data, "Ruby", 82), "transmute", 1), "emotion:Liquid Envy", mulberry32(1), []).applied).toBe(false);
    expect(applyCurrency(data, r, "emotion:Ancient Liquid Envy", mulberry32(1), []).applied).toBe(false);
    expect(applyCurrency(data, rare("Time-Lost Ruby"), "emotion:Ancient Liquid Envy", mulberry32(1), []).applied).toBe(true);
  });
  it("固定 (フラクチャー) した MOD は消さない", () => {
    let r = rare("Ruby");
    for (let i = 0; i < 4 && allMods(r).length < 4; i++) r = A(r, "exalt", 20 + i);
    r = A(r, "fracture", 8);
    const fixed = allMods(r).find((m) => m.fractured)!;
    for (let s = 1; s <= 40; s++) {
      const x = applyCurrency(data, r, "emotion:Liquid Disgust", mulberry32(s), []);
      if (x.applied) expect(x.removed?.some((m) => m.modId === fixed.modId)).toBe(false);
    }
  });
});

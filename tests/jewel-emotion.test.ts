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
  it("ジュエルごとに使える物が違う", () => {
    expect(emotionKeysFor(rare("Ruby"))).toHaveLength(13);
    expect(emotionKeysFor(rare("Time-Lost Ruby")).every((k) => k.startsWith("emotion:Ancient "))).toBe(true);
    expect(emotionKeysFor(rare("Diamond"))).toEqual(["emotion:Concentrated Liquid Isolation", "emotion:Potent Liquid Ferocity", "emotion:Potent Liquid Contempt"]);
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
  it("参考動画の流れ (サファイア 2/2 → 侮蔑 → 頭蓋骨 → 左の消去で侮蔑を外す → 高貴 → カオスはプレだけ → 獰猛はプレに当たってサフィの効果)", () => {
    let base = A(A(freshItem(data, "Sapphire", 82), "transmute", 2), "regal", 3);
    for (let i = 0; i < 6 && allMods(base).length < 4; i++) base = A(base, "exalt", 30 + i);
    expect([base.prefixes.length, base.suffixes.length]).toEqual([2, 2]);
    // 侮蔑は消えた側の版: 2/2 なら半々
    let pre = 0, suf = 0, hit: StageItem | null = null;
    for (let s = 1; s <= 400; s++) {
      const r = applyCurrency(data, base, "emotion:Potent Liquid Contempt", mulberry32(s), []);
      expect(r.applied).toBe(true);
      const a = r.added![0]!;
      expect(a.side).toBe(r.removed![0]!.side);
      if (a.side === "prefix") { pre++; hit ??= r.item; } else suf++;
    }
    expect(Math.abs(pre / 400 - 0.5)).toBeLessThan(0.08);
    // 「サフィックス +1 個まで」(プレ) が付いた: サフィは 3 つまで、頭蓋骨はサフィに入る
    let it = hit!;
    const d = A(it, "desecrate", 40);
    expect(d.suffixes.length).toBe(3);
    it = A(d, "reveal:1", 41);
    // 左の消去のお告げで侮蔑 (プレ) を消す: サフィ 3 つは残る (上限を超えた状態)
    const contempt = it.prefixes.find((m) => m.modId.endsWith("AdditionalSuffixAllowed"))!;
    let after = it;
    for (let s = 1; s <= 30 && after.prefixes.some((m) => m === contempt); s++) { const r = applyCurrency(data, it, "annul", mulberry32(s), ["OmenofSinistralAnnulment"]); if (r.removed?.[0]?.modId === contempt.modId) after = r.item; }
    expect(after.suffixes.length).toBe(3);
    expect(after.prefixes.length).toBe(1);
    it = A(after, "exalt", 50);
    expect(it.prefixes.length).toBe(2);
    // カオスはサフィに当たると弾かれる = 変わるのはプレだけ
    for (let s = 1; s <= 60; s++) {
      const r = applyCurrency(data, it, "chaos", mulberry32(s), []);
      if (r.applied) { expect(r.removed![0]!.side).toBe("prefix"); expect(r.item.suffixes.length).toBe(3); }
    }
    // 獰猛: サフィは弾かれるので、付くのはプレの版 (サフィの効果が増加)
    for (let s = 1; s <= 60; s++) {
      const r = applyCurrency(data, it, "emotion:Potent Liquid Ferocity", mulberry32(s), []);
      if (r.applied) { expect(r.added![0]!.side).toBe("prefix"); expect(r.added![0]!.textEn).toMatch(/Effect of Suffixes/); }
    }
  });
});

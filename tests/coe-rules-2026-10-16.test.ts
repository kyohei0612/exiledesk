/**
 * Craft of Exile に合わせた決まり (2026-10-16、docs/reviews/2026-10-16-coe-rule-check.md の 1・2・5・10)。
 * 期待値は CoE beta の package_poe2.js (写し data-cache/coe-beta-package_poe2.js):
 *   1. poe2_desecrate: 両側が空いていれば randomNumber(0,2) で半々
 *   2. poe2_desecrate: 空きが無ければ annul() (固定以外の全部から等しく 1 つ) → 空いた側に付く
 *   5. getRemovableModifiers: 光のお告げ (OmenOnAnnulRemoveAbyssMod) と左右の消去は一緒に効く
 *   10. exaltedParams: 1 + 0.2 × 品質、20% を超えた分は 1% ごとに +0.12
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods, room } from "../src/services/craft-stage/stage-core";
import { catalysingMultiplier } from "../src/services/htc/catalysing-multiplier";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const ring = freshItem(data, "Gold Ring", 82);
/** 錬金で作ったレアのうち、条件に合う物を 1 つ */
function rareWhere(ok: (it: StageItem) => boolean): StageItem {
  for (let s = 1; s < 500; s++) {
    const it = applyCurrency(data, ring, "alchemy", mulberry32(s)).item;
    if (ok(it)) return it;
  }
  throw new Error("見つからない");
}
/** 高貴で枠いっぱいにする */
function full(it: StageItem): StageItem {
  let cur = it;
  for (let s = 1; s < 50 && (room(cur, "prefix") || room(cur, "suffix")); s++) cur = applyCurrency(data, cur, "exalt", mulberry32(1000 + s)).item;
  return cur;
}

describe("Craft of Exile に合わせた決まり (2026-10-16)", () => {
  it("1. 両側が空いている時、骨はプレ / サフィに半々", () => {
    const it = rareWhere((x) => room(x, "prefix") && room(x, "suffix"));
    let pre = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const r = applyCurrency(data, it, "desecrate", mulberry32(s));
      expect(r.applied).toBe(true);
      if (r.added[0]!.side === "prefix") pre++;
    }
    expect(Math.abs(pre / N - 0.5)).toBeLessThan(0.03);
  });

  it("2. 両側が埋まったレアの骨は、固定以外の全部から等しく 1 つ消して、その側に付く", () => {
    const it = full(rareWhere(() => true));
    expect(room(it, "prefix") || room(it, "suffix")).toBe(false);
    const mods = allMods(it);
    const hits = new Map<string, number>();
    const N = 6000;
    for (let s = 0; s < N; s++) {
      const r = applyCurrency(data, it, "desecrate", mulberry32(s));
      expect(r.applied).toBe(true);
      const gone = r.removed[0]!;
      expect(r.added[0]!.side).toBe(gone.side);
      hits.set(gone.modId, (hits.get(gone.modId) ?? 0) + 1);
    }
    for (const m of mods) expect(Math.abs((hits.get(m.modId) ?? 0) / N - 1 / mods.length)).toBeLessThan(0.03);
  });

  it("5. 光のお告げと左右の消去は一緒に効く (冒涜の MOD のうち、その側だけ)", () => {
    const it = rareWhere((x) => room(x, "suffix"));
    const bone = applyCurrency(data, it, "desecrate", mulberry32(1), ["OmenofDextralNecromancy"]);
    expect(bone.added[0]!.side).toBe("suffix");
    const left = applyCurrency(data, bone.item, "annul", mulberry32(2), ["OmenofLight", "OmenofSinistralAnnulment"]);
    expect(left.applied).toBe(false);
    const right = applyCurrency(data, bone.item, "annul", mulberry32(2), ["OmenofLight", "OmenofDextralAnnulment"]);
    expect(right.applied).toBe(true);
    expect(right.removed[0]!.desecrated).toBe(true);
    expect(right.omensUsed).toEqual(expect.arrayContaining(["OmenofLight", "OmenofDextralAnnulment"]));
  });

  it("10. 触媒の高貴の倍率は 1 + 0.2 × 品質、20% を超えた分は 1% ごとに +0.12", () => {
    expect(catalysingMultiplier(0)).toBe(1);
    expect(catalysingMultiplier(10)).toBeCloseTo(3);
    expect(catalysingMultiplier(20)).toBeCloseTo(5);
    expect(catalysingMultiplier(40)).toBeCloseTo(7.4);
  });
});

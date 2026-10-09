// 発現の候補 3 つのうち冒涜専用 MOD の個数 (2026-10-09、Reddit の 563 回の実測: 0 個 0% / 1 個 85% / 2 個 14% / 3 個 1%)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";

const data = loadPatch();

describe("冒涜の発現の候補", () => {
  for (const base of ["Gold Ring", "Volatile Wand"]) {
    it(`${base}: 専用は必ず 1 つ以上、ほとんど 1 つ`, () => {
      let it0 = freshItem(data, base, 82);
      it0 = applyCurrency(data, it0, "transmute", mulberry32(1)).item;
      it0 = applyCurrency(data, it0, "regal", mulberry32(2)).item;
      const counts = [0, 0, 0, 0];
      const N = 2000;
      for (let s = 1; s <= N; s++) {
        const b = applyCurrency(data, it0, "desecrate", mulberry32(s));
        expect(b.applied).toBe(true);
        const o = revealOffers(data, b.item, mulberry32(s + 99991)).first;
        expect(o.length).toBe(3);
        expect(new Set(o.map((m) => m.modId)).size).toBe(3);
        counts[o.filter((m) => data.mods.get(m.modId)?.source === "desecrated").length]!++;
      }
      expect(counts[0]).toBe(0);
      expect(counts[1]! / N).toBeGreaterThan(0.8);
      expect(counts[1]! / N).toBeLessThan(0.9);
      expect(counts[2]! / N).toBeGreaterThan(0.1);
    });
  }
});

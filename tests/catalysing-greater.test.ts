// 触媒の高貴 + 大いなる高貴: 足す 2 つとも品質の種類の MOD を重く引く (2026-10-09 オーナー「どっちとも効く、効かせて」)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import { boostedBy } from "../src/services/htc/quality";

const data = loadPatch();

describe("触媒の高貴のお告げ + 大いなる高貴のお告げ", () => {
  it("2 つ目に足した MOD もライフの系統が増える", () => {
    let it0 = freshItem(data, "Gold Ring", 82);
    it0 = applyCurrency(data, it0, "transmute", mulberry32(3)).item;
    it0 = applyCurrency(data, it0, "regal", mulberry32(4)).item;
    it0 = applyCurrency(data, it0, "catalyst_life", mulberry32(5)).item;
    expect(it0.quality).toBeGreaterThan(0);
    const lifeRate = (omens: string[]) => {
      let hit = 0, n = 0;
      for (let s = 1; s <= 400; s++) {
        const r = applyCurrency(data, it0, "exalt", mulberry32(s), omens);
        const second = r.added?.[1];
        if (!second) continue;
        n++;
        if (boostedBy(data.mods.get(second.modId)!, "life")) hit++;
      }
      return hit / n;
    };
    const plain = lifeRate(["OmenofGreaterExaltation"]);
    const boosted = lifeRate(["OmenofGreaterExaltation", "OmenofCatalysingExaltation"]);
    expect(boosted).toBeGreaterThan(plain * 1.5);
  });
});

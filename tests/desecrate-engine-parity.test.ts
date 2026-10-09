// 計算機のエンジン (desecrationOfferProbability) とエミュレーター (骨 + 発現) が同じ確率を出す (2026-10-09 オーナー「参照してるエンジンは 1 つ」)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import { desecrationOfferProbability } from "../src/vendor/poe2htc/engine/probability";
import type { ItemState } from "../src/vendor/poe2htc/engine/types";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const toEngine = (it: StageItem): ItemState => ({
  base: it.cls, level: it.itemLevel, rarity: "rare",
  prefixes: it.prefixes.map((m) => ({ modId: m.modId, tierName: m.tierName })),
  suffixes: it.suffixes.map((m) => ({ modId: m.modId, tierName: m.tierName })),
});

describe("冒涜の候補に出る確率: 計算機 = エミュレーター", () => {
  let it0 = freshItem(data, "Gold Ring", 82);
  it0 = applyCurrency(data, it0, "transmute", mulberry32(1)).item;
  it0 = applyCurrency(data, it0, "regal", mulberry32(2)).item;
  const taken = new Set([...it0.prefixes, ...it0.suffixes].map((m) => m.family));
  const pick = (source: string) => {
    const p = data.bases.get(it0.cls.id ?? "Rings")!.pools;
    const ids = source === "normal" ? [...p.normal.prefixes, ...p.normal.suffixes] : [...p.desecrated.prefixes, ...p.desecrated.suffixes];
    return ids.map((id) => data.mods.get(id)!).find((m) => !taken.has(m.family) && m.tiers.some((t) => t.ilvl <= 82 && t.weight > 0) && (source !== "normal" || m.tiers.every((t) => t.weight >= 500)))!;
  };
  for (const source of ["normal", "desecrated"]) {
    it(`${source} の MOD`, () => {
      const target = pick(source);
      expect(target).toBeTruthy();
      const engine = desecrationOfferProbability(data, toEngine(it0), target.id);
      let hit = 0;
      const N = 6000;
      for (let s = 1; s <= N; s++) {
        const b = applyCurrency(data, it0, "desecrate", mulberry32(s));
        const o = revealOffers(data, b.item, mulberry32(s + 77777)).first;
        if (o.some((m) => m.modId === target.id)) hit++;
      }
      const emu = hit / N;
      expect(engine).toBeGreaterThan(0);
      expect(Math.abs(engine - emu)).toBeLessThan(Math.max(0.015, engine * 0.15));
    });
  }
});

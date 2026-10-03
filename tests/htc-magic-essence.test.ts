/**
 * 計算機: 白のベース → 変成 → 普通のエッセンス で最初の狙いを確定 (2026-10-03、防具・武器への拡張 その 2)
 * 普通のエッセンスの段は中くらい (グレーターの体 = ライフ 85-99 = レベル 46 の段) なので、狙いの段を下げた時だけ使える
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { itemBaseFor } from "../src/services/htc/bridge";
import { simulateTree, type SimState } from "../src/services/htc/sim-route";
import { autoTree, magicEssenceFor } from "../src/views/htc-craft/tree-auto";
import type { Prices } from "../src/vendor/poe2htc/optimizer/cost";

const data = loadPatch();
const cls = itemBaseFor(data, "Luxurious Slippers")!;
const LIFE = "Boots_int/IncreasedLife", FIRE = "Boots_int/FireResistance";
const lifeT3 = data.mods.get(LIFE)!.tiers.findIndex((t) => t.ilvl === 46);
const prices = {
  currency: { divine: 100, transmute: 0.01, exalt: 0.01, exalt_perfect: 4, annul: 0.1, chaos: 0.02, desecrate: 0.05, desecrate_ancient: 1, "essence:greater:Boots_int/Essence_IncreasedLife": 0.5, "essence:normal:Boots_int/Essence_IncreasedLife": 0.1 },
  omens: { OmenofSinistralExaltation: 1, OmenofDextralExaltation: 1, OmenofSinistralAnnulment: 10, OmenofDextralAnnulment: 8, OmenofSinistralNecromancy: 0.5, OmenofDextralNecromancy: 0.5, OmenofLight: 7, OmenofAbyssalEchoes: 1 },
} as unknown as Prices;
const inp = (life: number) => ({ data, prices, targets: [{ modId: LIFE, minTierIndex: life }, { modId: FIRE, minTierIndex: 0 }], fixedIds: [], qualityTag: null, limits: { prefix: 3, suffix: 3 }, startCount: { prefix: 0, suffix: 0 }, startLoose: { prefix: 0, suffix: 0 }, chaosOk: false });

describe("変成 → 普通のエッセンス", () => {
  it("ライフを T3 以上にすると、グレーターの体で届く (T1 は届かない)", () => {
    expect(magicEssenceFor(inp(lifeT3) as never, cls, 82)).toEqual({ modId: LIFE, key: "essence:greater:Boots_int/Essence_IncreasedLife" });
    expect(magicEssenceFor(inp(data.mods.get(LIFE)!.tiers.length - 1) as never, cls, 82)).toBeNull();
  });
  it("最初の手になり、回すと完成する (ライフは確定、火耐性は高貴で)", () => {
    const me = magicEssenceFor(inp(lifeT3) as never, cls, 82)!;
    const nodes = autoTree({ ...inp(lifeT3), magicEssence: me } as never);
    expect(nodes[0]!.action).toMatchObject({ kind: "magicEssence", modId: LIFE });
    const start: SimState = { breach: false, slots: [] };
    const r = simulateTree({ ctx: { data, cls, prices, itemLevel: 82, limits: { prefix: 3, suffix: 3 }, catalystOk: () => false }, start, nodes, runs: 300 });
    expect(r.pDone).toBeGreaterThan(0.9);
  });
});

/**
 * 計算機: 白のベースから (2026-10-04 オーナー「変成・増強 (パーフェクト) 打ってからダメなら消去スパム」「1 つ揃えば王者」)。
 * 変成 → 増強 → 外れなら消去して増強 → 狙いが 1 つ付いたら王者のオーブでレアに → 本線
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { itemBaseFor } from "../src/services/htc/bridge";
import { simulateTree, type SimState } from "../src/services/htc/sim-route";
import { autoTree } from "../src/views/htc-craft/tree-auto";
import type { Prices } from "../src/vendor/poe2htc/optimizer/cost";

const data = loadPatch();
const cls = itemBaseFor(data, "Barbed Bracers")!;
const LIFE = "Gloves_dex/IncreasedLife";
const prices = { currency: { divine: 1000, exalt: 1, annul: 1, transmute_perfect: 5, augment_perfect: 5, regal: 1, transmute_greater: 2, augment_greater: 2 }, omens: {} } as unknown as Prices;
const ctx = { data, cls, prices, itemLevel: 82, limits: { prefix: 3, suffix: 3 }, catalystOk: () => false };
const start: SimState = { breach: false, slots: [] };

describe("白のベースから", () => {
  it("変成 → 増強 → 消去 → 王者 の 4 手が先頭に来て、ライフが付くまで回る", () => {
    const tg = [{ modId: LIFE, minTierIndex: 0 }];
    const nodes = autoTree({ data, prices, targets: tg, fixedIds: [], qualityTag: null, limits: { prefix: 3, suffix: 3 }, startCount: { prefix: 0, suffix: 0 }, startLoose: { prefix: 0, suffix: 0 }, chaosOk: false, magicSpam: { tier: "perfect", targets: tg } } as never);
    expect(nodes.slice(0, 4).map((n) => n.action?.kind)).toEqual(["transmute", "augment", "annul", "regal"]);
    const r = simulateTree({ ctx, start, nodes, runs: 500 });
    expect(r.pDone).toBeGreaterThan(0.95);
    expect(r.perDone).toBeGreaterThan(5);
  });
});

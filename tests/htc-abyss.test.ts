/**
 * 計算機: 深淵の印の輪 (2026-10-03、SaVeQ 0.5.5 / poe2fun。オーナー「4649」で段の下限 33 = 仮で入れる)
 *
 * 結晶化 + 深淵のエッセンスで印 → 普通の骨で冒涜 (印を置き換え、段の下限 33) → 外れはその側のエッセンス / 合金で上書き → また印。
 * 光のお告げも消去も要らない。印と上書きでクラフト MOD 2 つ = アストリッドの創造性が要る。防具・武器だけ
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { itemBaseFor } from "../src/services/htc/bridge";
import { simulateTree, type SimNode, type SimState } from "../src/services/htc/sim-route";
import { autoTree } from "../src/views/htc-craft/tree-auto";
import { ABYSS_MARK_FLOOR } from "../src/services/htc/omens";
import type { Prices } from "../src/vendor/poe2htc/optimizer/cost";

const data = loadPatch();
const cls = itemBaseFor(data, "Bangled Sandals")!;
const MS = "Boots_int/MovementVelocity";
const OW = "Boots_int/PerfectEssence_LocalRunicWardPercent";
const prices = {
  currency: { divine: 1000, desecrate: 1, desecrate_ancient: 5, annul: 1, exalt: 1, [`essence:perfect:${OW}`]: 2, "essence:perfect:Boots_int/PerfectEssence_EssenceAbyss": 3 },
  omens: { OmenofSinistralCrystallisation: 1, OmenofSinistralNecromancy: 1, OmenofLight: 5, OmenofAbyssalEchoes: 1 },
} as unknown as Prices;
/** サフィ 3 つ固定 (耐性など、ここでは外れの固定)、プレは空 */
const start: SimState = { breach: false, slots: [0, 1, 2].map(() => ({ modId: null, side: "suffix" as const, fixed: true })) };
const loop: SimNode[] = [
  { id: "a", action: { kind: "abyss", side: "prefix" }, targets: [], keep: [], clean: false, onHit: "d", onMiss: null },
  { id: "d", action: { kind: "desecrate", side: "prefix", bone: "desecrate", echoes: false }, targets: [{ modId: MS, minTier: 0 }], keep: [], clean: false, onHit: "done", onMiss: "o" },
  { id: "o", action: { kind: "essence", modId: OW, removeSide: "prefix" }, targets: [], keep: [], clean: false, onHit: "a", onMiss: null },
];
const ctxOf = (craftedLimit: number) => ({ data, cls, prices, itemLevel: 82, limits: { prefix: 3, suffix: 3 }, catalystOk: () => false, craftedLimit });

describe("深淵の印の輪", () => {
  it("段の下限は 33 (仮)", () => expect(ABYSS_MARK_FLOOR).toBe(33));
  it("アストリッド (クラフト MOD 2 つ) なら回り切る", () => {
    const r = simulateTree({ ctx: ctxOf(2), start, nodes: loop, runs: 400 });
    expect(r.pDone).toBe(1);
  });
  it("アストリッド無し (1 つ) では、上書きの後に印が付けられず止まる", () => {
    const r = simulateTree({ ctx: ctxOf(1), start, nodes: loop, runs: 400 });
    expect(r.pDone).toBeLessThan(1);
  });
  it("自動で組む: 靴 + アストリッド + reroll abyss なら印の手が入る、装飾品・アストリッド無しでは入らない", () => {
    const base = { data, prices, targets: [{ modId: MS, minTierIndex: 0 }], fixedIds: [], qualityTag: null, limits: { prefix: 3, suffix: 3 }, fixedSides: ["suffix" as const], startCount: { prefix: 0, suffix: 3 }, startLoose: { prefix: 0, suffix: 0 }, chaosOk: false };
    const kinds = (x: object) => autoTree({ ...base, ...x } as never).map((n) => n.action?.kind);
    expect(kinds({ reroll: "abyss", craftedLimit: 2 })).toContain("abyss");
    expect(kinds({ reroll: "abyss", craftedLimit: 1 })).not.toContain("abyss");
    expect(kinds({ craftedLimit: 2 })).not.toContain("abyss");
  });
});

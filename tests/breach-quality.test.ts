// 品質 40% の指輪の作り方 (2026-10-10 オーナー): ブリーチのエッセンスで「品質の最大値 +20%」→ 触媒で 40% → カオス・消去でエッセンスの MOD を消しても 40% のまま
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { applyForce, forceKey } from "../src/services/craft-stage/apply-force";
import { allMods, maxQualityOf } from "../src/services/craft-stage/stage-core";

const data = loadPatch();
it("最大品質の MOD を消しても品質は残る", () => {
  let it0 = startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: [{ mod: "Rings/FireResistance" }] } as never, 1);
  const f = applyForce(data, it0, forceKey("Rings/PerfectEssence_LocalMaximumQuality", null, "e"), () => 0.5);
  expect(f.applied, f.reason).toBe(true);
  it0 = f.item;
  expect(maxQualityOf(it0)).toBe(40);
  it0 = applyCurrency(data, it0, "catalyst_fire", () => 0.5).item;
  expect(it0.quality).toBe(40);
  it0 = applyForce(data, it0, forceKey("Rings/PerfectEssence_LocalMaximumQuality", null, "x"), () => 0.5).item;
  expect(allMods(it0).some((m) => m.modId === "Rings/PerfectEssence_LocalMaximumQuality")).toBe(false);
  expect(it0.quality).toBe(40);
});

// 耐性のフラックスはクライアントの Expedition2ElementalModConversions どおり (2026-10-10 要望):
// 虚無フラックスで T3 火耐性 (Lv 60) → T2 混沌耐性 (Lv 68)、冒涜専用の雷 & 混沌耐性 → T1 混沌耐性 (Lv 81、アイテムレベル 75 でも)
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods } from "../src/services/craft-stage/stage-core";

const data = loadPatch();
it("虚無フラックス: 段は表どおり", () => {
  const item = startFrom(data, "Champion Cuirass", 75, { rarity: "rare", mods: [
    { mod: "Body_Armours_str/FireResistance", tier: "T3" },
    { mod: "Body_Armours_str/Desecrated_LightningAndChaosDamageResistance", desecrated: true },
  ] } as never, 1);
  const r = applyCurrency(data, item, "flux_chaos", () => 0.5);
  expect(r.applied, r.reason).toBe(true);
  const chaos = allMods(r.item).filter((m) => m.modId === "Body_Armours_str/ChaosResistance").map((m) => m.tierName).sort();
  expect(chaos).toEqual(["T1", "T2"]);
});
it("火炎フラックス: 冷気耐性は同じ行の火耐性に", () => {
  const item = startFrom(data, "Champion Cuirass", 82, { rarity: "rare", mods: [{ mod: "Body_Armours_str/ColdResistance", tier: "T3" }] } as never, 1);
  const r = applyCurrency(data, item, "flux_fire", () => 0.5);
  expect(r.applied, r.reason).toBe(true);
  expect(allMods(r.item).map((m) => `${m.modId} ${m.tierName}`)).toContain("Body_Armours_str/FireResistance T3");
});

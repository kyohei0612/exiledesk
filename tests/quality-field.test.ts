// 品質の欄 (qset): 宝飾品は種類も決められ、選んだ種類の MOD が伸びる。「最大」は足し算、手では上も選べる (2026-10-10)
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyCurrency, qualityFieldMax } from "../src/services/craft-stage/apply-currency";
import { applyForce, forceKey } from "../src/services/craft-stage/apply-force";
import { allMods, boostedMod } from "../src/services/craft-stage/stage-core";

const data = loadPatch();
it("キャスターの品質 34% でスペルスキルのレベル +3 → +4 (20% なら 3.6 の切り捨てで +3)", () => {
  let it0 = startFrom(data, "Gold Amulet", 82, { rarity: "rare", mods: [{ mod: "Amulets/GlobalIncreaseSpellSkillGemLevel", tier: "T1" }] } as never, 1);
  it0 = applyCurrency(data, it0, "qset:34:caster", () => 0.5).item;
  expect({ q: it0.quality, tag: it0.qualityTag }).toEqual({ q: 34, tag: "caster" });
  const m = allMods(it0)[0]!;
  expect(m.values[0]).toBe(3);
  expect(boostedMod(it0, m, data)?.values[0]).toBe(4);
  expect(boostedMod({ ...it0, quality: 20 }, m, data)).toBeNull();
});
it("「最大」は足し算 (ベース 20 + 品質の最大値の MOD + インフューザー 10)。手では実在する上限 (宝飾品 75 / ほか 30) まで", () => {
  const ring = startFrom(data, "Gold Ring", 82, {} as never, 1);
  expect(qualityFieldMax(ring)).toBe(30);
  const withEss = applyForce(data, { ...ring, rarity: "rare" }, forceKey("Rings/PerfectEssence_LocalMaximumQuality", null, "e"), () => 0.5).item;
  expect(qualityFieldMax(withEss)).toBe(50);
  expect(qualityFieldMax(startFrom(data, "Heavy Belt", 82, {} as never, 1))).toBe(20);
  expect(applyCurrency(data, ring, "qset:60:caster", () => 0.5).item.quality).toBe(60);
  // 手の上限はゲームに実在する値まで (宝飾品 75、ほか 30)
  expect(applyCurrency(data, ring, "qset:300", () => 0.5).item.quality).toBe(75);
  expect(applyCurrency(data, startFrom(data, "Champion Cuirass", 82, {} as never, 1), "qset:300", () => 0.5).item.quality).toBe(30);
});

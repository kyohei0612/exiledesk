// 品質の欄 (qset): 宝飾品は種類も決められ、選んだ種類の MOD が伸びる。上限は宝飾品 50% / ほか 30% (取引所で実物を確認、2026-10-10)
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods, boostedMod } from "../src/services/craft-stage/stage-core";

const data = loadPatch();
it("キャスターの品質 34% でスペルスキルのレベル +3 → +4", () => {
  let it0 = startFrom(data, "Gold Amulet", 82, { rarity: "rare", mods: [{ mod: "Amulets/GlobalIncreaseSpellSkillGemLevel", tier: "T1" }] } as never, 1);
  it0 = applyCurrency(data, it0, "qset:34:caster", () => 0.5).item;
  expect({ q: it0.quality, tag: it0.qualityTag }).toEqual({ q: 34, tag: "caster" });
  const m = allMods(it0)[0]!;
  expect(m.values[0]).toBe(3);
  expect(boostedMod(it0, m, data)?.values[0]).toBe(4);
});
it("上限: 宝飾品 50、防具 30", () => {
  const amu = startFrom(data, "Gold Amulet", 82, {} as never, 1);
  expect(applyCurrency(data, amu, "qset:80:caster", () => 0.5).item.quality).toBe(50);
  const arm = startFrom(data, "Champion Cuirass", 82, {} as never, 1);
  expect(applyCurrency(data, arm, "qset:80", () => 0.5).item.quality).toBe(30);
});

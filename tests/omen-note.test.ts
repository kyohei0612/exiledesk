// お告げの「今は意味なし / 打てない」(2026-10-10 オーナー「空きに勝手に入るから意味ないこと教えてあげた方がいい」)
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { omenNote } from "../src/services/craft-stage/omens";

const data = loadPatch();
const ring = (mods: string[], quality = 0) => ({ ...startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: mods.map((mod) => ({ mod })) } as never, 1), quality });

it("プレ 1 / サフィ 3 (サフィ満杯)", () => {
  const it = ring(["Rings/FireDamage", "Rings/Intelligence", "Rings/LifeRegeneration", "Rings/ChaosResistance"]);
  expect(omenNote("OmenofDextralExaltation", it)).toBe("サフィ満杯で打てない");
  expect(omenNote("OmenofSinistralExaltation", it)).toBe("今は意味なし");
  expect(omenNote("OmenofDextralNecromancy", it)).toBe("サフィ満杯で打てない");
  expect(omenNote("OmenofDextralAnnulment", it)).toBeNull();
  expect(omenNote("OmenofCatalysingExaltation", it)).toBe("品質が要る");
});
it("サフィだけ 1 つ空き (冒涜の右のネクロマンシーは意味なし)", () => {
  const it = ring(["Rings/FireDamage", "Rings/IncreasedLife", "Rings/IncreasedMana", "Rings/Intelligence", "Rings/ChaosResistance"]);
  expect(omenNote("OmenofDextralNecromancy", it)).toBe("今は意味なし");
  expect(omenNote("OmenofGreaterExaltation", it)).toBe("1 つしか付かない");
});
it("プレ 0 の時の左の消去は消せる物が無い、右の消去は意味なし", () => {
  const it = ring(["Rings/Intelligence", "Rings/ChaosResistance"]);
  expect(omenNote("OmenofSinistralAnnulment", it)).toBe("消せる物が無い");
  expect(omenNote("OmenofDextralAnnulment", it)).toBe("今は意味なし");
});

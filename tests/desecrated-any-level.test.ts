// 冒涜専用の MOD はアイテムレベルを見ない (段は全部 Lv 65 だが、アクト 2 の装備に保存された肋骨で T1 が出る。2026-10-10 要望 + reddit の動画)。
// 噛み切られた骨 (アイテムレベル 64 以下だけ) はアイテムレベルの決まりのまま = 出ない (2026-10-10 オーナー)
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { mulberry32 } from "../src/services/htc/rng";

const data = loadPatch();
const item = startFrom(data, "Champion Cuirass", 45, { rarity: "rare", mods: [{ mod: "Body_Armours_str/StunThreshold" }, { mod: "Body_Armours_str/LightningResistance" }] } as never, 1);
const exclusiveSeen = (bone: string): boolean => {
  for (let s = 1; s <= 60; s++) {
    const r = applyCurrency(data, item, bone, mulberry32(s));
    expect(r.applied, r.reason).toBe(true);
    if (revealOffers(data, r.item, mulberry32(s + 1000)).first.some((m) => data.mods.get(m.modId)?.source === "desecrated")) return true;
  }
  return false;
};

it("保存された骨: アイテムレベル 45 でも冒涜専用の MOD が候補に出る", () => {
  expect(exclusiveSeen("desecrate")).toBe(true);
});
it("噛み切られた骨: アイテムレベル 45 では冒涜専用の MOD は出ない", () => {
  expect(exclusiveSeen("desecrate_gnawed")).toBe(false);
});

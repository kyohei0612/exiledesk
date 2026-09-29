/**
 * クラフトステージの PoB (要望 ⑰-3 / ⑰-5): PoB の出力 → 結果 JSON の形 (内訳)、アイテム → PoB の文面 (ルーンの行)
 * PoB そのものは cargo の stage_pob で回すのでここでは呼ばない
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import { pobConfigOf, pobItemText, pobSlotOf, pobStatOf } from "../src/services/craft-stage/stage-pob";

const data = loadPatch();

describe("PoB の形", () => {
  it("DPS を 1 発の種類ごとの平均の割合で分ける", () => {
    const s = pobStatOf({ TotalDPS: 100, "MainHand.PhysicalHitAverage": 10, "MainHand.ColdHitAverage": 30, CritChance: 7, Speed: 1.5 });
    expect(s.breakdown).toMatchObject({ physical: 25, cold: 75, fire: 0 });
    expect(s.crit_chance).toBe(7);
  });
  it("ルーンは Rune: と {rune} の行、装備の枠は部位から", () => {
    let it = freshItem(data, "Crescent Quarterstaff", 22);
    it = applyCurrency(data, it, "artificer", mulberry32(1)).item;
    it = applyCurrency(data, it, "rune:Lesser Desert Rune", mulberry32(1)).item;
    const t = pobItemText(it)!;
    expect(t).toContain("Sockets: S");
    expect(t).toContain("Rune: Lesser Desert Rune");
    expect(t).toContain("{rune}Adds 4 to 6 Fire Damage");
    expect(pobSlotOf(it.cls.category)).toBe("Weapon 1");
  });
  it("設定の既定は PoB と同じ (Pinnacle / -60%)、指定は上書き", () => {
    expect(pobConfigOf({ class: "Monk", level: 20, skill: "Ice Strike" }).config).toMatchObject({ enemyIsBoss: "Pinnacle", resistancePenalty: -60 });
    expect(pobConfigOf({ class: "Monk", level: 20, skill: "Ice Strike", config: { resistancePenalty: -20, enemyIsBoss: "None" } }).ja).toBe("普通の敵・アクト 3 (-20%) のペナルティ");
  });
});

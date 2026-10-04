/** 傑作のルーン (POE2Tube 要望 ㉘ 2026-10-04): はまっているティアのあるルーンを 1 段上げる。使い切り */
import { describe, expect, it } from "vitest";
import { applyRune, upgradedRuneOf } from "../src/services/craft-stage/stage-runes";

const item = (augments: Array<{ en: string; ja: string }>) => ({
  cls: { category: "Body_Armours", id: "Body_Armours_str" }, rarity: "rare", sockets: 2, mods: [], quality: 0,
  augments: augments.map((a) => ({ key: `rune:${a.en}`, en: a.en, ja: a.ja, cat: "", textJa: "", textEn: "", stats: [] })),
}) as never;

describe("傑作のルーン", () => {
  it("グレーター → パーフェクト", () => {
    expect(upgradedRuneOf("Greater Desert Rune")).toBe("Perfect Desert Rune");
    expect(upgradedRuneOf("Perfect Desert Rune")).toBeNull();
    expect(upgradedRuneOf("Lesser Desert Rune")).toBe("Desert Rune");
  });
  it("1 番目のソケットのルーンを上げ、結果に upgraded", () => {
    const r = applyRune(item([{ en: "Greater Desert Rune", ja: "砂漠のグレータールーン" }]), "rune:Masterwork Rune@1");
    expect(r.applied).toBe(true);
    expect((r.item as { augments: Array<{ en: string }> }).augments[0]!.en).toBe("Perfect Desert Rune");
    expect(r.augment?.upgraded).toBe(true);
  });
  it("パーフェクトや空のソケットには打てない (理由つき)", () => {
    expect(applyRune(item([{ en: "Perfect Desert Rune", ja: "砂漠のパーフェクトルーン" }]), "rune:Masterwork Rune@1").reason).toContain("パーフェクト");
    expect(applyRune(item([{ en: "Greater Desert Rune", ja: "x" }]), "rune:Masterwork Rune@2").reason).toContain("空");
  });
});

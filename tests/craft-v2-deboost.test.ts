/**
 * 上位プレイヤー MOD 一覧: 装飾品のカタリストで底上げされた数値を素の値に戻す (services/craft-v2/deboost.ts、2026-09-29)
 * 数値は quality.ts の実物の検算 (マナのカタリスト 20%: 最大マナ +218 → 素 181.7、スピリットは mana タグ無しで素のまま) から
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { deboostMods } from "../src/services/craft-v2/deboost";

const data = loadPatch();
const manaQ20 = [{ name: "[Quality] ([Mana|Mana] Modifiers)", values: [["+20%", 1]] }];

describe("カタリストの割り戻し", () => {
  it("そのカタリストのタグを持つ MOD だけ ÷ (1 + 品質)", () => {
    const out = deboostMods("Gold Ring", manaQ20, ["+218 to maximum Mana", "+30 to [Strength|Strength]"], data);
    // 整数の表示は「切り捨てて同じ表示になる一番小さい整数」に戻す (182 × 1.2 = 218.4 → 218)。前は割っただけの 181.7
    expect(out[0]).toBe("+182 to maximum Mana");
    expect(out[1]).toBe("+30 to [Strength|Strength]");
  });
  it("宝飾品のスキルレベル: 品質 34% の +4 は素 3 (T1)、33% の +3 も素 3", async () => {
    const { rawValue } = await import("../src/services/htc/quality");
    expect(rawValue(4, 34)).toBe(3);
    expect(rawValue(3, 33)).toBe(3);
    expect(rawValue(9, 20)).toBe(8);
  });
  it("種類の無い品質 (旧キャッシュ) と防具は戻さない", () => {
    expect(deboostMods("Gold Ring", [{ name: "[Quality]", values: [["+20%", 1]] }], ["+218 to maximum Mana"], data)).toEqual(["+218 to maximum Mana"]);
    expect(deboostMods("Leather Cap", manaQ20, ["+60 to maximum Mana"], data)).toEqual(["+60 to maximum Mana"]);
  });
  it("注記付きの文面は注記を残して数値だけ置き換える", () => {
    const out = deboostMods("Gold Ring", [{ name: "[Quality] ([Attack] Modifiers)", values: [["+20%", 1]] }], ["Adds 24 to 42 [Cold] damage to [Attack|Attacks]"], data);
    expect(out[0]).toMatch(/^Adds 20 to 35 \[Cold\] damage to \[Attack\|Attacks\]$/);
  });
});

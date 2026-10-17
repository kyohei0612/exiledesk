// ワンド・スタッフの品質 = 付与スキルの品質 (skill-quality.ts、2026-10-17)。期待値は poe2db のスキルの「Additional Effects From Quality」
import { beforeAll, expect, it } from "vitest";
import { loadGemHover } from "../src/services/gem-hover";
import { skillQualityOf } from "../src/services/craft-stage/skill-quality";

beforeAll(async () => { await loadGemHover("ja"); });

it("カオスボルト (枯れたワンド): 品質 20% で投射物スピード 40%、10% で 20%", () => {
  expect(skillQualityOf("Withered Wand", "Wands", 20)[0]!.lines.join()).toContain("40%");
  expect(skillQualityOf("Withered Wand", "Wands", 10)[0]!.lines.join()).toContain("20%");
});
it("マナドレイン (調律されたワンド): 品質 20% でマナ 90", () => {
  expect(skillQualityOf("Attuned Wand", "Wands", 20)[0]!.lines.join()).toContain("90");
});
it("品質 0・マーシャル武器・セプターは出さない", () => {
  expect(skillQualityOf("Withered Wand", "Wands", 0)).toEqual([]);
  expect(skillQualityOf("Hardwood Spear", "Spears", 20)).toEqual([]);
  expect(skillQualityOf("Shrine Sceptre", "Sceptres", 20)).toEqual([]);
});
it("秒は小数: デコンポーズ (アクリッドワンド) の雲 +1 秒は品質 6% で +0.3 秒", () => {
  expect(skillQualityOf("Acrid Wand", "Wands", 6)[0]!.lines.join()).toContain("0.3秒");
});

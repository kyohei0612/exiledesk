/**
 * クラフト計算機の貼り付け (日本語クライアントの Ctrl+C)。scripts/check-htc-paste.mjs の中心をテストに移した物
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { parseJaItem, targetsFor } from "../src/services/htc/paste";

// オーナーの実物 (イージスクォータースタッフ、2026-09-22)
const TEXT = [
  "アイテムクラス: クォータースタッフ",
  "レアリティ: レア",
  "亀裂のあるポスト",
  "イージスクォータースタッフ",
  "--------",
  "品質: +20%",
  "物理ダメージ: 70-116",
  "クリティカルヒット率: 10.00%",
  "秒間アタック回数: 1.40",
  "--------",
  "アイテムレベル: 83",
  "--------",
  "ブロック率 +17%",
  "--------",
  "150から221の火ダメージを追加する",
  "6から342の雷ダメージを追加する",
  "全ての近接スキルのレベル +5",
  "倒した敵1体ごとに77のライフを獲得する",
  "この武器でキリングヒット時に20%の確率で猛攻を獲得する",
  "アタックスキルによる元素ダメージが128%増加する",
].join("\n");

describe("日本語の貼り付けを読む", () => {
  const item = parseJaItem(TEXT);
  it("ベース・アイテムレベル・品質", () => {
    expect(item.baseType).toBe("Aegis Quarterstaff");
    expect(item.itemLevel).toBe(83);
    expect(item.quality).toBe(20);
  });
  it("6 つの MOD が全部引けて、全部 T1", () => {
    const data = loadPatch();
    const { targets, implicits } = targetsFor(data, item);
    const want: Record<string, string> = {
      "Quarterstaves/LocalFireDamage": "Carbonising",
      "Quarterstaves/LocalLightningDamage": "Vapourising",
      "Quarterstaves/GlobalIncreaseMeleeSkillGemLevelWeapon": "of War",
      "Quarterstaves/LifeGainedFromEnemyDeath": "of Legend",
      "Quarterstaves/PerfectEssence_Onslaught": "Perfect Essence of Haste",
      "Quarterstaves/IncreasedWeaponElementalDamagePercent": "Devastating",
    };
    expect(targets.length).toBe(6);
    for (const [id, tier] of Object.entries(want)) {
      const t = targets.find((x) => x.modId === id);
      expect(t, id).toBeDefined();
      expect(String(data.mods.get(id)!.tiers[t!.minTierIndex]!.name)).toBe(tier);
    }
    // 暗黙 (ブロック率) は目標に混ぜない。混ぜると冒涜の AdditionalBlock に当たって範囲外なのに通っていた
    expect(implicits).toContain("ブロック率 +17%");
    expect(targets.some((t) => t.modId.includes("AdditionalBlock"))).toBe(false);
  });
});

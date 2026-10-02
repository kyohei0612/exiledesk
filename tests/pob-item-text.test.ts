import { describe, expect, it } from "vitest";
import { linesToJa, rareNameEn, rareNameJa, toPobItem } from "../src/services/pob-check/item-text";

const NL = String.fromCharCode(10);

// オーナーの実物 (イージスクォータースタッフ、2026-09-22。scripts/check-htc-paste.mjs と同じ)
const STAFF = [
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
].join(NL);

describe("火力チェック: 日本語のアイテム → PoB の文面", () => {
  it("レアの武器を英語にする (暗黙と明示を分ける)", async () => {
    const it = await toPobItem(STAFF);
    expect(it.base).toBe("Aegis Quarterstaff");
    expect(it.unread).toEqual([]);
    const lines = it.text.split(NL);
    expect(lines.slice(0, 6)).toEqual(["Rarity: Rare", "Rift Post", "Aegis Quarterstaff", "Item Level: 83", "Quality: 20", "Implicits: 1"]);
    expect(lines).toContain("Adds 150 to 221 Fire Damage");
    expect(lines).toContain("Adds 6 to 342 Lightning Damage");
    expect(lines).toContain("+5 to Level of all Melee Skills");
    expect(lines).toContain("128% increased Elemental Damage with Attacks");
    expect(it.lines.filter((l) => l.kind === "implicit").map((l) => l.ja)).toEqual(["ブロック率 +17%"]);
  });

  it("英語のコピーはそのまま", async () => {
    const en = ["Item Class: Rings", "Rarity: Rare", "Doom Loop", "Ruby Ring", "--------", "Item Level: 80", "--------", "+30% to Fire Resistance"].join(NL);
    const it = await toPobItem(en);
    expect(it.english).toBe(true);
    expect(it.text).toBe(en);
    expect(it.base).toBe("Ruby Ring");
  });

  it("PoB の英語の行を日本語で出す", async () => {
    const ja = await linesToJa(["Adds 150 to 221 Fire Damage", "+5 to Level of all Melee Skills", "+17% Chance to Block", "no such line"]);
    expect(ja).toEqual(["150から221の火ダメージを追加する", "全ての近接スキルのレベル +5", "ブロック率 +17%", "no such line"]);
  });

  it("レアの名前 (Words の前の言葉 + 後ろの言葉)", () => {
    expect(rareNameJa("Vengeance Spur")).toBe("復讐の拍車");
    expect(rareNameJa("Brood Gorget")).toBe("思案する喉当て");
    expect(rareNameEn("亀裂のあるポスト")).toBe("Rift Post");
  });

  // 日本語クライアントでも行末の注記は英語 (Exiled Exchange 2 の Parser: " (implicit)" " (rune)" などは言語共通)
  it("注記つき (implicit / rune) の日本語の行", async () => {
    const text = [
      "アイテムクラス: 兜",
      "レアリティ: レア",
      "復讐の拍車",
      "ルーンマスターの装甲帽子",
      "--------",
      "アイテムレベル: 80",
      "--------",
      "最大ライフ +30 (rune)",
      "絆 投射物ダメージが20%増加する (rune)",
      "--------",
      "回避力が98%増加する (implicit)",
      "--------",
      "最大マナ +136",
      "冷気耐性 +58%",
      "--------",
      "コラプト状態",
    ].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.lines.map((l) => l.kind)).toEqual(["rune", "rune", "implicit", "explicit", "explicit"]);
    const lines = it.text.split(NL);
    expect(lines).toContain("Implicits: 3");
    // 取引所の日本語の絆 (2026-10-02 エンジン点検で読めていなかった)
    expect(lines).toContain("{rune}Bonded: 20% increased Projectile Damage");
    expect(lines).toContain("{rune}+30 to maximum Life");
    expect(lines).toContain("98% increased Evasion Rating");
    expect(lines).toContain("+136 to maximum Mana");
    expect(lines.at(-1)).toBe("Corrupted");
  });
});

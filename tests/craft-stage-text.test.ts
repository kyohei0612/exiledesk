/**
 * クラフトステージの文面まわり (POE2Tube 要望 ㉔ の差分、2026-10-02):
 * 数値の差し替え (text-nums.ts)・エッセンスの見出しと部位 (essence-parts.ts)・カタリストで伸びた後の小数の丸め (stage-core.ts)
 */
import { describe, expect, it } from "vitest";
import { swapNums } from "../src/services/craft-stage/text-nums";
import { PART_WORDS, essenceNameEn, headingHits, headingParts } from "../src/services/craft-stage/essence-parts";
import { boostedMod, makeStageMod, retext } from "../src/services/craft-stage/stage-core";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { loadPatch } from "./helpers/patch";
import type { StageItem, StageMod } from "../src/services/craft-stage/types";
import hover from "../src/i18n/currency-hover-ja.json";

const data = loadPatch();

describe("swapNums (雛形が無い時の予備): 値の並び順で同じ数字を順に差し替える", () => {
  it("値の並びに無い数字 (固定の 8 秒) は書き換えない", () => {
    expect(swapNums("(41-59)% increased Damage if you have Hit in the last 8 seconds", [50], [55])).toBe("(41-59)% increased Damage if you have Hit in the last 8 seconds");
    expect(swapNums("50% increased Damage in the last 8 seconds", [50], [55])).toBe("55% increased Damage in the last 8 seconds");
  });
  it("複数の値・小数・マイナス", () => {
    expect(swapNums("Adds 3 to 7 Fire Damage", [3, 7], [4, 9])).toBe("Adds 4 to 9 Fire Damage");
    expect(swapNums("6.45% Critical Hit Chance", [6.45], [7.74])).toBe("7.74% Critical Hit Chance");
    expect(swapNums("-12% to Fire Resistance", [-12], [-14])).toBe("-14% to Fire Resistance");
  });
});

describe("エッセンスの見出しと部位", () => {
  it("見出しを部位の言葉に分ける (全角スペース・または・、)", () => {
    expect(headingParts("アミュレット、靴または手袋に付く")).toEqual(["アミュレット", "靴", "手袋"]);
    expect(headingParts("マーシャル武器、 手袋または矢筒に付く")).toEqual(["マーシャル武器", "手袋", "矢筒"]);
    expect(headingParts("装備に付く")).toEqual(["装備"]);
  });
  it("part=アミュレット は 宝飾品 / 装備 / 防具、ベルトまたは宝飾品 にも当たり、指輪・防具には当たらない", () => {
    expect(headingHits("宝飾品に付く", "アミュレット")).toBe(true);
    expect(headingHits("装備に付く", "アミュレット")).toBe(true);
    expect(headingHits("防具、ベルトまたは宝飾品に付く", "アミュレット")).toBe(true);
    expect(headingHits("アミュレットに付く", "アミュレット")).toBe(true);
    expect(headingHits("指輪に付く", "アミュレット")).toBe(false);
    expect(headingHits("防具に付く", "アミュレット")).toBe(false);
  });
  it("武器の括り: クォータースタッフは両手近接、スピアは片手近接、ワンドはキャスター", () => {
    expect(headingHits("両手近接武器またはクロスボウに付く", "クォータースタッフ")).toBe(true);
    expect(headingHits("片手近接武器または弓に付く", "クォータースタッフ")).toBe(false);
    expect(headingHits("片手近接武器または弓に付く", "スピア")).toBe(true);
    expect(headingHits("マーシャル武器、 手袋または矢筒に付く", "スピア")).toBe(true);
    expect(headingHits("マーシャル武器に付く", "ワンド")).toBe(false);
    expect(headingHits("フォーカスまたはワンドに付く", "ワンド")).toBe(true);
    expect(headingHits("武器に付く", "ワンド")).toBe(true);
  });
  it("辞書のエッセンスの見出しに出る部位の言葉は全部、表のどれかの部位から引ける (漏れが無い)", () => {
    const dict = hover as unknown as Record<string, { g?: Array<{ h: string }> }>;
    const words = new Set<string>();
    for (const [k, e] of Object.entries(dict)) {
      if (!/essenceof/.test(k)) continue;
      for (const g of e.g ?? []) for (const w of headingParts(g.h)) words.add(w);
    }
    const known = new Set(Object.values(PART_WORDS).flat());
    const missing = [...words].filter((w) => !known.has(w));
    expect(missing).toEqual([]);
    expect(words.size).toBeGreaterThan(15);
  });
  it("日本語名 → 英語名の逆引き (肉体 → thebody、英数字はそのまま、無い物は null)", async () => {
    expect(await essenceNameEn("肉体")).toBe("thebody");
    expect(await essenceNameEn("肉体のエッセンス")).toBe("thebody");
    expect(await essenceNameEn("ブリーチ")).toBe("thebreach");
    expect(await essenceNameEn("body")).toBe("body");
    expect(await essenceNameEn("存在しない名前")).toBeNull();
  });
});

describe("boostedMod: カタリストで伸びた後の数値", () => {
  const mod = (over: Partial<StageMod>): StageMod => ({
    modId: "Rings/CriticalStrikeChance", family: "CriticalStrikeChance", side: "suffix", tierIndex: 0, tierName: "T1", affix: "", modLevel: 1,
    values: [6.45], ranges: [], textJa: "クリティカル率 6.45%", textEn: "6.45% Critical Hit Chance", tags: ["caster"], ...over,
  }) as StageMod;
  const item = (m: StageMod): StageItem => ({ quality: 20, qualityTag: "caster", prefixes: [], suffixes: [m] }) as unknown as StageItem;
  it("小数は 2 桁に丸める (7.7399999… ではなく 7.74)、文も同じ数字", () => {
    const m = mod({});
    const b = boostedMod(item(m), m)!;
    expect(b.values).toEqual([7.74]);
    expect(b.textJa).toBe("クリティカル率 7.74%");
    expect(b.textEn).toBe("7.74% Critical Hit Chance");
  });
});

describe("retext: データの雛形から文を作り直す (「#」の位置だけ変わる)", () => {
  it("Rings/LightRadiusAndManaRegeneration: マナ再生が 5 でも、雛形で固定の Light Radius 5 は書き換わらない", () => {
    const mod = data.mods.get("Rings/LightRadiusAndManaRegeneration")!;
    expect(mod).toBeTruthy();
    // 値 = [Light Radius (範囲 5-5), マナ再生] の 2 つ。マナ再生だけ 5 → 9 にする
    const m = makeStageMod(mod, "suffix", 0, () => 0);
    expect(m.values[0]).toBe(5);
    const from = [m.values[0]!, 5];
    const base = retext(m, from, data);
    expect(base.textEn).toBe("5% increased Light Radius\n5% increased Mana Regeneration Rate");
    const r = retext({ ...m, values: from, ...base }, [5, 9], data);
    expect(r.textEn).toBe("5% increased Light Radius\n9% increased Mana Regeneration Rate");
    expect(r.textJa).toContain("9");
    expect(r.textJa.split("9").length).toBe(2);
  });
  it("カタリストの品質 (指輪・mana のタグ): 伸びた後の文は値と同じ数字で、2 回同じ数字が出ても雛形の位置どおり", () => {
    const mod = data.mods.get("Rings/LightRadiusAndManaRegeneration")!;
    const m = { ...makeStageMod(mod, "suffix", 0, () => 0.3), tags: mod.tags ? [...mod.tags] : ["mana"] };
    let it = freshItem(data, "Gold Ring", 82);
    it = { ...it, rarity: "rare", quality: 20, qualityTag: "mana", suffixes: [m] };
    const b = boostedMod(it, m, data)!;
    expect(b).toBeTruthy();
    expect(b.textEn).toBe(`${b.values[0]}% increased Light Radius\n${b.values[1]}% increased Mana Regeneration Rate`);
  });
});

/**
 * MOD の置き場・重み (計算機のエンジン = アプリ全体の正、memory: mod-engine-single-source)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { classOfBase } from "../src/services/htc/bridge";

const data = loadPatch();
/** 行の MOD の名前 (id の "/" の後ろ。系統名は STR / INT で同じ「BaseLocalDefences」なので、違いは id に出る) */
const modsOf = (row: string): Set<string> => {
  const b = data.bases.get(row)!;
  return new Set([...b.pools.normal.prefixes, ...b.pools.normal.suffixes].map((id) => id.split("/")[1]!));
};

describe("ベース → エンジンの行 (STR / DEX / INT で MOD の置き場が違う)", () => {
  it("手袋はベースごとに属性の行へ", () => {
    expect(classOfBase(data, "Ancient Mitts")?.id).toBe("Gloves_str");
    expect(classOfBase(data, "Adorned Gloves")?.id).toBe("Gloves_int");
  });
  it("STR の手袋にエナジーシールドの MOD は無く、INT の手袋にアーマーの MOD は無い", () => {
    const str = modsOf("Gloves_str");
    const int = modsOf("Gloves_int");
    expect(str.has("LocalPhysicalDamageReductionRating")).toBe(true);
    expect(str.has("LocalEnergyShield")).toBe(false);
    expect(int.has("LocalEnergyShield")).toBe(true);
    expect(int.has("LocalPhysicalDamageReductionRating")).toBe(false);
  });
});

describe("重み", () => {
  it("普通の MOD に仮置きの重み 1 が残っていない (weight-overrides.ts が埋める)", () => {
    const left: string[] = [];
    for (const m of data.mods.values()) if (m.source === "normal" && m.tiers.some((t) => t.weight === 1)) left.push(m.id);
    expect(left).toEqual([]);
  });
  it("弓のリーチの一番上の段 (65) は他の段と同じ 1000 (一部の段だけ仮置きだった)", () => {
    const m = data.mods.get("Bows/LifeLeechLocalPermyriad")!;
    expect(m.tiers.map((t) => t.weight)).toEqual([1000, 1000, 1000, 1000]);
  });
  it("指輪のキャストスピードは Craft of Exile の 1000 (仮置き 1 のままだと 1/1000 扱いになる)", () => {
    expect(data.mods.get("Rings/IncreasedCastSpeed")!.tiers.every((t) => t.weight === 1000)).toBe(true);
  });
});

describe("上位プレイヤー MOD 一覧の段の表", () => {
  // 2026-10-05 から段の表はエンジン (クラフトステージと同じデータ、engine-mods.ts) から。ベースのエンジンの行 (Gloves_str 等) で絞る
  // 普通の置き場で見る (創生の樹の MOD は手袋の種類を問わず付くので、special を除いて確かめる)
  it("STR の手袋の段の表に ES は出ず、INT の手袋にアーマーは出ない", async () => {
    const { prepareEngineMods, rowsForSlot, engineTiers } = await import("../src/services/mods/engine-mods");
    await prepareEngineMods();
    const str = rowsForSlot("gloves", ["Ancient Mitts"]);
    const int = rowsForSlot("gloves", ["Adorned Gloves"]);
    const n = { special: false };
    expect(engineTiers("+# to maximum Energy Shield", str, "prefix", n).length).toBe(0);
    expect(engineTiers("+# to Armour", str, "prefix", n).length).toBeGreaterThan(0);
    expect(engineTiers("+# to maximum Energy Shield", int, "prefix", n).length).toBeGreaterThan(0);
    expect(engineTiers("+# to Armour", int, "prefix", n).length).toBe(0);
  });
});

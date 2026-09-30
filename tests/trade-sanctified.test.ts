/**
 * 素材に買うベースの検索は聖別化された物を除く (オーナー 2026-09-30「聖別も × だね、ここじゃないと最安値取れん」)
 */
import { describe, expect, it } from "vitest";
import { buildSpecQuery } from "../src/services/trade2/query";

describe("聖別化", () => {
  it("noSanctified で misc_filters.sanctified = false", () => {
    const q = buildSpecQuery({ rarity: "nonunique", baseType: "Gold Amulet", stats: [], noSanctified: true });
    expect(q.query.filters.misc_filters.filters).toMatchObject({ corrupted: { option: "false" }, sanctified: { option: "false" } });
  });
  it("指定しなければ送らない (完成品の検索はそのまま)", () => {
    const q = buildSpecQuery({ rarity: "nonunique", baseType: "Gold Amulet", stats: [] });
    expect("sanctified" in q.query.filters.misc_filters.filters).toBe(false);
  });
});

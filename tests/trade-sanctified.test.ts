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

import { existingKinds, hasStatKind } from "../src/services/trade2/stat-kinds";
import { query } from "../src/services/build-copy/rare-trade-query";

describe("取引所に無い種類を送らない (2026-09-30)", () => {
  it("種類の表", () => {
    expect(hasStatKind("stat_3981240776", "desecrated")).toBe(true); // スピリット: 普通 / フラクチャー / 冒涜
    expect(hasStatKind("stat_3182714256", "desecrated")).toBe(false); // 枠の数: 冒涜は無い
    expect(existingKinds("stat_3182714256", ["explicit", "desecrated", "fractured"] as const)).toEqual(["explicit", "fractured"]);
    expect(existingKinds("stat_unknown", ["explicit", "desecrated"] as const)).toEqual(["explicit"]);
  });
  it("ビルドコピーの「どれか 1 つ」の枠は有る種類だけ", () => {
    const q = query("Absent Amulet", [{ id: "explicit.stat_3182714256" }], { armour: 0, evasion: 0, energyShield: 0, sockets: 0, quality: 0, grantedSkill: null }, null) as { query: { stats: Array<{ filters: Array<{ id: string }> }> } };
    expect(q.query.stats[0]!.filters.map((f) => f.id)).toEqual(["explicit.stat_3182714256", "fractured.stat_3182714256"]);
  });
});

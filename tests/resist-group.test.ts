/** 単体の耐性は種類を問わない (2026-10-04 オーナー「冷気だろうが雷だろうが火だろうが混沌だろうが何付いててもいい、どの検索ルートでも」) */
import { describe, expect, it } from "vitest";
import { splitResists } from "../src/services/trade2/resist-group";
import { buildSpecQuery } from "../src/services/trade2/query";

describe("どれかの耐性", () => {
  it("火 30 と冷気 25 → 4 種のどれか 2 個以上 (下限は低い方)", () => {
    const r = splitResists([{ id: "explicit.stat_3372524247", min: 30 }, { id: "explicit.stat_4220027924", min: 25 }, { id: "explicit.stat_3299347043", min: 80 }], ["explicit"]);
    expect(r.rest.map((x) => x.id)).toEqual(["explicit.stat_3299347043"]);
    expect(r.group?.count).toBe(2);
    expect(r.group?.filters.every((f) => f.min === 25)).toBe(true);
    expect(r.group?.filters.map((f) => f.id)).toContain("explicit.stat_2923486259");
  });
  it("取引所の条件は count の数が耐性の数", () => {
    const r = splitResists([{ id: "explicit.stat_1671376347", min: 20 }], ["explicit"]);
    const q = buildSpecQuery({ rarity: "nonunique", stats: r.rest, anyOf: [r.group!] }) as { query: { stats: Array<{ type: string; value?: { min: number }; filters: unknown[] }> } };
    const g = q.query.stats.find((x) => x.type === "count")!;
    expect(g.value?.min).toBe(1);
    expect(g.filters).toHaveLength(4);
  });
});

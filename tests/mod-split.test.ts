/** 同じ系統の中身の違う MOD を分ける (2026-10-05、rune-split.ts)。コルの狩りの「投射物スキルのレベル」が「呪印スキルのレベル」に混ざっていた */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { jaOfMod } from "../src/services/htc/mod-text";

const data = loadPatch();
const sig = (t: unknown) => ((t as { stats?: string[] }).stats ?? []).join(",");

describe("MOD の分け直し", () => {
  it("ティアごとに中身 (stat) が違う MOD は残っていない", () => {
    const mixed = [...data.mods.values()].filter((m) => new Set(m.tiers.map(sig)).size > 1).map((m) => m.id);
    expect(mixed).toEqual([]);
  });
  it("コルの狩りの手袋: 呪印スキルのレベルと投射物スキルのレベルが別の MOD (同じ系統 = 片方しか付かない)", () => {
    const g = data.bases.get("Gloves_str")!;
    const ids = [...g.pools.rune!["kolrs-hunt"]!.suffixes];
    const mark = ids.map((id) => data.mods.get(id)!).find((m) => m.text === "+# to Level of all Mark Skills")!;
    const proj = ids.map((id) => data.mods.get(id)!).find((m) => m.text === "+# to Level of all Projectile Skills")!;
    expect(mark && proj).toBeTruthy();
    expect(mark.family).toBe(proj.family);
    expect(mark.tiers.map((t) => t.ranges[0])).toEqual([[1, 2], [3, 4]]);
    expect(proj.tiers.map((t) => t.ranges[0])).toEqual([[1, 1], [2, 2]]);
    expect(jaOfMod(proj)).toContain("投射物");
  });
  it("置き場の MOD は全部ある", () => {
    for (const b of data.bases.values()) {
      for (const [n, p] of Object.entries(b.pools)) {
        const ps = n === "rune" ? Object.values(p as Record<string, { prefixes: string[]; suffixes: string[] }>) : [p as { prefixes?: string[]; suffixes?: string[] }];
        for (const q of ps) for (const id of [...(q?.prefixes ?? []), ...(q?.suffixes ?? [])]) expect(data.mods.has(id)).toBe(true);
      }
    }
  });
});

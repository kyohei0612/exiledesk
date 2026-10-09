// poe2db (今のページ) に合わせた直し (2026-10-09、scripts/build-poe2db-fixes.mjs → patch.ts の applyPoe2dbFixes)
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { mulberry32 } from "../src/services/htc/rng";
import { modListFor } from "../src/services/craft-stage/mod-list";

const data = loadPatch();
const pool = (cls: string, g: "normal" | "desecrated" | "essence") => {
  const p = data.bases.get(cls)!.pools[g];
  return [...p.prefixes, ...p.suffixes].map((id) => data.mods.get(id)!).filter(Boolean);
};

describe("poe2db に合わせた直し", () => {
  it("ワンドの冒涜に攻撃武器用の MOD (耐性貫通) が無い", () => {
    for (const cls of ["Wands", "Wands_fire", "Sceptres", "Staves"]) expect(pool(cls, "desecrated").some((m) => /ResistancePenetration/.test(m.family))).toBe(false);
  });
  it("タリスマンの筋力の重みは poe2db の 600", () => {
    const m = pool("Talismans", "normal").find((x) => x.family === "Strength")!;
    expect(m.tiers[0]!.weight).toBe(600);
  });
  it("全能力値の鎧の冒涜: 2 能力値の MOD があり、普通の筋力は無い", () => {
    const d = pool("Body_Armours_str_dex_int", "desecrated");
    expect(d.some((m) => (m.families ?? []).includes("Strength") && (m.families ?? []).includes("Intelligence"))).toBe(true);
    expect(d.some((m) => m.family === "Strength" && !m.families)).toBe(false);
  });
  it("盾に強化のエッセンス、タリスマンにエッセンスがある", () => {
    expect(pool("Shields_str", "essence").some((m) => m.family === "DefencesPercent")).toBe(true);
    expect(pool("Talismans", "essence").length).toBeGreaterThan(10);
  });
  it("タリスマンのスラッドの MOD は他の部位と同じ系統の名前", () => {
    const rune = data.bases.get("Talismans")!.pools.rune!["thruds-might"]!;
    const fams = [...rune.prefixes, ...rune.suffixes].map((id) => data.mods.get(id)!.family);
    expect(fams.some((f) => f.startsWith("Rune_"))).toBe(false);
  });
  it("無限のエッセンスはワンドにも打てて、筋力・器用さ・知性のどれかが付く", () => {
    const magic = applyCurrency(data, freshItem(data, "Volatile Wand", 82), "transmute", mulberry32(1)).item;
    const fams = new Set<string>();
    for (let s = 1; s <= 60; s++) {
      const r = applyCurrency(data, magic, "essence:lesser:Wands_fire/Essence_Strength", mulberry32(s));
      expect(r.applied).toBe(true);
      for (const m of r.added ?? []) fams.add(data.mods.get(m.modId)!.family);
    }
    expect([...fams].sort()).toEqual(["Dexterity", "Intelligence", "Strength"]);
  });
  it("MOD 一覧の無限のエッセンスは 3 行が別の文 (筋力 / 器用さ / 知性)", () => {
    const rows = modListFor(data, freshItem(data, "Volatile Wand", 82)).filter((r) => r.group === "essence" && /^Wands_fire\/Essence_(Strength|Dexterity|Intelligence)$/.test(r.id));
    expect(rows.length).toBe(3);
    expect(new Set(rows.map((r) => r.text)).size).toBe(3);
    expect(rows.every((r) => !/または/.test(r.text))).toBe(true);
  });
  it("ルーンの特殊 MOD の重みは Craft of Exile の実測 (破壊の元素 250・上の段 500)", () => {
    const tier = (id: string, ilvl: number) => data.mods.get(id)!.tiers.find((t) => t.ilvl === ilvl)!.weight;
    expect(tier("Wands_fire/Rune_destruction_ElementalModifierEffect__local_explicit_elemental_damage_mod_effect", 65)).toBe(250);
    expect(tier("Wands_fire/Rune_destruction_PhysicalModifierEffect", 65)).toBe(500);
    expect(tier("Helmets_str/Rune_berserking_WarcryDamage", 45)).toBe(1000);
    expect(tier("Helmets_str/Rune_berserking_WarcryDamage", 75)).toBe(500);
  });
});

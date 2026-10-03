/**
 * 計算機: アルダーで重ねた「追加の○ダメージとして獲得」(2026-10-03、防具・武器への拡張 その 4)
 * ゲームは同じ元素に変わった 2 つを 1 行にまとめて出す (実物の杖 71% + 62% = 133%)。1 つの MOD の上限より大きい値は
 * その元素 + 兄弟の元素の 2 つを狙いにして、最後にアルダーのルーンを差す
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { parseJaItem, targetsFor } from "../src/services/htc/paste";

const data = loadPatch();
const staff = (line: string) => parseJaItem(["Rarity: Rare", "Doom Song", "Chiming Staff", "--------", "Item Level: 82", "--------", line, "50% increased Spell Damage"].join("\n"));

describe("アルダーで重ねた獲得", () => {
  it("100% の火は 火 + もう 1 つの元素 (冷気か雷) の 2 つ、最後にアルダーの情熱 (杖の 1 つの上限は 60%)", () => {
    const got = targetsFor(data, staff("Gain 100% of Damage as Extra Fire Damage"));
    expect(got.aldur).toMatchObject({ rune: "passion-of-aldur", element: "fire", count: 2 });
    const ids = got.targets.map((t) => t.modId);
    expect(ids).toContain("Staves/DamageGainedAsFire");
    expect(ids.some((id) => /DamageGainedAs(Cold|Lightning)$/.test(id))).toBe(true);
    expect(ids).toContain("Staves/WeaponSpellDamage");
  });
  it("1 つの MOD に収まる値ならそのまま (アルダー無し)", () => {
    const got = targetsFor(data, staff("Gain 40% of Damage as Extra Fire Damage"));
    expect(got.aldur ?? null).toBeNull();
    expect(got.targets.filter((t) => /DamageGainedAs/.test(t.modId)).length).toBe(1);
  });
});

describe("3 つ重ね", () => {
  it("133% は 3 つ (火・冷気・雷を全部作って情熱で火に)", () => {
    const got = targetsFor(data, staff("Gain 133% of Damage as Extra Fire Damage"));
    expect(got.aldur).toMatchObject({ rune: "passion-of-aldur", count: 3 });
    const ids = got.targets.map((t) => t.modId).filter((id) => /DamageGainedAs/.test(id)).sort();
    expect(ids).toEqual(["Staves/DamageGainedAsCold", "Staves/DamageGainedAsFire", "Staves/DamageGainedAsLightning"]);
  });
});

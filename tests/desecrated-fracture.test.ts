// 冒涜の MOD はフラクチャーされない: 発現済みでも未発現でも (4 つの数には入る)。
// 2026-10-10 要望「冒涜 MOD は未発現・発現済み問わずフラクチャーにならない」+ オーナーが取引所で確認 (冒涜専用の MOD のフラクチャー品は無い)
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyForce, forceKey } from "../src/services/craft-stage/apply-force";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods } from "../src/services/craft-stage/stage-core";

const data = loadPatch();
const blank = startFrom(data, "Gold Ring", 82, {} as never, 1);
const des = [...(blank.cls.pools.desecrated?.prefixes ?? []), ...(blank.cls.pools.desecrated?.suffixes ?? [])][0]!;
const withDes = (extra: string[]) => startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: [...extra.map((mod) => ({ mod })), { mod: des, desecrated: true }] } as never, 1);

it("始めの状態: 冒涜 + フラクチャーは作れない", () => {
  expect(() => startFrom(data, "Gold Ring", 82, { mods: [{ mod: des, desecrated: true, fractured: true }] } as never, 1)).toThrow();
});
it("指名のフラクチャー: 付いている冒涜の MOD は固定できない、冒涜専用を固定で付ける事もできない", () => {
  const item = withDes([]);
  expect(applyForce(data, item, forceKey(des, null, "f"), () => 0.5).applied).toBe(false);
  expect(applyForce(data, blank.rarity === "rare" ? blank : { ...blank, rarity: "rare" }, forceKey(des, null, "f"), () => 0.5).applied).toBe(false);
});
it("フラクチャーオーブ: 冒涜の MOD は数に入るが、選ばれない", () => {
  const item = withDes(["Rings/FireDamage", "Rings/Intelligence", "Rings/ChaosResistance"]);
  expect(allMods(item)).toHaveLength(4);
  for (let s = 0; s < 40; s++) {
    let x = s / 40;
    const r = applyCurrency(data, item, "fracture", () => (x = (x * 9301 + 0.49297) % 1));
    expect(r.applied).toBe(true);
    const f = allMods(r.item).find((m) => m.fractured)!;
    expect(f.desecrated).toBeFalsy();
  }
});

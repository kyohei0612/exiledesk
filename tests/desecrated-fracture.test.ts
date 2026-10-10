// フラクチャーで選べないのは未発現の枠と冒涜専用の MOD だけ (4 つの数には入る)。骨で付いた普通の MOD は固定できる
// (2026-10-10 オーナー「冒涜で一般 MOD はフラクチャーできる、冒涜 MOD はフラクチャーで選択できない」)
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

it("始めの状態: 冒涜専用 + フラクチャーは作れない、骨で付いた普通の MOD + フラクチャーは作れる", () => {
  expect(() => startFrom(data, "Gold Ring", 82, { mods: [{ mod: des, desecrated: true, fractured: true }] } as never, 1)).toThrow();
  const it0 = startFrom(data, "Gold Ring", 82, { mods: [{ mod: "Rings/Intelligence", desecrated: true, fractured: true }] } as never, 1);
  const m = allMods(it0).find((x) => x.modId === "Rings/Intelligence")!;
  expect({ f: m.fractured, d: m.desecrated }).toEqual({ f: true, d: true });
});
it("指名のフラクチャー: 冒涜専用は不可、骨で付いた普通の MOD は固定できる", () => {
  expect(applyForce(data, withDes([]), forceKey(des, null, "f"), () => 0.5).applied).toBe(false);
  const it0 = startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: [{ mod: "Rings/Intelligence", desecrated: true }] } as never, 1);
  const r = applyForce(data, it0, forceKey("Rings/Intelligence", null, "f"), () => 0.5);
  expect(r.applied, r.reason).toBe(true);
});
it("フラクチャーオーブ: 冒涜専用の MOD は数に入るが選ばれない", () => {
  const item = withDes(["Rings/FireDamage", "Rings/Intelligence", "Rings/ChaosResistance"]);
  expect(allMods(item)).toHaveLength(4);
  for (let s = 0; s < 40; s++) {
    let x = s / 40;
    const r = applyCurrency(data, item, "fracture", () => (x = (x * 9301 + 0.49297) % 1));
    expect(r.applied).toBe(true);
    expect(allMods(r.item).find((m) => m.fractured)!.modId).not.toBe(des);
  }
});

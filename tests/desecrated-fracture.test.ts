// フラクチャーで選べないのは未発現の枠と冒涜で付いた MOD 全部 (4 つの数には入る)。
// 2026-10-10 オーナーがゲームで実測 (発現した冒涜 MOD が 24 回で 1 回も選ばれない)
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

it("始めの状態: 冒涜 + フラクチャーは作れない (冒涜専用でも、骨で付いた普通の MOD でも)", () => {
  expect(() => startFrom(data, "Gold Ring", 82, { mods: [{ mod: des, desecrated: true, fractured: true }] } as never, 1)).toThrow();
  expect(() => startFrom(data, "Gold Ring", 82, { mods: [{ mod: "Rings/Intelligence", desecrated: true, fractured: true }] } as never, 1)).toThrow();
});
it("指名のフラクチャー: 冒涜の MOD は固定できない (骨で付いた普通の MOD も)", () => {
  expect(applyForce(data, withDes([]), forceKey(des, null, "f"), () => 0.5).applied).toBe(false);
  const it0 = startFrom(data, "Gold Ring", 82, { rarity: "rare", mods: [{ mod: "Rings/Intelligence", desecrated: true }] } as never, 1);
  expect(applyForce(data, it0, forceKey("Rings/Intelligence", null, "f"), () => 0.5).applied).toBe(false);
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

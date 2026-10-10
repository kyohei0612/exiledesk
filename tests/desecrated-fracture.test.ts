// 冒涜の MOD のフラクチャー (2026-10-10 オーナー「なんで冒涜 MOD フラクチャーできないんだ」): 始めの状態でも途中でも、発現済みの冒涜は固定できる
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { applyForce, forceKey } from "../src/services/craft-stage/apply-force";
import { allMods } from "../src/services/craft-stage/stage-core";

const data = loadPatch();
const blank = startFrom(data, "Gold Ring", 82, {} as never, 1);
const des = [...(blank.cls.pools.desecrated?.prefixes ?? []), ...(blank.cls.pools.desecrated?.suffixes ?? [])][0]!;

it("始めの状態: 冒涜 + フラクチャーの両方の印が付く", () => {
  const item = startFrom(data, "Gold Ring", 82, { mods: [{ mod: des, desecrated: true, fractured: true }] } as never, 1);
  const m = allMods(item).find((x) => x.modId === des)!;
  expect(item.rarity).toBe("rare");
  expect(m.desecrated).toBe(true);
  expect(m.fractured).toBe(true);
});
it("途中: 付いている冒涜の MOD をフラクチャーで固定できる", () => {
  const item = startFrom(data, "Gold Ring", 82, { mods: [{ mod: des, desecrated: true }] } as never, 1);
  const r = applyForce(data, item, forceKey(des, null, "f"), () => 0.5);
  expect(r.applied).toBe(true);
  const m = allMods(r.item).find((x) => x.modId === des)!;
  expect(m.fractured && m.desecrated).toBe(true);
});

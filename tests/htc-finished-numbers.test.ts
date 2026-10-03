/** 計算機の完成品の数値 (DPS・防御) (2026-10-03、防具・武器への拡張 その 4) */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { finishedNumbers } from "../src/views/htc-craft/finished-numbers";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { numbersOf } from "../src/services/craft-stage/stage-props";

const data = loadPatch();
const top = (id: string) => data.mods.get(id)!.tiers.length - 1;

describe("完成品の数値", () => {
  it("槍: % 物理 + 追加の物理 + 攻撃速度 (T1) で、白より物理 DPS が上がり、下限 ≤ 上限", () => {
    const targets = ["Spears/LocalPhysicalDamagePercent", "Spears/LocalPhysicalDamage", "Spears/LocalIncreasedAttackSpeed"].map((modId) => ({ modId, minTierIndex: top(modId) }));
    const r = finishedNumbers(data, "Hunting Spear", 82, 20, targets)!;
    const white = numbersOf({ ...freshItem(data, "Hunting Spear", 82), quality: 20 })!;
    expect(r).toBeTruthy();
    expect(r.lo.physDps!).toBeGreaterThan(white.physDps! * 2);
    expect(r.hi.physDps!).toBeGreaterThanOrEqual(r.lo.physDps!);
    expect(r.lo.aps!).toBeGreaterThan(white.aps!);
  });
  it("装飾品 (素の数値が無い) は null", () => {
    expect(finishedNumbers(data, "Gold Ring", 82, 20, [{ modId: "Rings/IncreasedLife", minTierIndex: 0 }])).toBeNull();
  });
});

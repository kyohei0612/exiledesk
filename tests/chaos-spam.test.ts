/**
 * カオススパム (chaos-spam.ts) の数え方。1 人の回数は、同じ種なら「1 回ずつ applyCurrency を打って揃った回」と同じになる
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadHtcPatch } from "../src/services/htc/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { aimDone } from "../src/services/craft-stage/aim-odds";
import { mulberry32 } from "../src/services/htc/rng";
import { medianOf, rankOf, spamOne, unluckyOf } from "../src/services/craft-stage/chaos-spam";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import type { StageItem } from "../src/services/craft-stage/types";

let data: PatchData;
let rare: StageItem;
beforeAll(async () => {
  data = await loadHtcPatch();
  rare = applyCurrency(data, freshItem(data, "Gold Ring", 82), "alchemy", mulberry32(3)).item;
});

describe("カオススパム", () => {
  it("もう揃っていれば 0 回", () => {
    const m = rare.suffixes[0] ?? rare.prefixes[0]!;
    expect(spamOne(data, rare, [{ modId: m.modId, minTierIndex: 0 }], "chaos", mulberry32(1))).toBe(0);
  });

  it("狙いのどれか 1 つが付いていれば当たり (2026-10-16 オーナー「どれか付いたら」)", () => {
    const m = rare.suffixes[0] ?? rare.prefixes[0]!;
    expect(spamOne(data, rare, [{ modId: "Rings/FireResistance", minTierIndex: 0 }, { modId: m.modId, minTierIndex: 0 }], "chaos", mulberry32(1))).toBe(0);
  });

  it("回数は 1 回ずつ打って揃った回と同じ (同じ種)", () => {
    const t = [{ modId: "Rings/FireResistance", minTierIndex: 0 }];
    const n = spamOne(data, rare, t, "chaos", mulberry32(42));
    expect(n).not.toBeNull();
    const rng = mulberry32(42);
    let it = rare, k = 0;
    while (!aimDone(it, t)) { const r = applyCurrency(data, it, "chaos", rng); if (r.applied) it = r.item; k++; }
    expect(k).toBe(n);
  });

  it("上位 % と半分・運が悪い 10 人に 1 人", () => {
    const st = { tries: Array.from({ length: 100 }, (_, i) => i + 1), failed: 0, people: 100 };
    expect(medianOf(st)).toBe(50);
    expect(unluckyOf(st)).toBe(90);
    expect(rankOf(st, 1)).toBe(1);
    expect(rankOf(st, 30)).toBe(30);
    expect(rankOf(st, 1000)).toBe(100);
    // 付かなかった人が半分を超えれば「半分の人」は出せない
    expect(medianOf({ tries: [1, 2], failed: 98, people: 100 })).toBeNull();
  });
});

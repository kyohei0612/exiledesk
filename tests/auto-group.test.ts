// シミュレーターの狙いの自動まとめ (auto-group.ts、2026-10-09): 同じ側・同じ付け方の普通の MOD を「この中のどれか N つ」に
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { autoGroup, type SimTarget } from "../src/services/craft-stage/auto-group";

const data = loadPatch();
const R = "Rings/";
const ids = (t: SimTarget): string[] => [t.modId, ...(t.alts ?? []).map((a) => a.modId)].sort();

describe("狙いの自動まとめ", () => {
  it("同じ側の高貴ガチャ 2 つは、全部付ける「どれか 2 つ」になる (コピー 2 つ・候補は同じ組)", () => {
    const list: SimTarget[] = [{ modId: R + "IncreasedLife", minTierIndex: 5 }, { modId: R + "IncreasedMana", minTierIndex: 7 }];
    const out = autoGroup(data, list, R + "IncreasedMana");
    expect(out).toHaveLength(2);
    expect(ids(out[0]!)).toEqual(ids(out[1]!));
    expect(out[0]!.alts).toEqual([{ modId: R + "IncreasedMana", minTierIndex: 7 }]);
  });
  it("3 つ目を足すと同じ組に入って「どれか 3 つ」", () => {
    let list: SimTarget[] = [{ modId: R + "IncreasedLife", minTierIndex: 5 }, { modId: R + "IncreasedMana", minTierIndex: 7 }];
    list = autoGroup(data, list, R + "IncreasedMana");
    list = autoGroup(data, [...list, { modId: R + "FireDamage", minTierIndex: 1 }], R + "FireDamage");
    expect(list).toHaveLength(3);
    expect(new Set(list.map((t) => ids(t).join()))).toEqual(new Set([[R + "IncreasedLife", R + "IncreasedMana", R + "FireDamage"].sort().join()]));
  });
  it("反対の側・付け方の違う物・フラクチャー予定はまとめない", () => {
    const list: SimTarget[] = [
      { modId: R + "IncreasedCastSpeed", minTierIndex: 4, method: "fracture" },
      { modId: R + "IncreasedLife", minTierIndex: 5, method: "chaos" },
      { modId: R + "FireResistance", minTierIndex: 3 },
      { modId: R + "IncreasedMana", minTierIndex: 7 },
    ];
    const out = autoGroup(data, list, R + "IncreasedMana");
    expect(out.every((t) => !t.alts?.length)).toBe(true);
  });
  it("「どれか 1 つ」(あるいは) の組はそのまま", () => {
    const list: SimTarget[] = [
      { modId: R + "IncreasedLife", minTierIndex: 5, alts: [{ modId: R + "ItemFoundRarityIncrease", minTierIndex: 1 }] },
      { modId: R + "IncreasedMana", minTierIndex: 7 },
    ];
    expect(autoGroup(data, list, R + "IncreasedMana")).toEqual(list);
  });
});

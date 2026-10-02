import { describe, expect, it } from "vitest";
import { diffMods, diffSlot, templ } from "../src/services/pob-check/build-diff";
import type { ItemView } from "../src/services/pob-check/api";

const item = (o: Partial<ItemView>): ItemView => ({ title: "x", base: "Ruby Ring", rarity: "RARE", implicits: [], runes: [], explicits: [], corrupted: false, ...o });

describe("build-diff (相手との装備の差)", () => {
  it("型は数字を # にした行", () => {
    expect(templ("+38 to maximum Life")).toEqual({ t: "# to maximum Life", nums: [38] });
    expect(templ("Adds 8 to 19 Physical Damage to Attacks").nums).toEqual([8, 19]);
  });

  it("レア同士: 足りない行は 無し → 相手、弱い行は 自分 → 相手、強い行と同じ行は出さない", () => {
    const mine = item({ explicits: ["+38 to maximum Life", "+31% to Fire Resistance", "+40% to Cold Resistance", "20% increased Rarity of Items found"] });
    const target = item({ explicits: ["+101 to maximum Life", "+20% to Fire Resistance", "+40% to Cold Resistance", "+58% to Lightning Resistance"] });
    expect(diffMods(mine, target)).toEqual([
      { from: "+38 to maximum Life", to: "+101 to maximum Life" },
      { from: null, to: "+58% to Lightning Resistance" },
    ]);
  });

  it("同じ型が 2 つ (耐性 2 つ) は近い方と比べる", () => {
    const mine = item({ explicits: ["+10% to Fire Resistance", "+40% to Fire Resistance"] });
    const target = item({ explicits: ["+45% to Fire Resistance", "+12% to Fire Resistance"] });
    expect(diffMods(mine, target)).toEqual([
      { from: "+40% to Fire Resistance", to: "+45% to Fire Resistance" },
      { from: "+10% to Fire Resistance", to: "+12% to Fire Resistance" },
    ]);
  });

  it("ユニークは装備ごと。同じユニークなら差なし、自分が空なら 無し → 相手", () => {
    const a = item({ title: "Mageblood", base: "Utility Belt", rarity: "UNIQUE" });
    expect(diffSlot("Belt", a, { ...a }).kind).toBe("same");
    expect(diffSlot("Belt", a, { ...a, base: "Runeforged Utility Belt" }).kind).toBe("same");
    expect(diffSlot("Belt", item({ title: "Rift Post" }), a)).toMatchObject({ kind: "unique", to: a });
    expect(diffSlot("Belt", null, a)).toMatchObject({ kind: "unique", from: null });
    expect(diffSlot("Belt", a, null)).toMatchObject({ kind: "only-mine" });
  });
});

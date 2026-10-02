import { describe, expect, it } from "vitest";
import { diffGemGroup, diffGems, diffMods, diffSlot, templ } from "../src/services/pob-check/build-diff";
import type { GemView, GroupView, ItemView, Summary } from "../src/services/pob-check/api";

const item = (o: Partial<ItemView>): ItemView => ({ title: "x", base: "Ruby Ring", rarity: "RARE", implicits: [], runes: [], explicits: [], corrupted: false, ...o });
const gem = (name: string, o: Partial<GemView> = {}): GemView => ({ j: 1, name, level: 20, quality: 0, corrupt: 0, enabled: true, support: name.includes("Support") || name.endsWith(" II") || name.endsWith(" III"), maxLevel: 40, ...o });
const group = (i: number, gems: GemView[], o: Partial<GroupView> = {}): GroupView => ({ i, label: "", enabled: true, meta: false, gems, skills: [], ...o });
const sum = (groups: GroupView[]): Summary => ({ char: { class: "", ascendancy: "", level: 1 }, stats: {}, config: { powerCharges: 0, powerChargesInput: 0 }, mainSocketGroup: 1, groups, items: [], tree: { alloc: [], granted: [], jewels: [] }, weaponSet: 1 });

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

describe("build-diff (相手とのジェムの差)", () => {
  it("同じ組: 足りないサポートは 無し → 名前、レベル・品質は相手が高い時だけ。コラプトの +レベルは見ない", () => {
    const mine = [gem("Spark", { level: 20, quality: 0, corrupt: 1 }), gem("Pierce III"), gem("Execute III", { level: 1 })];
    const target = [gem("Spark", { level: 21, quality: 20 }), gem("Pierce III"), gem("Execute III", { level: 1 }), gem("Embitter Support")];
    expect(diffGemGroup(mine, target)).toEqual([
      { gem: "Spark", kind: "level", from: 20, to: 21 },
      { gem: "Spark", kind: "quality", from: 0, to: 20 },
      { gem: "Embitter Support", kind: "missing", from: null, to: 20 },
    ]);
    // 自分の方が高い・同じは出さない
    expect(diffGemGroup([gem("Spark", { level: 21, quality: 20 })], [gem("Spark", { level: 20 })])).toEqual([]);
  });

  it("同じ名前が 2 つ (CoEA にアークを 2 つ) は順に合わせる", () => {
    const mine = [gem("Cast on Elemental Ailment"), gem("Arc", { level: 19 }), gem("Arc", { level: 20 })];
    const target = [gem("Cast on Elemental Ailment"), gem("Arc", { level: 20 }), gem("Arc", { level: 20 }), gem("Arc", { level: 20 })];
    expect(diffGemGroup(mine, target)).toEqual([
      { gem: "Arc", kind: "level", from: 19, to: 20 },
      { gem: "Arc", kind: "missing", from: null, to: 20 },
    ]);
  });

  it("組はアクティブの名前で合わせる。自分に無い組は組ごと、相手に無い組は数だけ。使っていない組・2 重の組は見ない", () => {
    const mine = sum([
      group(1, [gem("Spark"), gem("Pierce III")]),
      group(2, [gem("Blink")]),
      group(3, [gem("Spark"), gem("Pierce III")], { duplicateOf: 1 }),
      group(4, [gem("Frost Bomb")], { enabled: false }),
    ]);
    const target = sum([
      group(1, [gem("Spark"), gem("Pierce III"), gem("Embitter Support")]),
      group(2, [gem("Firestorm", { level: 19 }), gem("Zenith II")]),
      group(3, [gem("Flame Wall")], { enabled: false }),
      // 装備が与えるスキル (ブリンクの胴など) はジェムではないので見ない
      group(4, [gem("Blink", { level: 19 })], { source: "Item:8:Sands of Silk, Shrouded Vest" }),
    ]);
    const d = diffGems(mine, target);
    expect(d.onlyMine).toBe(1);
    expect(d.groups).toHaveLength(2);
    expect(d.groups[0]).toMatchObject({ kind: "changes", active: { name: "Spark" }, lines: [{ gem: "Embitter Support", kind: "missing" }] });
    expect(d.groups[1]).toMatchObject({ kind: "missing", active: { name: "Firestorm" }, others: [{ name: "Zenith II" }] });
  });

  it("差の無い組は出さない", () => {
    const g = [gem("Spark"), gem("Pierce III")];
    expect(diffGems(sum([group(1, g)]), sum([group(1, g)]))).toEqual({ groups: [], onlyMine: 0 });
  });
});

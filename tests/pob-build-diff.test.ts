import { describe, expect, it } from "vitest";
import { adoptCandidates, diffGemGroup, diffGems, diffMods, diffSlot, templ } from "../src/services/pob-check/build-diff";
import { prepareTradeLinks, rareModsSearchQuery, uniqueSearchQuery } from "../src/services/pob-check/trade-links";
import type { GemView, GroupView, ItemView, Summary, TreeNode } from "../src/services/pob-check/api";

const item = (o: Partial<ItemView>): ItemView => ({ title: "x", base: "Ruby Ring", rarity: "RARE", implicits: [], runes: [], explicits: [], corrupted: false, raw: "", ...o });
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
      // 装備が与えるスキル (ブリンクの胴など) は、同じく装備が与える組とだけ合わせる (サポートの差だけ)。ジェムのブリンクとは別物
      group(4, [gem("Blink", { level: 19 })], { source: "Item:8:Sands of Silk, Shrouded Vest" }),
    ]);
    const d = diffGems(mine, target);
    expect(d.onlyMine).toBe(1);
    expect(d.groups).toHaveLength(2);
    expect(d.groups[0]).toMatchObject({ kind: "changes", active: { name: "Spark" }, lines: [{ gem: "Embitter Support", kind: "missing" }] });
    expect(d.groups[1]).toMatchObject({ kind: "missing", active: { name: "Firestorm" }, others: [{ name: "Zenith II" }] });
  });

  it("同じアクティブの組が複数 (CoEA が 2 つ) は、中のジェムが一番重なる組と合わせる (順ではない)", () => {
    const mine = sum([
      group(1, [gem("Cast on Elemental Ailment"), gem("Arc"), gem("Arc"), gem("Pinpoint Critical")]),
      group(2, [gem("Cast on Elemental Ailment"), gem("Lightning Warp"), gem("Snap"), gem("Pinpoint Critical")]),
    ]);
    const target = sum([
      group(6, [gem("Cast on Elemental Ailment"), gem("Lightning Warp"), gem("Snap"), gem("Pinpoint Critical"), gem("Execute III")]),
      group(9, [gem("Cast on Elemental Ailment"), gem("Arc"), gem("Arc"), gem("Pinpoint Critical"), gem("Execute III")]),
    ]);
    const d = diffGems(mine, target);
    expect(d.groups).toEqual([
      expect.objectContaining({ kind: "changes", gi: 2, lines: [{ gem: "Execute III", kind: "missing", from: null, to: 20 }] }),
      expect.objectContaining({ kind: "changes", gi: 1, lines: [{ gem: "Execute III", kind: "missing", from: null, to: 20 }] }),
    ]);
  });

  it("差の無い組は出さない", () => {
    const g = [gem("Spark"), gem("Pierce III")];
    const d = diffGems(sum([group(1, g)]), sum([group(1, g)]));
    expect(d.groups).toEqual([]);
    expect(d.onlyMine).toBe(0);
    // 全部まとめて真似: 差が無くても相手の組の中身で合わせる
    expect(d.pairs.map((x) => x.gi)).toEqual([1]);
  });
  it("全部まとめて真似: 相手に無い自分の組は止める (off)", () => {
    const d = diffGems(sum([group(1, [gem("Spark")]), group(2, [gem("Arc")])]), sum([group(1, [gem("Spark")]), group(2, [gem("Frostbomb")])]));
    expect(d.onlyMineGi).toEqual([2]);
    expect(d.pairs.map((x) => x.gi)).toEqual([1, 0]);
  });
});

describe("build-diff (取り入れの試算の対象)", () => {
  const node = (id: number, g: number, t: TreeNode["t"], n = ""): TreeNode => ({ id, x: 0, y: 0, t, n, l: [], g });
  const tree: TreeNode[] = [
    node(1, 10, "n"), node(2, 10, "N", "Heartstopper"), node(3, 10, "n"),
    node(4, 20, "n"), node(5, 20, "n"),
    node(6, 30, "K", "Pain Attunement"),
    node(7, 40, "N", "Wicked Pall"), node(8, 40, "N", "Sage"),
    node(9, 50, "A", "Start"),
  ];
  const withTree = (s: Summary, alloc: number[], granted: number[] = []): Summary => ({ ...s, tree: { alloc, granted, jewels: [] } });
  const withItems = (s: Summary, items: Array<[string, ItemView]>): Summary => ({ ...s, items: items.map(([slot, it]) => ({ slot, jewel: false, changed: false, item: it })) });

  it("装備: 差のある欄だけ (ユニークは装備ごと、レアは足りない行付き)。ジェム: リネージュのサポートだけ、自分の組に足す形 (他のサポート・無い組は出さない)", () => {
    const mage = item({ title: "Mageblood", base: "Utility Belt", rarity: "UNIQUE", raw: "Rarity: UNIQUE\nMageblood" });
    const lin = { ...gem("Oisin's Oath"), lineage: true };
    const mine = withItems(sum([group(1, [gem("Spark"), gem("Pierce III")])]), [["Belt", item({ title: "Rift Post" })], ["Ring 1", item({ explicits: ["+38 to maximum Life"] })], ["Ring 2", item({ explicits: ["+50 to maximum Life"] })]]);
    const target = withItems(sum([group(3, [gem("Spark"), gem("Pierce III"), gem("Embitter Support"), lin]), group(4, [gem("Firestorm"), { ...gem("Uhtred's Augury"), lineage: true }])]), [["Belt", mage], ["Ring 1", item({ explicits: ["+101 to maximum Life"], raw: "ring" })], ["Ring 2", item({ explicits: ["+50 to maximum Life"] })]]);
    const c = adoptCandidates(mine, target, []);
    expect(c.map((x) => x.key)).toEqual(["item:Belt", "item:Ring 1", "lineage:0:Spark"]);
    expect(c[0]).toMatchObject({ kind: "item", slot: "Belt", unique: true, to: mage, mods: [] });
    expect(c[1]).toMatchObject({ kind: "item", slot: "Ring 1", unique: false, mods: [{ from: "+38 to maximum Life", to: "+101 to maximum Life" }] });
    // 自分の組 (Spark / Pierce III) + 足りないリネージュだけ。Embitter (普通のサポート) は足さない
    expect(c[2]).toMatchObject({ kind: "gems", gi: 1, lineage: ["Oisin's Oath"], lines: [{ gem: "Oisin's Oath", kind: "missing" }] });
    expect((c[2] as { gems: GemView[] }).gems.map((g) => g.name)).toEqual(["Spark", "Pierce III", "Oisin's Oath"]);
  });

  it("ツリー: 丸ごと相手の物にする 1 件 (足す = 相手にあって自分に無い、外す = 自分にあって相手に無い)。装備が与える物・始点・アセンダンシー・ツリーに無い物は除く", () => {
    const mine = withTree(sum([]), [1, 7, 4], [8]);
    const target = withTree(sum([]), [1, 2, 3, 6, 7, 8, 9, 999]);
    const c = adoptCandidates(mine, target, tree);
    expect(c).toEqual([{ kind: "tree", key: "tree", add: [2, 3, 6], remove: [4] }]);
    // 同じツリーなら出さない
    expect(adoptCandidates(withTree(sum([]), [1, 2]), withTree(sum([]), [1, 2]), tree)).toEqual([]);
  });

  it("ジュエル: 自分に無いツリーのジュエル (ユニークは名前、レアは文面で比べる)。穴のノード番号と、自分のその穴の物", () => {
    const heart = item({ title: "Heart of the Well", base: "Diamond", rarity: "UNIQUE", raw: "heart" });
    const megalo = item({ title: "Megalomaniac", base: "Diamond", rarity: "UNIQUE", raw: "megalo" });
    const rare = item({ title: "Blight Spark", base: "Ruby", rarity: "RARE", raw: "rare jewel" });
    const jw = (s: Summary, list: Array<[string, ItemView]>): Summary => ({ ...s, items: list.map(([slot, it]) => ({ slot, jewel: true, changed: false, item: it })) });
    const mine = jw(sum([]), [["Jewel 100", megalo], ["Jewel 200", rare]]);
    const target = jw(sum([]), [["Jewel 100", heart], ["Jewel 300", megalo], ["Jewel 400", item({ ...rare, raw: "another rare" })]]);
    const c = adoptCandidates(mine, target, []);
    expect(c.map((x) => x.key)).toEqual(["jewel:Jewel 100", "jewel:Jewel 400"]);
    expect(c[0]).toMatchObject({ kind: "jewel", slot: "Jewel 100", nodeId: 100, from: megalo, to: heart });
    expect(c[1]).toMatchObject({ kind: "jewel", nodeId: 400, from: null });
  });
});

describe("trade-links (取引所で探す = URL の条件だけ、API は叩かない)", () => {
  it("ユニークは名前 + ベース", () => {
    expect(uniqueSearchQuery({ title: "Mageblood", base: "Utility Belt" })).toMatchObject({ query: { name: { option: "Mageblood" }, type: "Utility Belt" } });
  });
  it("レアの足りない行は取引所の条件の番号に引いて数値を下限に。引けない行は missing", async () => {
    await prepareTradeLinks();
    const r = rareModsSearchQuery("Sapphire Ring", ["+101 to maximum Life", "+58% to Lightning Resistance", "this line does not exist"]);
    expect(r).not.toBeNull();
    expect(r!.missing).toEqual(["this line does not exist"]);
    const q = r!.query as { query: { type: string; stats: Array<{ type: string; value?: { min: number }; filters: Array<{ id: string; value?: { min?: number } }> }> } };
    expect(q.query.type).toBe("Sapphire Ring");
    // 明示の MOD は「普通 / 冒涜 / 固定済み のどれでも」(count 1) の組に。数値はそのまま下限
    const mins = q.query.stats.flatMap((g) => g.filters.map((f) => f.value?.min)).filter((v) => v != null);
    expect(mins).toEqual(expect.arrayContaining([101, 58]));
    expect(rareModsSearchQuery("Sapphire Ring", ["nothing here"])).toBeNull();
  });
});

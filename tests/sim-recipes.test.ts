// レシピが更新で消えないように (2026-10-07): 古い形の読み替え・控えから戻す・読めない物は捨てない・書き出しと読み込み
import { beforeEach, describe, expect, it } from "vitest";

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
} as Storage;

const mod = await import("../src/state/craft-stage");
const KEY = "exiledesk.craftStageSim.recipes";

describe("レシピの保管", () => {
  beforeEach(() => store.clear());
  it("古い形 (版の印なし・欠けた所あり) も読み替える。ベースの無い物は控えに残して捨てない", () => {
    store.set(KEY, JSON.stringify([
      { id: "a", name: "古い手袋", savedAt: 1, session: { base: "Polished Bracers", patterns: [{ name: "p", steps: [{ set: "x" }] }] } },
      { id: "b", name: "壊れた", savedAt: 2, session: {} },
    ]));
    const list = mod.readSimRecipes();
    expect(list.map((r) => r.name)).toEqual(["古い手袋"]);
    expect(list[0]!.session).toMatchObject({ base: "Polished Bracers", itemLevel: 82, targets: [], order: [], sockets: null, flags: {} });
    expect(list[0]!.session.patterns[0]!.steps).toHaveLength(1);
    expect(list[0]!.v).toBe(mod.RECIPE_FORMAT);
    expect(JSON.parse(store.get(KEY + ".unread")!)).toHaveLength(1);
  });
  it("書く前に控えを取り、本体が壊れていたら控えから読む", () => {
    const r = mod.normalizeRecipe({ id: "a", name: "x", savedAt: 1, session: { base: "Gold Ring" } })!;
    mod.writeSimRecipes([r]);
    mod.writeSimRecipes([r, { ...r, id: "b", name: "y" }]);
    expect(JSON.parse(store.get(KEY + ".bak")!)).toHaveLength(1);
    store.set(KEY, "{壊れた");
    expect(mod.readSimRecipes().map((x) => x.name)).toEqual(["x"]);
  });
  it("書き出したファイルを読み込むと、無い物だけ足す (同じ物は飛ばす、id だけ同じなら別の id で)", () => {
    const a = mod.normalizeRecipe({ id: "a", name: "手袋", savedAt: 10, session: { base: "Polished Bracers" } })!;
    const b = mod.normalizeRecipe({ id: "b", name: "靴", savedAt: 20, session: { base: "Drakeskin Boots" } })!;
    const file = mod.recipesToFile([a, b]);
    expect(JSON.parse(file).kind).toBe("exiledesk-recipes");
    const r = mod.mergeRecipesFromFile(file, [a, { ...b, savedAt: 5 }]);
    expect(r.added).toBe(1); expect(r.skipped).toBe(1);
    expect(r.list).toHaveLength(3);
    expect(new Set(r.list.map((x) => x.id)).size).toBe(3);
    expect(mod.mergeRecipesFromFile("not json", [a]).bad).toBe(1);
  });
});

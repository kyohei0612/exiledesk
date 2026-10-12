/**
 * 選んだ MOD のどれか 1 つでも付く確率 (held-odds.ts の heldAnyOf、2026-10-12 要望 c9dee700)。
 * 1 つだけ足す手は確率の和、幾つも足す手・骨は打つ処理を回して数える。1 つだけ選んだ時は MOD 一覧の確率と合う
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { aimTierKey, heldAnyOf, heldOdds } from "../src/services/craft-stage/held-odds";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const A = (item: StageItem, key: string, seed = 3) => applyCurrency(data, item, key, mulberry32(seed)).item;
type H = NonNullable<ReturnType<typeof heldOdds>>;
const top = (h: H, n: number): string[] => [...h.byMod.entries()].sort((a, b) => b[1].w - a[1].w).slice(0, n).map(([id]) => id);
/** MOD の付きうる段を全部 (一覧の行のチェックと同じ) */
const all = (h: H, ids: string[]): Set<string> => new Set(ids.flatMap((id) => h.byMod.get(id)!.tiers.map((t) => aimTierKey(id, t.index))));

describe("どれか 1 つでも付く確率", () => {
  it("高貴 (1 つ足す): 選んだ物の確率の和", () => {
    const it0 = A(A(freshItem(data, "Gold Ring", 82), "transmute"), "regal");
    const h = heldOdds(data, it0, "exalt", [])!;
    const ids = top(h, 3);
    const sum = ids.reduce((a, id) => a + h.byMod.get(id)!.w / h.total, 0);
    expect(heldAnyOf(data, it0, "exalt", [], all(h, ids), h)).toBeCloseTo(sum, 10);
    // 段を 1 つだけ選べば、その段の確率
    const t0 = h.byMod.get(ids[0]!)!.tiers[0]!;
    expect(heldAnyOf(data, it0, "exalt", [], new Set([aimTierKey(ids[0]!, t0.index)]), h)).toBeCloseTo(t0.w / h.total, 10);
  });
  it("錬金 (幾つも足す): 1 つなら一覧と同じ、2 つなら和より小さく、どちらの 1 つより大きい", () => {
    const it0 = freshItem(data, "Gold Ring", 82);
    const h = heldOdds(data, it0, "alchemy", [])!;
    const [a, b] = top(h, 2) as [string, string];
    const pa = h.byMod.get(a)!.w, pb = h.byMod.get(b)!.w;
    expect(heldAnyOf(data, it0, "alchemy", [], all(h, [a]), h)).toBeCloseTo(pa, 2);
    const both = heldAnyOf(data, it0, "alchemy", [], all(h, [a, b]), h);
    expect(both).toBeGreaterThan(Math.max(pa, pb));
    expect(both).toBeLessThan(pa + pb);
  });
  it("骨 (候補 3 つ): 1 つなら一覧の確率に近い", () => {
    const it0 = A(A(freshItem(data, "Gold Ring", 82), "transmute"), "regal");
    const h = heldOdds(data, it0, "desecrate", [])!;
    const [a, b] = top(h, 2) as [string, string];
    expect(Math.abs(heldAnyOf(data, it0, "desecrate", [], all(h, [a]), h) - h.byMod.get(a)!.w)).toBeLessThan(0.04);
    expect(heldAnyOf(data, it0, "desecrate", [], all(h, [a, b]), h)).toBeGreaterThan(h.byMod.get(a)!.w - 0.04);
  });
});

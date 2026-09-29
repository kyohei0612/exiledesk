/**
 * スキン (PoE2 で使えるか) と、比べる画面の差。どちらもオーナーの実体験や撮影で確かめた答えを固定する
 */
import { describe, expect, it } from "vitest";
import mtxRaw from "../src/services/mtx/mtx.json";
import { usableInPoe2, type MtxData } from "../src/services/mtx/mtx";
import { loadPatch } from "./helpers/patch";
import { playPlan } from "../src/services/craft-stage/run-plan";
import { diffItems } from "../src/services/craft-stage/compare";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const mtx = mtxRaw as unknown as MtxData;
const byName = (en: string) => mtx.items.find((x) => x.en === en);

describe("スキン: PoE2 で使えるか (クライアントの MtxTypes 列 20)", () => {
  it("オニキスの忘却の翼は使える (オーナーが PoE2 で使えた)", () => {
    expect(usableInPoe2(byName("Onyx Oblivion Wings")!)).toBe(true);
  });
  it("ミッドナイトパクト武器エフェクトは使えない (オーナーが買って使えなかった)", () => {
    expect(usableInPoe2(byName("Midnight Pact Weapon Effect")!)).toBe(false);
  });
  it("ただの忘却の翼は PoE1 だけ、ミッドナイトパクトの翼は両方 (poe2db の一覧と一致)", () => {
    expect(usableInPoe2(byName("Oblivion Wings")!)).toBe(false);
    expect(usableInPoe2(byName("Midnight Pact Wings")!)).toBe(true);
  });
  it("載せるのは PoE1 で使える物だけ", () => {
    expect(mtx.items.every((x) => (x.p & 1) !== 0)).toBe(true);
  });
});

describe("比べる画面の差", () => {
  const data = loadPatch();
  const P = (seed: number, steps: string[]) =>
    ({ schema: "craft-stage-plan/1", base: "Gold Ring", item_level: 82, start_rarity: "normal", seed, steps: steps.map((currency) => ({ currency })) }) as unknown as CraftStagePlan;
  it("数値が 2 つある MOD (#から#) は両方の差を持つ", () => {
    const a = playPlan(data, P(4242, ["transmute", "augment", "regal", "exalt", "exalt", "exalt"]), {}).final;
    const b = playPlan(data, P(9001, ["alchemy", "exalt", "exalt"]), {}).final;
    const d = diffItems(a, b);
    const phys = d.find((x) => x.text.includes("物理ダメージをアタックに追加"));
    expect(phys?.deltas.length).toBe(2);
    expect(d.length).toBeGreaterThan(5);
  });
  it("同じアイテム同士は差が 0", () => {
    const a = playPlan(data, P(4242, ["transmute", "regal"]), {}).final;
    expect(diffItems(a, a).every((x) => x.delta === 0 && !x.only)).toBe(true);
  });
});

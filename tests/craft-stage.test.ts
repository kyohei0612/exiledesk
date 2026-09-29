/**
 * クラフトステージ (1 手ずつのカレンシー)。scripts/check-craft-stage.mjs の大事な所をテストに移した物
 * (check-craft-stage.mjs は POE2Tube の見本の手順も読むので手元でだけ回す。こちらはリポジトリの中だけで完結)
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem, runPlan } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const data = loadPatch();
const META = { prices: {}, exiledeskVersion: "test", patch: "0.5.0", league: null, generatedAt: "2026-09-29T00:00:00Z" };
const plan = (base: string, steps: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): CraftStagePlan =>
  ({ schema: "craft-stage-plan/1", base, item_level: 82, seed: 7, steps, ...extra }) as unknown as CraftStagePlan;
const A = (item: StageItem, key: string, seed = 1, hint = {}) => applyCurrency(data, item, key, mulberry32(seed), [], hint);
const rare = (base: string, lvl: number): StageItem => {
  let it = freshItem(data, base, lvl);
  for (const k of ["transmute", "regal"]) it = A(it, k, 3).item;
  return it;
};

describe("基本の流れ", () => {
  it("同じ手順・同じ seed なら同じ結果 (動画の撮り直しで変わらない)", () => {
    const p = plan("Gold Ring", [{ currency: "transmute" }, { currency: "augment" }, { currency: "regal" }, { currency: "exalt" }]);
    expect(JSON.stringify(runPlan(data, p, META))).toBe(JSON.stringify(runPlan(data, p, META)));
  });
  it("白 → 変成で青 → 王者で黄", () => {
    const r = runPlan(data, plan("Gold Ring", [{ currency: "transmute" }, { currency: "regal" }]), META);
    expect(r.steps.map((s) => s.after.rarity)).toEqual(["magic", "rare"]);
  });
  it("コラプトしたアイテムには普通のカレンシーが打てない", () => {
    expect(A({ ...rare("Gold Ring", 82), corrupted: true }, "exalt").applied).toBe(false);
  });
});

describe("アクト中に落ちる物", () => {
  it("砥石 5 回で品質 20%、6 回目は打てない", () => {
    const r = runPlan(data, plan("Hardwood Spear", [{ currency: "whetstone", times: 6 }], { item_level: 30 }), META);
    expect(r.final.quality).toBe(20);
    expect(r.steps[5]!.applied).toBe(false);
  });
  it("宝飾職人のオーブ: 見習い 3 / 上級 4 / 完全 5", () => {
    const r = runPlan(data, plan("Arc", [{ currency: "jeweller_lesser" }, { currency: "jeweller_greater" }, { currency: "jeweller_perfect" }]), META);
    expect(r.steps.map((s) => s.after.gem_sockets)).toEqual([3, 4, 5]);
  });
  it("シャードは 10 個でオーブ 1 個", () => {
    const r = runPlan(data, plan("Gold Ring", [{ currency: "regal_shard", times: 11 }]), META);
    expect(r.final.shards?.regal_shard).toBe(1);
  });
});

describe("2026-09-29 に足した物", () => {
  it("噛み切られた骨はアイテムレベル 64 以下だけ", () => {
    expect(A(rare("Gold Ring", 82), "desecrate_gnawed").applied).toBe(false);
    expect(A(rare("Gold Ring", 60), "desecrate_gnawed").applied).toBe(true);
  });
  it("秘術師の彫刻針はワンドにだけ", () => {
    expect(A(freshItem(data, "Attuned Wand", 30), "etcher").item.quality).toBe(5);
    expect(A(freshItem(data, "Hardwood Spear", 30), "etcher").applied).toBe(false);
  });
  it("インフューザーは上限 +10% まで、超えた時の outcome で コラプト / 無事", () => {
    let arm = freshItem(data, "Rusted Cuirass", 30);
    for (let i = 0; i < 4; i++) arm = A(arm, "scrap").item;
    expect(A(arm, "vaal_infuser_armour", 1, { outcome: "safe" }).item).toMatchObject({ quality: 25, corrupted: false });
    expect(A(arm, "vaal_infuser_armour", 1, { outcome: "corrupted" }).item.corrupted).toBe(true);
  });
  it("生贄のオーブはエンチャントを上位版にして MOD を 1 つ消す", () => {
    const r = { ...rare("Gold Ring", 82), corrupted: true, enchant: { id: "CorruptionAllResistances1", textJa: "x", textEn: "x" } };
    const s = A(r, "sacrifice_jewellery", 5);
    expect(s.item.enchant?.id.startsWith("CorruptionUpgrade")).toBe(true);
    expect(s.item.prefixes.length + s.item.suffixes.length).toBe(r.prefixes.length + r.suffixes.length - 1);
  });
  it("鏡の後は何も打てない、髪束の予見はアイテムが変わると消える", () => {
    expect(A(A(rare("Gold Ring", 82), "mirror").item, "exalt").applied).toBe(false);
    const h = A(rare("Gold Ring", 82), "hinekora").item;
    expect(h.foreseen).toBe(true);
    expect(A(h, "exalt", 3).item.foreseen).toBe(false);
  });
});

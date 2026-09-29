/**
 * 上位プレイヤー MOD 一覧のビルド別 (2026-09-29)。組み分けは Rust (builds.rs)、画面側は同じ集計を全体とビルドに通すだけ
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const { aggregateFromCache } = await import("../src/services/craft-v2/finalize");
import type { CachedCharacter, CraftV2Cache } from "../src/services/craft-v2/types";

const ch = (name: string, unique: string, base: string): CachedCharacter => ({
  account: "acc",
  name,
  fetched_at: 0,
  rare_items: [{ inventory_id: "Helm", explicit_mods: ["+50 to maximum Life"], base_type: "Kamasan Tiara" }],
  unique_items: [{ inventory_id: "Ring", type_line: base, base_type: base, name: unique, icon: "", implicit_mods: [], explicit_mods: [] }],
  skills: [],
});
const cache = (builds: CraftV2Cache["ascendancies"][number]["builds"]): CraftV2Cache => ({
  snapshot_version: "v",
  league_url: "vaal",
  snapshot_name: "s",
  saved_at: 0,
  ascendancies: [{ class: "Deadeye", percentage: 10, characters: [ch("a", "Ming's Heart", "Amethyst Ring"), ch("b", "Blackflame", "Amethyst Ring"), ch("c", "Ming's Heart", "Amethyst Ring")], builds }],
});

describe("ビルド別の集計", () => {
  it("ビルドがあれば、全体はビルドの人の合計、ビルドごとに同じ集計", () => {
    const [a] = aggregateFromCache(cache([
      { skill: "Ice Shot", members: ["acc|a", "acc|b"], top_dps: 34_000_000 },
      { skill: "Spark", members: ["acc|c"], top_dps: 2147483647 },
    ]));
    expect(a!.sampleSize).toBe(3);
    expect(a!.builds!.map((b) => [b.skillEn, b.agg.sampleSize])).toEqual([["Ice Shot", 2], ["Spark", 1]]);
    expect(a!.builds![1]!.topDps).toBeNull(); // トリガーの DPS は数えない
    expect(a!.builds![0]!.agg.helm.prefix[0]!.count).toBe(2);
  });
  it("旧キャッシュ (ビルド無し) は全員を 1 つとして見る", () => {
    const [a] = aggregateFromCache(cache(undefined));
    expect(a!.sampleSize).toBe(3);
    expect(a!.builds).toBeUndefined();
  });
  it("ユニークは名前で数える (同じベースの別ユニークをまとめない)", () => {
    const [a] = aggregateFromCache(cache(undefined));
    expect(a!.uniques.map((u) => [u.nameEn, u.count])).toEqual([["Ming's Heart", 2], ["Blackflame", 1]]);
  });
});

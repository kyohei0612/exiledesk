/** クラフトの決まりを変えるルーン (POE2Tube 要望 ㉙ 2026-10-04): セールの凱旋・特殊 MOD のルーン・アルダーのルーン */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { candidates, limitOf, makeStageMod, withMod } from "../src/services/craft-stage/stage-core";
import { modListFor } from "../src/services/craft-stage/mod-list";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const rare = (base: string): StageItem => ({ ...freshItem(data, base, 82), rarity: "rare", sockets: 2 });
const A = (item: StageItem, key: string, seed = 1) => applyCurrency(data, item, key, mulberry32(seed), [], {});
const add = (item: StageItem, id: string, side: "prefix" | "suffix", tierIndex = 3) => withMod(item, makeStageMod(data.mods.get(id)!, side, tierIndex, mulberry32(3)));

describe("セールの凱旋", () => {
  it("差すとレアのサフィックスの枠が 3 → 4 (プレフィックスは 3 のまま)", () => {
    const it0 = rare("Knightly Mitts");
    expect(limitOf(it0, "suffix")).toBe(3);
    const r = A(it0, "rune:Serle's Triumph");
    expect(r.applied).toBe(true);
    expect(limitOf(r.item, "suffix")).toBe(4);
    expect(limitOf(r.item, "prefix")).toBe(3);
  });
});

describe("特殊 MOD のルーン", () => {
  it("コルの狩りを差すとマークスマンの MOD が抽選の候補と付く MOD の一覧に入る (ルーンの印つき)", () => {
    const it0 = rare("Knightly Mitts");
    const has = (it: StageItem) => candidates(data, it, ["prefix", "suffix"], 0).some((c) => c.mod.rune === "kolrs-hunt");
    expect(has(it0)).toBe(false);
    const r = A(it0, "rune:Kolr's Hunt");
    expect(r.applied).toBe(true);
    expect(has(r.item)).toBe(true);
    const rows = modListFor(data, r.item).filter((x) => x.group === "rune");
    expect(rows.length).toBeGreaterThan(0);
    // 差したルーンの MOD だけ確率が出る。差していない方 (カトラの陰鬱) は 0% (2026-10-09 オーナー)
    expect(rows.filter((x) => x.socketed).every((x) => x.share > 0)).toBe(true);
    expect(rows.filter((x) => !x.socketed).every((x) => x.share === 0)).toBe(true);
    expect(rows.filter((x) => x.runeJa === "コルの狩り").every((x) => x.socketed)).toBe(true);
  });
  it("差す前から付く MOD の一覧にルーンの MOD が全部出る (差していないので 0%)", () => {
    const rows = modListFor(data, rare("Knightly Mitts")).filter((x) => x.group === "rune");
    expect(new Set(rows.map((x) => x.runeJa))).toEqual(new Set(["コルの狩り", "カトラの陰鬱"]));
    expect(rows.every((x) => x.socketed === false && x.share === 0)).toBe(true);
  });
});

describe("アルダーのルーン", () => {
  it("アルダーの情熱で冷気・雷の MOD が同じ段の火の MOD に変わる", () => {
    let it0 = rare("Gemini Bow");
    it0 = add(it0, "Bows/LocalColdDamage", "prefix");
    const before = it0.prefixes[0]!;
    const r = A(it0, "rune:Passion of Aldur");
    expect(r.applied).toBe(true);
    const after = r.item.prefixes[0]!;
    expect(after.modId).toBe("Bows/LocalFireDamage");
    expect(after.tierName).toBe(before.tierName);
    expect(after.convertedFrom).toBe(before.textJa);
    expect(r.augment?.converted?.element).toBe("fire");
  });
  it("変える物が無ければ打てない", () => {
    const r = A(rare("Gemini Bow"), "rune:Passion of Aldur");
    expect(r.applied).toBe(false);
    expect(r.reason).toContain("有効なモッド");
  });
});

describe("遺産のルーン", () => {
  it("胴に 1 つだけ差せる (アルダーの遺産の上限 1)", () => {
    const it0 = rare("Glorious Plate");
    const r = A(it0, "rune:Legacy of Bramblejack");
    expect(r.applied).toBe(true);
    const r2 = A(r.item, "rune:Legacy of Bramblejack");
    expect(r2.applied).toBe(false);
  });
});

describe("耐性のフラックス・合金 (2026-10-04 カレンシーフルチェック。合金はもともとエッセンスの棚にある)", () => {
  it("火炎フラックスで冷気耐性が火耐性に変わる", () => {
    let it0 = rare("Knightly Mitts");
    it0 = add(it0, "Gloves_str/ColdResistance", "suffix");
    const r = A(it0, "flux_fire");
    expect(r.applied).toBe(true);
    expect(r.item.suffixes[0]!.modId).toBe("Gloves_str/FireResistance");
    expect(A(rare("Knightly Mitts"), "flux_fire").applied).toBe(false);
  });
  it("合金がエッセンスの棚に並び、打てる", async () => {
    const { essenceShelf } = await import("../src/state/craft-stage-shelf");
    const keys = essenceShelf(data, rare("Knightly Mitts")).flatMap((x) => x.keys).filter((k) => data.mods.get(k.replace(/^essence:perfect:/, ""))?.alloy);
    expect(keys.length).toBeGreaterThan(0);
    let it0 = rare("Knightly Mitts");
    it0 = add(it0, "Gloves_str/ColdResistance", "suffix");
    const r = A(it0, keys[0]!);
    expect(r.applied).toBe(true);
  });
});

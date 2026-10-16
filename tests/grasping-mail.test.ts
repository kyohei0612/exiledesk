/**
 * グラスピングメイル: 鎧なのに指輪の MOD も付き、カタリストも使える (2026-10-16 要望 a286ced8「全ての元素耐性 #% が無い？」)。
 * 外の正解:
 *   - poe2db の Grasping Mail のページ「Can roll Ring Modifiers」「Catalysts can be applied to this item」
 *   - クライアント: 暗黙 ItemCanAlsoRollRingMods の adds_tags = ring (data-cache/mods.en.json)、ItemCanHaveBaseAndCatalystQuality
 *   - Craft of Exile (beta) の Grasping Mail の MOD 表 = 鎧 (STR/DEX/INT) と指輪の和から、指輪の「+# to Evasion Rating」を除いた物
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadHtcPatch } from "../src/services/htc/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { boostedMod, catalystBoosts, hasExtraCatalyst } from "../src/services/craft-stage/stage-core";
import { mulberry32 } from "../src/services/htc/rng";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import type { StageMod } from "../src/services/craft-stage/types";
import baseRows from "../src/services/htc/base-rows.json";

let data: PatchData;
beforeAll(async () => { data = await loadHtcPatch(); });

const families = (base: string, side: "prefixes" | "suffixes"): Set<string> => {
  const it = freshItem(data, base, 82);
  return new Set(it.cls.pools.normal[side].map((id) => data.mods.get(id)!.family));
};
const GRASPING = ["Grasping Mail", "Runeforged Grasping Mail", "Runemastered Grasping Mail", "Runefather's Grasping Mail"];

describe("グラスピングメイルは指輪の MOD も付く", () => {
  it("全ての元素耐性・アイテムレアリティ (指輪) と、鎧の防御の MOD が両方ある", () => {
    for (const b of GRASPING) {
      const suf = families(b, "suffixes");
      const pre = families(b, "prefixes");
      expect(suf.has("AllResistances"), b).toBe(true);
      expect(suf.has("ItemFoundRarityIncrease"), b).toBe(true);
      expect(pre.has("FireDamage"), b).toBe(true); // 指輪の「火ダメージを攻撃に追加」
      expect(pre.has("BaseLocalDefences"), b).toBe(true); // 鎧の素の防御
      expect(pre.has("IncreasedEvasionRating"), b).toBe(false); // CoE: 指輪の「+# to Evasion Rating」は出ない (spawn_weights の先頭の body_armour が 0)
    }
  });
  it("鎧の行 + 指輪の行の和 (CoE の表と同じ形)", () => {
    for (const side of ["prefixes", "suffixes"] as const) {
      const g = families("Grasping Mail", side);
      const union = new Set([...families("Grand Regalia", side), ...families("Gold Ring", side)]);
      union.delete("IncreasedEvasionRating");
      expect([...g].sort(), side).toEqual([...union].sort());
    }
  });
  it("付く重みが 0 の段は無い (指輪の MOD がちゃんと出る)", () => {
    const it0 = freshItem(data, "Grasping Mail", 82);
    for (const id of [...it0.cls.pools.normal.prefixes, ...it0.cls.pools.normal.suffixes]) {
      const m = data.mods.get(id)!;
      expect(m.tiers.some((t) => t.weight > 1), id).toBe(true);
    }
  });
  it("ほかのベースは変わらない: 同じ鎧の Grand Regalia に全ての元素耐性は無い、指輪の行に入るのは指輪だけ", () => {
    expect(families("Grand Regalia", "suffixes").has("AllResistances")).toBe(false);
    const ringRows = Object.entries(baseRows as Record<string, string>).filter(([, row]) => /_ring/.test(row)).map(([n]) => n).sort();
    expect(ringRows).toEqual([...GRASPING].sort());
  });
});

describe("グラスピングメイルはカタリストも使える (ベースの品質とは別)", () => {
  it("カタリストはカタリストの欄に入り、ベースの品質は変わらない。ほかの鎧には使えない", () => {
    expect(hasExtraCatalyst("Grasping Mail")).toBe(true);
    expect(hasExtraCatalyst("Grand Regalia")).toBe(false);
    const g = { ...freshItem(data, "Grasping Mail", 82), quality: 15 };
    const r = applyCurrency(data, g, "catalyst_life", mulberry32(1));
    expect(r.applied, r.reason).toBe(true);
    expect(r.item.catalystQuality).toBe(20);
    expect(r.item.qualityTag).toBe("life");
    expect(r.item.quality).toBe(15);
    expect(applyCurrency(data, freshItem(data, "Grand Regalia", 82), "catalyst_life", mulberry32(1)).applied).toBe(false);
  });
  it("カタリストの種類のタグを持つ MOD が伸びる (ライフのカタリストで最大ライフ)", () => {
    const g = { ...freshItem(data, "Grasping Mail", 82), catalystQuality: 20, qualityTag: "life" };
    const id = g.cls.pools.normal.prefixes.find((x) => data.mods.get(x)!.family === "IncreasedLife")!;
    expect(catalystBoosts(g, { modId: id }, "life", data)).toBe(true);
    expect(catalystBoosts(g, { modId: id }, "fire", data)).toBe(false);
    const life = { modId: id, side: "prefix", values: [100], textEn: "+100 to maximum Life", textJa: "最大ライフ +100", tierIndex: 0 } as unknown as StageMod;
    expect(boostedMod(g, life, data)?.values).toEqual([120]);
  });
});

/**
 * ベースの暗黙の「プレ / サフィ ±N 個」はマジックにも効く (2026-10-13 要望 19c7d2de: 不在のアミュレットに変成を打つとゲームでは MOD 無しのマジック)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadHtcPatch } from "../src/services/htc/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { limitOf } from "../src/services/craft-stage/stage-core";
import { mulberry32 } from "../src/services/htc/rng";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";

let data: PatchData;
beforeAll(async () => { data = await loadHtcPatch(); });

describe("暗黙の枠の増減", () => {
  it("不在のアミュレット: 変成は MOD 無しのマジック、増強は打てない、王者で 1 つ", () => {
    const t = applyCurrency(data, freshItem(data, "Absent Amulet", 82), "transmute", mulberry32(1));
    expect(t.applied).toBe(true);
    expect(t.item.rarity).toBe("magic");
    expect(t.item.prefixes.length + t.item.suffixes.length).toBe(0);
    expect(applyCurrency(data, t.item, "augment", mulberry32(2)).applied).toBe(false);
    const r = applyCurrency(data, t.item, "regal", mulberry32(3));
    expect(r.item.rarity).toBe("rare");
    expect(r.item.prefixes.length + r.item.suffixes.length).toBe(1);
  });
  it("マジックの枠 = 1 + 増減 (下限 0)、レアは 3 + 増減", () => {
    const magic = (b: string) => ({ ...freshItem(data, b, 82), rarity: "magic" as const });
    const rare = (b: string) => ({ ...freshItem(data, b, 82), rarity: "rare" as const });
    expect([limitOf(magic("Dusk Ring"), "prefix"), limitOf(magic("Dusk Ring"), "suffix")]).toEqual([2, 0]);
    expect([limitOf(magic("Penumbra Ring"), "prefix"), limitOf(magic("Penumbra Ring"), "suffix")]).toEqual([3, 0]);
    expect([limitOf(magic("Portent Amulet"), "prefix"), limitOf(magic("Portent Amulet"), "suffix")]).toEqual([1, 0]);
    expect([limitOf(rare("Absent Amulet"), "prefix"), limitOf(rare("Absent Amulet"), "suffix")]).toEqual([2, 2]);
    // 増減の暗黙が無いベースはそのまま (ジュエルのマジックも 1 / 1)
    expect([limitOf(magic("Gold Ring"), "prefix"), limitOf(magic("Gold Ring"), "suffix")]).toEqual([1, 1]);
    expect([limitOf(magic("Emerald"), "prefix"), limitOf(magic("Emerald"), "suffix")]).toEqual([1, 1]);
  });
});

import { applyRune, baseSocketsOf, runeCategoryOf, runeEffectFor, runeKeys, runeOf } from "../src/services/craft-stage/stage-runes";

describe("ソケットの物の効果を兜 / 手袋 / 靴として得るベース (2026-10-13 オーナー「ソケット系はデフォで必ず 1 個以上あいてる」)", () => {
  it("コロナのアミュレット = 兜、グラスピングリング = 手袋、ストーキングベルト = 靴。白の時からソケット 1", () => {
    const cases: Array<[string, string, string]> = [["Corona Amulet", "Amulets", "Helmets"], ["Grasping Ring", "Rings", "Gloves"], ["Stalking Belt", "Belts", "Boots"]];
    for (const [base, cat, as] of cases) {
      const it = freshItem(data, base, 82);
      expect(baseSocketsOf(base, cat), base).toBe(1);
      expect(runeCategoryOf(it), base).toBe(as);
      // その部位に効くルーンをはめると、その部位の効き目になる
      const key = runeKeys("normal").find((k) => runeEffectFor(runeOf(k)!, as));
      expect(key, base).toBeTruthy();
      const r = applyRune({ ...it, sockets: 1 }, key!, data);
      expect(r.applied, `${base} ${key} ${r.reason ?? ""}`).toBe(true);
      expect(r.item.augments?.[0]?.textEn).toBe(runeEffectFor(runeOf(key!)!, as)!.en);
    }
    // 普通の宝飾品は 0 のまま
    expect(baseSocketsOf("Gold Ring", "Rings")).toBe(0);
    expect(runeCategoryOf(freshItem(data, "Gold Ring", 82))).toBe("Rings");
  });
});

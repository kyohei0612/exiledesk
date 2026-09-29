/**
 * 名前・タグ・色の表は 1 つ (2026-09-29 統一)。同じ物を 2 か所で持たないことを押さえる
 */
import { describe, expect, it } from "vitest";
import { classJa } from "../src/services/items/base-catalog";
import { tagsOfEngineRow } from "../src/services/mods/item-class-tags";
import { tagJa, TAG_STYLE } from "../src/services/mods/tag-ja";
import { toExalted } from "../src/services/money";
import { toExalted as fromListings } from "../src/services/trade2/pricing/listings";

describe("種類の日本語 (クライアントの ItemClasses と同じ)", () => {
  it("スピア・フォーカス・鎧", () => {
    expect(classJa("Spears")).toBe("スピア");
    expect(classJa("Foci")).toBe("フォーカス");
    expect(classJa("Body_Armours", false)).toBe("鎧");
    expect(classJa("Shields", false)).toBe("盾");
    expect(classJa("Gloves_str")).toBe("手袋(str)");
    expect(classJa("Wands_fire", false)).toBe("ワンド");
  });
});

describe("種類 → タグ (表は item-class-tags の 1 つ)", () => {
  it("弓・クロスボウは ranged を持つ", () => {
    expect(tagsOfEngineRow("Bows", "Bows").has("ranged")).toBe(true);
    expect(tagsOfEngineRow("Crossbows", "Crossbows").has("ranged")).toBe(true);
  });
  it("防具・盾は行の属性で絞る (クライアントのベースのタグ)", () => {
    expect([...tagsOfEngineRow("Gloves", "Gloves_str")].sort()).toEqual(["armour", "gloves", "str_armour"]);
    expect(tagsOfEngineRow("Bucklers", "Bucklers").has("dex_armour")).toBe(true);
    expect(tagsOfEngineRow("Shields", "Shields_str_int").has("str_int_shield")).toBe(true);
    expect(tagsOfEngineRow("Body_Armours", "Body_Armours_str_dex_int").has("str_dex_int_armour")).toBe(true);
  });
});

describe("タグの日本語", () => {
  it("attribute は能力値 (計算機のカードとクラフトステージで同じ)", () => {
    expect(tagJa("attribute")).toBe("能力値");
    expect(TAG_STYLE.attribute!.ja).toBe("能力値");
    expect(TAG_STYLE.energy_shield!.ja).toBe("ES");
    expect(tagJa("energy_shield")).toBe("エナジーシールド");
  });
});

describe("換算は 1 つ", () => {
  it("取引所の取得も services/money.ts の toExalted", () => {
    expect(fromListings).toBe(toExalted);
  });
});

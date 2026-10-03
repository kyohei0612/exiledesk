/** 火力チェックの相手の装備 → クラフト計算機の貼り付け (2026-10-03、その 5) */
import { describe, expect, it } from "vitest";
import { pobRawToCopy } from "../src/services/pob-check/to-craft";
import { parseJaItem } from "../src/services/htc/paste";

const RAW = ["Rarity: RARE", "Doom Track", "Luxurious Slippers", "Unique ID: abc", "Item Level: 82", "Quality: 20", "Sockets: S S", "LevelReq: 70", "Implicits: 0",
  "{fractured}35% increased Movement Speed", "+142 to maximum Life", "{desecrated}+42% to Fire Resistance", "{rune}+12% to Cold Resistance", "{tags:life}{range:0.5}+30% to Lightning Resistance"].join("\n");

describe("PoB の文面 → ゲームのコピー", () => {
  it("札を外して注記を行末に", () => {
    const t = pobRawToCopy(RAW);
    expect(t).toContain("Luxurious Slippers");
    expect(t).toContain("Item Level: 82");
    expect(t).toContain("Quality: +20%");
    expect(t).toContain("35% increased Movement Speed (fractured)");
    expect(t).toContain("+42% to Fire Resistance (desecrated)");
    expect(t).toContain("+30% to Lightning Resistance");
    expect(t).not.toMatch(/Unique ID|LevelReq|Sockets|\{/);
  });
  it("計算機の貼り付けで読める (ベース・ilvl・MOD)", () => {
    const it = parseJaItem(pobRawToCopy(RAW));
    expect(it.baseType).toBe("Luxurious Slippers");
    expect(it.itemLevel).toBe(82);
    expect(it.lines.length).toBeGreaterThanOrEqual(4);
  });
  it("Implicits: N の後の行は (implicit)", () => {
    const t = pobRawToCopy(["Rarity: RARE", "X", "Gold Ring", "Item Level: 80", "Implicits: 1", "6% increased Rarity of Items found", "+40 to maximum Life"].join("\n"));
    expect(t).toContain("6% increased Rarity of Items found (implicit)");
    expect(t).toContain("+40 to maximum Life");
    expect(t).not.toContain("+40 to maximum Life (implicit)");
  });
});

describe("ベース名の日本語", () => {
  it("items-ja に無い新しいベースもクライアントの表から", () => {
    const it = parseJaItem(["Rarity: Rare", "X", "Runeforged Sekhema Sandals", "--------", "Item Level: 82", "--------", "+40% to Fire Resistance"].join("\n"));
    expect(it.baseText).toBe("ルーンフォージのセケマのサンダル");
  });
});

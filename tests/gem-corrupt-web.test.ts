/**
 * ジェムコラプトの Web 版 (2026-10-16): 収支の計算がアプリと同じ関数で同じ数字になるか + 手で計算できる例。
 *
 * Web は取引所を取らないので、素材はアプリで「取引所をまだ取っていない」時と同じ単価 (カレンシーの相場) になるはず。
 * 手の例の期待値は model-routes.ts の式 (ヴァール 4 系統等確率・品質 7 段・結晶の破壊 50%・外れ生存は元値の 50%) を紙で追った物。
 */
import { afterEach, describe, expect, it } from "vitest";
import { adoptMarket } from "../src/state/market-store";
import { baseGemSourceFor, materialPricesFor } from "../src/views/gem-corrupt/materials";
import { bestRoute, DEFAULT_PARAMS, evaluateRoutes, roi, type MaterialPrices, type SalePrices } from "../src/views/gem-corrupt/model";
import { webBaseGemSource, webMaterialPrices } from "../src/views/gem-corrupt/web-materials";
import { setLang } from "../src/i18n/lang";
import type { CurrencyItem, League } from "../src/api/poe2scout";

const item = (apiId: string, price: number, text = apiId): CurrencyItem => ({ ItemId: 0, CategoryApiId: "currency", Text: text, Name: null, Type: null, ApiId: apiId, CurrentPrice: price, IconUrl: "" });
const league = { Value: "Test", IsCurrent: true, DivinePrice: 300, ChaosDivinePrice: 30 } as League;

function market(): void {
  adoptMarket([league], "Test", [
    item("gcp", 1),
    item("perfect-jewellers-orb", 20),
    item("vaal", 2),
    item("crystallised-corruption", 5),
    item("uncut-skill-gem-20", 30),
    item("uncut-skill-gem-17", 10),
    item("uncut-skill-gem-15", 12),
    item("uncut-spirit-gem-20", 40),
    item("uncut-spirit-gem-18", 25),
  ]);
}

afterEach(() => setLang("ja"));

describe("ジェムコラプト Web: アプリと同じ計算", () => {
  it("素材の単価はアプリ (取引所なし) と同じ", () => {
    market();
    for (const spirit of [false, true]) {
      const app = materialPricesFor(spirit, () => null, baseGemSourceFor(spirit, "Arc"));
      const web = webMaterialPrices(spirit, webBaseGemSource(spirit, "Arc"));
      expect(web).toEqual(app);
    }
    // 低レベルの本体は原石 15〜20 の一番安い物 (スキル = lv17 の 10、スピリット = lv18 の 25)
    expect(webMaterialPrices(false, webBaseGemSource(false, "Arc")).baseGem).toBe(10);
    expect(webMaterialPrices(true, webBaseGemSource(true, "Arc")).baseGem).toBe(25);
  });

  it("経路の結果はアプリと同じ (英語でも数字は同じ)", () => {
    market();
    const sale: SalePrices = { level21: 100, quality23: 80, finished: 400 };
    const app = evaluateRoutes(materialPricesFor(false, () => null, baseGemSourceFor(false, "Arc")), sale, DEFAULT_PARAMS);
    const web = evaluateRoutes(webMaterialPrices(false, webBaseGemSource(false, "Arc")), sale, DEFAULT_PARAMS);
    expect(web).toEqual(app);
    setLang("en");
    const en = evaluateRoutes(webMaterialPrices(false, webBaseGemSource(false, "Arc")), sale, DEFAULT_PARAMS);
    expect(en.map((r) => [r.id, r.ev, r.expectedCost, r.pFinished])).toEqual(app.map((r) => [r.id, r.ev, r.expectedCost, r.pFinished]));
    expect(en.find((r) => r.id === "buyFinished")!.label).toBe("Buy finished (baseline)");
    expect(app.find((r) => r.id === "buyFinished")!.label).toBe("完成品を買う (基準)");
  });

  it("原石から作れないジェムは本体を手入力 (入れなければ自作は不足)", () => {
    market();
    const base = { apiId: null, level: null, price: null, mode: "buy" as const };
    expect(webMaterialPrices(false, base).baseGem).toBeNull();
    expect(webMaterialPrices(false, base, 50).baseGem).toBe(50);
  });
});

describe("ジェムコラプト: 手で計算できる例", () => {
  // 素材: 本体 10・プリズム 1・宝飾職人 (完全) 20・ヴァール 2・結晶 5・原石 3。売値: 21 = 100 / 23% = 80 / 完成品 = 400
  const m: MaterialPrices = { baseGem: 10, gcp: 1, perfectJeweller: 20, vaal: 2, crystal: 5, uncut20: 3 };
  const s: SalePrices = { level21: 100, quality23: 80, finished: 400 };
  const routes = evaluateRoutes(m, s, DEFAULT_PARAMS);
  const by = (id: string) => routes.find((r) => r.id === id)!;

  it("レベル 21 を買って結晶: 1/12 で完成品、5/12 で外れ (元値の半分)、1/2 で破壊", () => {
    const r = by("buy21");
    // 結晶の当たり = 生存 0.5 × 品質の 6 段のうち 1 つ = 1/12
    expect(r.expectedCost).toBeCloseTo(100 + 5, 9);
    expect(r.pFinished).toBeCloseTo(1 / 12, 9);
    expect(r.ev).toBeCloseTo((1 / 12) * 400 + (5 / 12) * 50 - 105, 9); // −50.83
  });

  it("品質 23% を買って結晶: 1/4 で完成品、1/4 で外れ、生き残った物に原石 1 個", () => {
    const r = by("buy23");
    expect(r.expectedCost).toBeCloseTo(80 + 5 + 0.5 * 3, 9); // 86.5
    expect(r.ev).toBeCloseTo(0.25 * 400 + 0.25 * 40 - 86.5, 9); // +23.5
    expect(roi(r)).toBeCloseTo(23.5 / 86.5, 9);
  });

  it("自作: 確定費用 = 本体 + プリズム 4 + 宝飾職人 + ヴァール、品質 23% の後だけ結晶を賭ける", () => {
    const r = by("craft");
    const pL = 0.25 / 2; // レベル +1
    const pQ = 0.25 / 7; // 品質 +3
    const pJ = 1 - pL - pQ;
    expect(r.upfront).toBe(10 + 4 * 1 + 20 + 2);
    // レベル 21 の後: 賭ける (−5 + 1/12 × 397 + 5/12 × 47 = 47.67) < 止める (97) → 止める
    expect(r.gambleAfterLevel).toBe(false);
    // 品質 23% の後: 賭ける (−5 + 1/4 × 397 + 1/4 × 37 = 103.5) > 止める (77) → 賭ける
    expect(r.gambleAfterQuality).toBe(true);
    const revenue = pL * 100 + pQ * 0.25 * 400 + pQ * 0.25 * 40 + pJ * 5;
    const crystals = pQ; // 品質 23% が出た時だけ 1 本
    const uncut = pL + pQ * 0.5 + pJ; // 売る物 (21・結晶で生き残った物・外れ 5 > 原石 3) に 1 個ずつ
    const cost = 36 + crystals * 5 + uncut * 3;
    expect(r.expectedCost).toBeCloseTo(cost, 9);
    expect(r.ev).toBeCloseTo(revenue - cost, 9);
    expect(r.pFinished).toBeCloseTo(pQ * 0.25, 9);
  });

  it("完成品を買うは 0 の基準、最も得は利回りの一番高い経路", () => {
    expect(by("buyFinished").ev).toBe(0);
    const best = bestRoute(routes)!;
    const rois = routes.map((r) => roi(r) ?? -Infinity);
    expect(roi(best)).toBe(Math.max(...rois));
  });
});

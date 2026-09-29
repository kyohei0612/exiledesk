/**
 * お金の表示・換算と、取引所 (trade2) の URL・リーグ名。どれもオーナーの指示や報告で決まった規則を固定する
 */
import { describe, expect, it, vi } from "vitest";

// 相場のレート (1 神 = 500 高貴、1 カオス = 7 高貴) で固定する
vi.mock("../src/state/market-store", async () => {
  const { ref } = await import("vue");
  return { marketStore: { rates: ref({ divine: 500, chaos: 7 }) } };
});

const { roundMoney } = await import("../src/state/display-currency");
const { toExalted } = await import("../src/services/trade2/pricing/listings");
const { payableUnit } = await import("../src/services/trade2/exchange");
const { snapshotNameToTradeLeague, trade2QueryUrl } = await import("../src/services/trade2/league");
const { buildUniqueNameQuery } = await import("../src/services/trade2/query/item-queries");

describe("お金の丸め (費用は切り上げ・収入は切り下げ、オーナー指示)", () => {
  it("3.1 神の費用は 4 神、12.5 神の収入は 12 神", () => {
    expect(roundMoney(3.1 * 500, "up", "divine")).toMatchObject({ value: 4, cur: "divine", exalted: 2000 });
    expect(roundMoney(12.5 * 500, "down", "divine")).toMatchObject({ value: 12, cur: "divine" });
  });
  it("60 神が小数の誤差で 59.99999 神になっても 60 神 (2026-09-20 の報告「売値 60 なのに収支は 59」)", () => {
    expect(roundMoney(29999.999, "down", "divine")?.value).toBe(60);
  });
  it("1 神に満たない額はカオス、カオスにも満たない額は高貴に落とす", () => {
    expect(roundMoney(100, "up", "divine")).toMatchObject({ cur: "chaos", value: 15 });
    expect(roundMoney(3, "up", "divine")).toMatchObject({ cur: "exalted", value: 3 });
  });
  it("高貴でも 1 に満たない額は丸めない (0.02 → 1 と 50 倍に化けないように)", () => {
    expect(roundMoney(0.02, "up", "divine")).toMatchObject({ rounded: false, exalted: 0.02 });
  });
  it("数字でない物は null", () => {
    expect(roundMoney(null, "up")).toBeNull();
    expect(roundMoney(Number.NaN, "up")).toBeNull();
  });
});

describe("換算", () => {
  const rates = { divine: 500, chaos: 7, others: { "greater-jewellers-orb": 3 } };
  it("高貴・神・カオス・その他の通貨を高貴建てに", () => {
    expect(toExalted(2, "exalted", rates)).toBe(2);
    expect(toExalted(2, "divine", rates)).toBe(1000);
    expect(toExalted(2, "chaos", rates)).toBe(14);
    expect(toExalted(2, "greater-jewellers-orb", rates)).toBe(6);
  });
  it("レートの分からない通貨は null (0 として足さない)", () => {
    expect(toExalted(2, "mirror", rates)).toBeNull();
  });
  it("1 個以上の単価は切り上げ (3.2 神 → 4 神)、1 未満の束で買う物はそのまま", () => {
    expect(payableUnit(3.2)).toBe(4);
    expect(payableUnit(4)).toBe(4);
    expect(payableUnit(0.05)).toBe(0.05);
  });
});

describe("取引所のリーグ名と URL", () => {
  it("poe2scout のリーグ名を trade2 の名前に", () => {
    expect(snapshotNameToTradeLeague("standard")).toBe("Standard");
    expect(snapshotNameToTradeLeague("hc-ssf-rise-of-the-abyssal")).toBe("HC SSF Rise of the Abyssal");
    expect(snapshotNameToTradeLeague("")).toBe("Standard");
  });
  it("検索 URL は条件を ?q= に載せる (API を叩かない)。日本の取引所なのでベース名は日本語に直す", () => {
    const url = trade2QueryUrl("Standard", { query: { type: "Gold Ring" } });
    expect(url).toContain("?q=");
    expect(decodeURIComponent(url.split("?q=")[1]!)).toContain("金の指輪");
  });
});

describe("ユニークの検索条件", () => {
  it("名前で探して安い順。ユニークだけ", () => {
    const q = buildUniqueNameQuery("Andvarius");
    expect(q.query.name.option).toBe("Andvarius");
    expect(q.sort).toEqual({ price: "asc" });
    expect(JSON.stringify(q.query.filters)).toContain("unique");
  });
  it("お気に入りの最安値 (指定なし) はコラプトを外さない / 一覧の値段はコラプトを外す (2026-09-26・28 オーナー)", () => {
    expect(JSON.stringify(buildUniqueNameQuery("Andvarius"))).not.toContain("corrupted");
    expect(JSON.stringify(buildUniqueNameQuery("Andvarius", { noCorrupted: true }))).toContain("corrupted");
  });
  it("ルーンの熟達品のような同じ名前の別物は、ベースも絞れる", () => {
    expect(buildUniqueNameQuery("Andvarius", { baseType: "Gold Ring" }).query).toMatchObject({ type: "Gold Ring" });
  });
});

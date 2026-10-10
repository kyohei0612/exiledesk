import { describe, expect, it } from "vitest";
import { fmtPct } from "../src/utils/format-pct";

// 2026-10-10 動きの揃え 5: 確率の % はエミュレーター (狙う・MOD 一覧) と同じ書き方
describe("fmtPct", () => {
  it("エミュレーターの書き方", () => {
    expect(fmtPct(0)).toBe("0%");
    expect(fmtPct(0.0000001)).toBe("<0.1%");
    expect(fmtPct(0.00099)).toBe("<0.1%");
    expect(fmtPct(0.001)).toBe("0.1%");
    expect(fmtPct(0.034)).toBe("3.4%");
    expect(fmtPct(0.09999)).toBe("10%");
    expect(fmtPct(0.1)).toBe("10%");
    expect(fmtPct(0.424)).toBe("42%");
    expect(fmtPct(0.996)).toBe("100%");
    expect(fmtPct(1)).toBe("100%");
  });
  it("0 と空の替え", () => {
    expect(fmtPct(0, { zero: "—" })).toBe("—");
    expect(fmtPct(null)).toBe("");
    expect(fmtPct(Number.NaN, { none: "?" })).toBe("?");
  });
});

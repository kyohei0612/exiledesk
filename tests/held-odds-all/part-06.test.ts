// 確率表の総当たりの 7 / 14 (ファイルを分けて vitest のワーカーで並列に回す。中身は sweep.ts、2026-10-10 オーナー「並列で試せるなら」)
import { describe, expect, it } from "vitest";
import { BASES, sweepBase } from "./sweep";

describe("確率表の総当たり (部位 × 状態 × カレンシー × お告げ)", () => {
  for (const base of BASES.filter((_, i) => i % 14 === 6)) {
    it(base, () => {
      const bad = sweepBase(base);
      expect(bad, bad.slice(0, 40).join("\n")).toEqual([]);
    }, 600_000);
  }
});

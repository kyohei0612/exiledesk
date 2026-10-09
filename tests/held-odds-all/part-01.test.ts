// 確率表の総当たりの 2 / 14 (ファイルを分けて vitest のワーカーで並列に回す。中身は sweep.ts、2026-10-10 オーナー「並列で試せるなら」)
import { describe, expect, it } from "vitest";
import { BASES, statesOf, sweepState } from "./sweep";

// ベースごとに describe、状態ごとに it (1 件が短いほど CI で詰まらない)
for (const base of BASES.filter((_, i) => i % 14 === 1)) {
  describe(`確率表の総当たり ${base}`, () => {
    for (const [st, item] of statesOf(base)) {
      it(st, async () => {
        const bad = await sweepState(item);
        expect(bad, bad.slice(0, 40).join("\n")).toEqual([]);
      }, 600_000);
    }
  });
}

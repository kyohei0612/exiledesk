// 数え上げ ⇄ 打つ処理の突き合わせの 8 / 8 (ファイルを分けて vitest のワーカーで並列に回す。中身は sweep.ts、2026-11-07 ジン jin-base)
import { afterAll, describe, expect, it } from "vitest";
import { BASES, statesOf, sweepState, type Tally } from "./sweep";

const t: Tally = { compared: 0, outside: 0, blocked: 0 };
afterAll(() => console.log(`数え上げの突き合わせ 8/8: 比べた ${t.compared}・打てない ${t.blocked}・数え上げの外 ${t.outside}`));
// ベースごとに describe、状態ごとに it (1 件が短いほど CI で詰まらない)
for (const base of BASES.filter((_, i) => i % 8 === 7)) {
  describe(`数え上げの突き合わせ ${base}`, () => {
    for (const [st, item] of statesOf(base)) {
      it(st, async () => {
        const bad = await sweepState(item, t);
        expect(bad, bad.slice(0, 40).join("\n")).toEqual([]);
      }, 600_000);
    }
  });
}

// デイリーの挑戦中の控え (D-57b) の受け口 server/live/src/daily/live.ts の上限 (11-14、1 行 4096 字・1 人 1 日 512KB)
import { describe, expect, it } from "vitest";
import { actLines, ACTS_LINE_MAX, ACTS_TOTAL_MAX } from "../server/live/src/daily/live";

/** 1 行の JSON がちょうど n 字になる動作 */
function actOf(n: number): Record<string, unknown> {
  const base = JSON.stringify({ t: 1, k: "p", s: "" }).length;
  return { t: 1, k: "p", s: "x".repeat(n - base) };
}

describe("挑戦中の控えの動作の行", () => {
  it("上限は 1 行 4096 字・1 人 1 日 512KB", () => {
    expect(ACTS_LINE_MAX).toBe(4096);
    expect(ACTS_TOTAL_MAX).toBe(512 * 1024);
  });
  it("2048 字を超え 4096 字までの行 (深い箱の決めの差分 p) は残す、4096 字を超える行は捨てる", () => {
    const out = actLines([actOf(3000), actOf(4096), actOf(4097), { t: 2, k: "hand" }]);
    const lines = out.split("\n").filter(Boolean);
    expect(lines.map((l) => l.length)).toEqual([3000, 4096, JSON.stringify({ t: 2, k: "hand" }).length]);
  });
  it("物でない物は捨て、1 回 16KB を超える分は捨てる", () => {
    const out = actLines(["x", null, 3, ...Array.from({ length: 6 }, () => actOf(4000))]);
    expect(out.split("\n").filter(Boolean).length).toBe(4);
    expect(out.length).toBeLessThanOrEqual(16 * 1024);
  });
});

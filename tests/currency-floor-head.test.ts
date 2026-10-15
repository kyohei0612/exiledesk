// 上級・完全のカレンシーのカードの頭に出す「MOD レベル ◯ 以上だけ付く」(2026-10-16 要望 9c8a5f99)。
// 数はパッチノート (0.5.0: 上級の変成 / 増強 44、上級 / 完全の高貴・王者 35 / 50) と説明の行と同じ
import { describe, expect, it } from "vitest";
import { stageFloor } from "../src/state/craft-stage-help";

describe("stageFloor", () => {
  it("上級・完全だけ下限を返す", () => {
    expect(stageFloor("transmute_greater")).toBe(44);
    expect(stageFloor("augment_perfect")).toBe(70);
    expect(stageFloor("regal_greater")).toBe(35);
    expect(stageFloor("exalt_perfect")).toBe(50);
    expect(stageFloor("chaos_greater")).toBe(35);
    expect(stageFloor("chaos_perfect")).toBe(50);
    for (const k of ["exalt", "chaos", "transmute", "annul", "essence_perfect"]) expect(stageFloor(k)).toBeNull();
  });
});

// クラフトのコース (craft-courses.ts): 元のレシピの手 (今やる手) だけで最後まで完成する。難しさ順に並ぶ
import { describe, expect, it } from "vitest";
import { loadPatch } from "../helpers/patch";
import { runQuiz, runQuizOnce } from "../../src/services/simulator/quiz-recipe";
import { CRAFT_COURSES, courseSlots } from "../../src/services/tutorial/craft-courses";

const data = loadPatch();
describe("クラフトのコース", () => {
  it("難しさ順に並ぶ・どれも完成の形がある・説明はレシピの手と同じ数まで", () => {
    expect(CRAFT_COURSES.map((c) => c.level)).toEqual([...CRAFT_COURSES.map((c) => c.level)].sort((a, b) => a - b));
    for (const c of CRAFT_COURSES) {
      expect(courseSlots(c).length).toBeGreaterThan(0);
      expect(c.why.length).toBeLessThanOrEqual(c.recipe.routes[0]!.rules.length);
    }
  });
  for (const c of CRAFT_COURSES) {
    it(`${c.id}: 今やる手だけで 200 人とも完成する`, () => {
      const r = runQuiz(data, c.recipe, 200, { price: () => 1, seed: 17 });
      expect(r.open.map((o) => o.key)).toEqual([]);
      expect(r.blocked.map((o) => o.reason)).toEqual([]);
      expect(r.pDone).toBe(1);
      // 入門〜中級は必ず付く手だけ: 200 人ともベース 1 個・同じ手数 (運で外れて打ち直す手が無い)
      if (c.level <= 3) {
        const runs = Array.from({ length: 200 }, (_, i) => runQuizOnce(data, c.recipe, 1000 + i, { price: () => 1 }));
        expect(runs.every((x) => x.done && x.bases === 1)).toBe(true);
        expect([...new Set(runs.map((x) => x.steps))]).toHaveLength(1);
      }
    }, 120000);
  }
});

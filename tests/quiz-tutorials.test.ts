// クイズのチュートリアル 4 本 (quiz-tutorials.ts): 答えの無い状況に来ずに最後まで回る・画面の進め方 (正解だけ選ぶ) で完成する
// 名前はクライアントの表 (items-ja-client.json) と棚の名前 (nameOfKey) から引けること
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runQuiz } from "../src/services/simulator/quiz-recipe";
import { QUIZ_TUTORIALS, type TutorialRule } from "../src/services/craft-stage/quiz-tutorials";
import { autoAdvance, playChoice, questionOf, startTutorial } from "../src/services/craft-stage/quiz-tutorial-run";
import { nameOfKey } from "../src/state/craft-stage-shelf";
import itemsJa from "../src/i18n/items-ja-client.json";

const data = loadPatch();
const price = (): number => 1;

describe("チュートリアルのレシピが最後まで回る", () => {
  for (const t of QUIZ_TUTORIALS) {
    it(t.id, () => {
      const res = runQuiz(data, t.recipe, Number(process.env.QUIZ_RUNS ?? 40), { price, seed: 11 });
      expect(res.open.map((o) => o.key)).toEqual([]);
      expect(res.blocked.map((o) => `${o.reason} ${o.key}`)).toEqual([]);
      expect(res.pDone).toBe(1);
    }, 120000);
  }
});

describe("画面の進め方: 正解を選ぶと、同じ答えは自動で進んで完成する", () => {
  for (const t of QUIZ_TUTORIALS) {
    it(t.id, () => {
      for (const seed of [t.seed, t.seed + 100, t.seed + 200]) {
        const st = startTutorial(data, t, seed);
        let asked = 0;
        for (let k = 0; k < 100 && !st.done && !st.stop; k++) {
          autoAdvance(data, st);
          const q = questionOf(st);
          if (!q) break;
          // 発現は「どれを選ぶ?」で毎回聞く (候補が毎回違う。2026-10-17)。当たる候補は全部正解
          if (q.reveal) {
            expect(q.choices.length).toBeGreaterThan(0);
            expect(q.choices.filter((c) => c.right).length).toBeGreaterThan(0);
            expect(q.choices.every((c) => !!c.pick)).toBe(true);
          } else {
            asked++;
            // 3 択で正解は 1 つ (2026-10-16 オーナー「○○をするには? の 3 択で明確に ○×」)
            expect(q.choices.length).toBe(3);
            expect(q.choices.filter((c) => c.right).length).toBe(1);
            expect(st.answered.has(q.rule)).toBe(false);
          }
          expect(q.choices.filter((c) => !c.right).every((c) => !!c.why)).toBe(true);
          playChoice(data, st, q, q.choices.find((c) => c.right)!);
        }
        expect(st.stop).toBeNull();
        expect(st.done).toBe(true);
        // 1 つの答えは 1 回だけ聞く
        expect(asked).toBeLessThanOrEqual(t.recipe.routes[0]!.rules.length);
      }
    }, 120000);
  }
});

describe("名前はクライアントのデータから", () => {
  const ja = itemsJa as Record<string, string>;
  it("ベースの日本語名がクライアントの表にある", () => {
    expect(QUIZ_TUTORIALS.map((t) => ja[t.recipe.base])).toEqual(["決闘のワンド", ja["Secured Wraps"], "洗練されたブリーチリング", "不在のアミュレット", "エメラルド"]);
    for (const t of QUIZ_TUTORIALS) expect(ja[t.recipe.base], t.recipe.base).toBeTruthy();
    expect(ja["Kolr's Hunt"]).toBe("コルの狩り");
    expect(ja["Astrid's Creativity"]).toBe("アストリッドの創造性");
  });
  it("答えに出るカレンシー・お告げ・エッセンス・ルーンは全部名前が引ける", () => {
    for (const t of QUIZ_TUTORIALS) {
      const st = startTutorial(data, t);
      for (const r of t.recipe.routes[0]!.rules as TutorialRule[]) {
        for (const a of [r.do, ...r.decoys.map((x) => x.do)]) {
          if (!("use" in a)) continue;
          for (const k of [a.use, ...(a.omens ?? [])]) expect(nameOfKey(k, st.item), `${t.id} ${k}`).not.toBe(k);
        }
      }
    }
  });
});

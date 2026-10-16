// クラフトのコース (craft-courses.ts): 「これで狙う」の手だけで白から打って完成する・段ごとの済みの判定
import { beforeAll, describe, expect, it } from "vitest";
import { loadHtcPatch } from "../src/services/htc/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { mulberry32 } from "../src/services/htc/rng";
import { CRAFT_COURSES, courseProgress, type CraftCourse } from "../src/services/craft-stage/craft-courses";
import { revealWanted } from "../src/services/craft-stage/quiz-recipe";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import type { StageItem } from "../src/services/craft-stage/types";

let data: PatchData;
beforeAll(async () => { data = await loadHtcPatch(); });

/** 今の段の「これで狙う」を順に打つ (発現は狙いの候補を選ぶ、無ければ 1 つ目)。外れて先へ進めない時は外れた時の道、無ければ光のお告げで消す */
function play(c: CraftCourse, seed: number, cap = 400): { done: boolean; tries: number[]; it: StageItem } {
  const g = mulberry32(seed);
  let it = freshItem(data, c.base, c.itemLevel);
  const tries = c.steps.map(() => 0);
  for (let n = 0; n < cap; n++) {
    const done = courseProgress(c, it);
    const cur = done.findIndex((d) => !d);
    if (cur < 0) return { done: true, tries, it };
    const st = c.steps[cur]!;
    tries[cur]!++;
    for (const u of st.how) {
      if (u.key === "reveal") {
        if (!it.prefixes.concat(it.suffixes).some((m) => m.unrevealed)) continue;
        const rs = Math.floor(g() * 2 ** 31);
        const o = revealOffers(data, it, mulberry32(rs));
        const want = revealWanted(it, c.steps.flatMap((x) => x.slots ?? []));
        const i = Math.max(0, o.first.findIndex(want));
        it = applyCurrency(data, it, `reveal:${i + 1}`, mulberry32(rs)).item;
        continue;
      }
      const r = applyCurrency(data, it, u.key, g, u.omens ?? []);
      if (r.applied) it = r.item;
    }
    // 進めない時は案内の「外れたら」の道
    if (!courseProgress(c, it)[cur] && st.miss) for (const u of st.miss.how) { const r = applyCurrency(data, it, u.key, g, u.omens ?? []); if (r.applied) it = r.item; }
    // 冒涜の外れ (狙い以外の冒涜が付いた) は光のお告げで消す
    if (!courseProgress(c, it)[cur] && it.prefixes.concat(it.suffixes).some((m) => m.desecrated && !m.unrevealed)) {
      const r = applyCurrency(data, it, "annul", g, ["OmenofLight"]);
      if (r.applied) it = r.item;
    }
  }
  return { done: false, tries, it };
}

describe("クラフトのコース", () => {
  for (const c of CRAFT_COURSES) {
    it(`${c.id}: 案内の手だけで 100 個とも完成する`, () => {
      const per = c.steps.map(() => [] as number[]);
      let ok = 0;
      for (let s = 1; s <= 100; s++) { const r = play(c, s); if (r.done) ok++; r.tries.forEach((t, i) => per[i]!.push(t)); }
      const avg = per.map((xs) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2));
      console.log(`${c.id}: 完成 ${ok}/100 · 段ごとの平均の回数 ${avg.join(" / ")}`);
      expect(ok).toBe(100);
    }, 120000);
  }
});

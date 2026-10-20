// 動作を学ぶコース (topic-courses.ts): 並べた手を順に打つと、どの手も必ず打てる (200 回)
import { beforeAll, describe, expect, it } from "vitest";
import { loadHtcPatch } from "../../src/services/htc/patch";
import { freshItem, startFrom } from "../../src/services/craft-stage/run-plan";
import { applyCurrency } from "../../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../../src/services/htc/rng";
import { fullSockets } from "../../src/state/stage-steps";
import { TOPIC_COURSES, topicKey } from "../../src/services/tutorial/topic-courses";
import type { PatchData } from "../../src/vendor/poe2htc/engine/types";

let data: PatchData;
beforeAll(async () => { data = await loadHtcPatch(); });

describe("動作を学ぶコース", () => {
  for (const c of TOPIC_COURSES) {
    it(`${c.id}: 順に打つと、どの手も必ず打てる`, () => {
      const fails: Record<string, number> = {};
      for (let seed = 1; seed <= 200; seed++) {
        const g = mulberry32(seed);
        let it = fullSockets(freshItem(data, c.base, c.itemLevel));
        c.steps.forEach((st, i) => {
          if (st.use === "reset") { it = fullSockets(freshItem(data, st.base ?? c.base, c.itemLevel)); return; }
          // 付ける手は MOD 0 個のそのレア度から、ほかは打てない時に prep の手で打てる状態を作る (craft-lesson.ts の prepareStep と同じ)
          if (st.start && !st.prep) it = fullSockets(st.startMods ? startFrom(data, st.base ?? c.base, c.itemLevel, { rarity: st.start, mods: st.startMods }, seed) : freshItem(data, st.base ?? c.base, c.itemLevel, st.start));
          if (st.prep && (st.prepAlways || !applyCurrency(data, it, topicKey(st, data, it) ?? "", mulberry32(seed), st.omens ?? []).applied)) {
            it = fullSockets(st.startMods ? startFrom(data, st.base ?? c.base, c.itemLevel, { rarity: st.start ?? "rare", mods: st.startMods }, seed) : freshItem(data, st.base ?? c.base, c.itemLevel, st.start));
            for (const k of st.prep) { const p = applyCurrency(data, it, k, g, []); if (p.applied) it = p.item; }
          }
          const key = topicKey(st, data, it);
          const r = key ? applyCurrency(data, it, key, g, st.omens ?? []) : null;
          if (!r?.applied) { const k = `${i + 1}:${st.use} ${r?.reason ?? "キーが無い"}`; fails[k] = (fails[k] ?? 0) + 1; return; }
          it = r.item;
        });
      }
      expect(fails).toEqual({});
    }, 120000);
  }
});

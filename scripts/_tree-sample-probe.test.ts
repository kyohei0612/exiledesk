/**
 * _tree-sample-probe.test.ts — 見本の木 (tree-samples.ts) の箱ごとの見本の出来とルート精査を並べる台本 (2026-10-21 シミュ部長 4 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-sample-probe.config.ts
 *
 * 見る物: 見本が引けなかった箱 (note = none / forced / cant)・ルート精査の穴・形の合う箱へ の行き先・100 人回した時の止まり (値段 0)。合否は付けない (並べるだけ。見張りではない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { sampleOf } from "../src/services/simulator/tree/tree-sample";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { treeSample, TREE_SAMPLES } from "../src/services/simulator/tree/tree-samples";
import { MATCH, matchTargets, runTree } from "../src/services/simulator/tree/tree-run";

const data = loadPatch();

it("見本の木", () => {
  for (const name of TREE_SAMPLES) {
    const doc = treeSample(name)!;
    console.log(`== ${name} (${Object.keys(doc.boxes).length} 箱)`);
    for (const id of Object.keys(doc.boxes)) {
      const t0 = performance.now();
      const s = sampleOf(data, doc, id, 1);
      const mods = [...s.item.prefixes, ...s.item.suffixes].map((m) => `${m.modId.replace("Rings/", "")}${m.fractured ? "(f)" : ""} ${m.tierName}`).join(", ");
      console.log(`${id.padEnd(6)} ${s.note ?? "ok"} ${Math.round(performance.now() - t0)}ms  ${mods}`);
    }
    const t0 = performance.now();
    const issues = checkTree(data, doc);
    console.log(`精査 ${Math.round(performance.now() - t0)}ms 穴 ${issues.length}`);
    for (const x of issues) console.log(`  ! ${x.boxId} ${x.kind} ${x.text}`);
    for (const b of Object.values(doc.boxes)) if (b.back === MATCH) console.log(`  ↩ ${b.id} → ${matchTargets(doc, b.id).map((x) => `${x.to ?? "無し"} (${x.key})`).join(" / ")}`);
    const r = runTree(data, doc, { n: 100, seed: 1, price: () => 0 });
    console.log(`100 人: 完成 ${r.finished} · 打ち止め ${r.capped} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
  }
});

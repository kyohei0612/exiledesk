/**
 * _tree-prefix-cost-probe.test.ts — 見本の木のプレフィックス P2 (案 3) の費用を、解析君の台本の数字と比べる台本 (2026-10-22 シミュ部長 6 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-prefix-cost-probe.config.ts   (人数は N=、既定 3000。種は SEED=、既定 1)
 *
 * 100 人回し (tree-run の runTree) の 1 人あたりの手の数に、解析君の docs/org/math/notes/2026-10-22-gold-ring-prefix.md と同じ値段 (高貴建て、神 = 807.07) を掛ける。
 * 数えるのは P2 の手だけ (素の高貴・アビスのエッセンス・左側の結晶化・削減・完全のカオス)。冒涜 (P3) とサフィックスの手は入れない。
 * 比べる相手: 解析君の案 3・餌 = アビスのエッセンス、3,000 人 seed 1 で 完成した人の平均 445.1 神 (±約 14.5)。合否は付けない (並べるだけ)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

const data = loadPatch();
const DIV = 807.07;
const PRICE: Record<string, number> = {
  exalt: 1, chaos_perfect: 5922.7, OmenofWhittling: 11035.0, OmenofSinistralCrystallisation: 316.321, "essence:perfect:Rings/PerfectEssence_EssenceAbyss": 221.412,
};

it("プレフィックス P2 の費用", () => {
  const doc = treeSample("gold-ring-suffix")!;
  const N = Number(process.env.N ?? 3000), seed = Number(process.env.SEED ?? 1);
  const r = runTree(data, doc, { n: N, seed, price: () => 0 });
  const per = Object.entries(PRICE).map(([k, p]) => ({ k, n: r.uses[k] ?? 0, div: ((r.uses[k] ?? 0) * p) / DIV }));
  const total = per.reduce((a, x) => a + x.div, 0);
  console.log(`${N} 人 (seed ${seed}): 完成 ${r.finished} · 打ち止め ${r.capped} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
  for (const x of per) console.log(`  ${x.k.padEnd(52)} 1 人 ${x.n.toFixed(2)} 個  ${x.div.toFixed(1)} 神`);
  console.log(`P2 の費用 1 人あたり ${total.toFixed(1)} 神 (解析君の案 3・アビス seed 1 の完成した人の平均 445.1 神 ±14.5)`);
});

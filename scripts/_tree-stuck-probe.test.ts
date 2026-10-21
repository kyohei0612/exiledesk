/**
 * _tree-stuck-probe.test.ts — 見本の木を n 人回して、止まった人の最後の手・前後のアイテム・結果の分け方を出す台本 (2026-10-22 シミュ部長 7 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-stuck-probe.config.ts   (人数は N=、既定 3000。種は SEED=、既定 1)
 *
 * tree-sample の playHand・outcomeOf を包んで最後の呼び出しを覚え、1 人ごとの途中の結果 (onProgress) で止まりが増えた人を出す。
 */
import { it, vi } from "vitest";
import { loadPatch } from "../tests/helpers/patch";

const log: string[] = [];
const last: { hand?: unknown; before?: unknown; after?: unknown; applied?: boolean; oc?: unknown } = {};
vi.mock("../src/services/simulator/tree/tree-sample", async (orig) => {
  const m = await orig<typeof import("../src/services/simulator/tree/tree-sample")>();
  return {
    ...m,
    playHand: (...a: Parameters<typeof m.playHand>) => { const r = m.playHand(...a); Object.assign(last, { hand: a[2], before: a[1], after: r.item, applied: r.applied, oc: undefined }); log.push(`${a[2].currency}+${a[2].omens.join("+")}${a[2].catalyst ? "/" + a[2].catalyst : ""} → ${mods(r.item)}`); return r; },
    outcomeOf: (...a: Parameters<typeof m.outcomeOf>) => { const r = m.outcomeOf(...a); last.oc = r; return r; },
  };
});

const mods = (it: any): string => it ? [...it.prefixes.map((m: any) => `P:${m.modId ?? m.id}${m.tier ? "/T" + m.tier : ""}${m.fractured ? "(F)" : ""}${m.hidden || m.unrevealed ? "(?)" : ""}`), ...it.suffixes.map((m: any) => `S:${m.modId ?? m.id}${m.tier ? "/T" + m.tier : ""}${m.fractured ? "(F)" : ""}${m.hidden || m.unrevealed ? "(?)" : ""}`)].join("  ") + ` q${it.quality ?? 0}` : "-";

it("止まった人の中身", async () => {
  const { runTree } = await import("../src/services/simulator/tree/tree-run");
  const { treeSample } = await import("../src/services/simulator/tree/tree-samples");
  const data = loadPatch();
  const doc = treeSample("gold-ring-suffix")!;
  const N = Number(process.env.N ?? 3000), seed = Number(process.env.SEED ?? 1);
  let prev = 0, i = 0;
  const r = runTree(data, doc, {
    n: N, seed, price: () => 0, every: 1,
    onProgress: (x) => {
      i++;
      const L = log.splice(0); if (x.stuck > prev) { log.push(...L);
        prev = x.stuck;
        const at = Object.keys(x.stuckAt).join(",");
        console.log(log.slice(-14).join("\n"));
        console.log(`#${i} 止まり (${JSON.stringify(x.stuckAt)}) applied=${last.applied} oc=${JSON.stringify(last.oc)}\n  手 ${JSON.stringify(last.hand)}\n  前 ${mods(last.before)}\n  後 ${mods(last.after)}\n  at候補 ${at}`);
      log.length = 0; }
    },
  });
  console.log(`${N} 人 (seed ${seed}): 完成 ${r.finished} · 打ち止め ${r.capped} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
});

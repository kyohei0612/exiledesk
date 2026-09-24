/**
 * auto-pick.ts — 自動で組むツリーの候補をいくつか作り、短く回して安い方を採る (2026-09-24)
 *
 * オーナー:「(偉大なる高貴のお告げは) 他にも使えそうな場面があるなら計算して」。偉大なる高貴の使い方は指輪によって得な方が
 * 違った (段は問わず: 死体の円環 カタリストが同じ時だけ 135 神 / 同じ側をまとめる 490 神、金の指輪 1,466 / 1,339 神)。
 * なので両方組んで、完成 90% 以上の中で平均の安い方 (どれも届かなければ完成の多い方)。
 */
import { simulateTreeChunked, type SimNode, type SimState } from "../../services/htc/sim-route";
import { autoTree, chaosSideFor, type AutoTreeInput } from "./tree-auto";
import { spawnChance } from "./craft-estimate";
import type { useHtcCraft } from "./useHtcCraft";

type Ctx = Parameters<typeof simulateTreeChunked>[0]["ctx"];

/** 比べる時の回す回数 (候補ごと) */
const PICK_RUNS = 150;

export async function pickAutoTree(inp: AutoTreeInput, ctx: Ctx, start: SimState): Promise<{ nodes: SimNode[]; greater: string }> {
  const variants = (["catalyst", "all"] as const).map((g) => ({ greater: g, nodes: autoTree({ ...inp, greater: g }) }));
  // 同じ形になった候補は 1 つにする (回す手間の節約)
  const uniq = variants.filter((v, i) => variants.findIndex((w) => JSON.stringify(w.nodes) === JSON.stringify(v.nodes)) === i);
  if (uniq.length === 1) return uniq[0]!;
  const scored: Array<{ v: (typeof uniq)[number]; pDone: number; expected: number }> = [];
  for (const v of uniq) {
    const r = await simulateTreeChunked({ ctx, start, nodes: v.nodes, runs: PICK_RUNS });
    scored.push({ v, pDone: r.pDone, expected: r.expected });
  }
  const ok = scored.filter((x) => x.pDone >= 0.9);
  const best = ok.length ? ok.reduce((a, b) => (b.expected < a.expected ? b : a)) : scored.reduce((a, b) => (b.pDone > a.pDone ? b : a));
  return best.v;
}

/** 自動で組む入力を、計算機の状態と開始の指輪から作る (作り方のツリーと作る見込みで共通) */
export function autoInputFor(c: ReturnType<typeof useHtcCraft>, ctx: Ctx, start: SimState, fixedIds: readonly string[]): AutoTreeInput | null {
  const d = c.data.value, p = c.prices.value;
  if (!d || !p) return null;
  return {
    data: d, prices: p, targets: c.targets.value, fixedIds,
    qualityTag: c.item.value?.catalystTag ?? null,
    qualityPct: c.item.value?.quality ?? null,
    baseQuality: ctx.baseQuality,
    chaosOk: !start.slots.some((x) => x.keep),
    protectedSides: [...new Set(start.slots.filter((x) => x.keep).map((x) => x.side))],
    desecratedTaken: start.slots.some((x) => x.desec),
    chaosSide: chaosSideFor(start, ctx.limits),
    chance: (t) => spawnChance(c, t.modId, t.minTierIndex ?? 0),
    limits: ctx.limits,
    fixedSides: [...new Set(start.slots.filter((x) => x.fixed).map((x) => x.side))],
  };
}

/**
 * auto-pick.ts — 自動で組むツリーの候補をいくつか作り、短く回して安い方を採る (2026-09-24)
 *
 * オーナー:「(偉大なる高貴のお告げは) 他にも使えそうな場面があるなら計算して」。偉大なる高貴の使い方は指輪によって得な方が
 * 違った (段は問わず: 死体の円環 カタリストが同じ時だけ 135 神 / 同じ側をまとめる 490 神、金の指輪 1,466 / 1,339 神)。
 * なので両方組んで、完成 90% 以上の中で平均の安い方 (どれも届かなければ完成の多い方)。カオスを使う / 使わないも同じく比べる。
 */
import { simulateTreeChunked, type SimNode, type SimState } from "../../services/htc/sim-route";
import { autoTree, chaosSideFor, type AutoTreeInput } from "./tree-auto";
import { spawnChance } from "./craft-estimate";
import type { useHtcCraft } from "./useHtcCraft";

type Ctx = Parameters<typeof simulateTreeChunked>[0]["ctx"];

/** 比べる時の回す回数 (候補ごと) */
const PICK_RUNS = 150;

export async function pickAutoTree(inp: AutoTreeInput, ctx: Ctx, start: SimState): Promise<{ nodes: SimNode[]; greater: string }> {
  // 偉大なる高貴の使い方 × カオスを使うか。カオスは付く確率の低い狙いだと割に合わない (不在のアミュレットのクリティカル率
  // T1 = 0.1% をカオスで狙って 1.5 万回打ち、58% が手数の上限。2026-09-24)
  const chaosVariants = inp.chaosOk || inp.chaosSide ? [true, false] : [false];
  // 両側とも 2 枠以下 (不在のアミュレット) は、側の消去 (確定で外れだけ) と素の消去 (安いが狙いを時々消す) も比べる。
  // 2026-09-24 不在 (スキルレベル固定): 品質 40% の形は側の消去で 4,127 神・素は 82% 止まり / 品質無しは素 2,387 神・側 5,101 神
  const narrow = inp.limits && inp.limits.prefix <= 2 && inp.limits.suffix <= 2;
  const annuls = narrow ? (["side", "plain"] as const) : ([undefined] as const);
  // 冒涜の骨も比べる (古代の鎖骨は出る物を絞れるが高い。知性のような重い MOD は普通の骨の方が安かった)
  const bones = [undefined, "preserved"] as const;
  // 冒涜の外れの回し方も比べる (固定 1 + 外れ 1 の枠 2 つの側がある時だけ、上書きと光の両方を組む)。
  // オーナー 2026-09-25:「安いリロール優先。骨も光を使うなら古代が良かったりする。確率計算で判断して」
  const canOverwrite = !!inp.limits && (inp.fixedSides ?? []).some((sd) => inp.limits![sd] === 2);
  const rerolls = canOverwrite ? (["overwrite", "light"] as const) : ([undefined] as const);
  const variants = (["catalyst", "all"] as const).flatMap((g) => chaosVariants.flatMap((ch) => annuls.flatMap((an) => bones.flatMap((bn) => rerolls.map((rr) => ({
    greater: `${g}${ch ? "" : "・カオス無し"}${an === "plain" ? "・素の消去" : ""}${bn ? "・普通の骨" : ""}${rr === "light" ? "・光で回す" : ""}`,
    nodes: autoTree({ ...inp, greater: g, ...(an ? { annul: an } : {}), ...(bn ? { bone: bn } : {}), ...(rr ? { reroll: rr } : {}), ...(ch ? {} : { chaosOk: false, chaosSide: null }) }),
  }))))));
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
    startCount: { prefix: start.slots.filter((x) => x.side === "prefix").length, suffix: start.slots.filter((x) => x.side === "suffix").length },
    startLoose: { prefix: start.slots.filter((x) => x.side === "prefix" && !x.fixed).length, suffix: start.slots.filter((x) => x.side === "suffix" && !x.fixed).length },
  };
}

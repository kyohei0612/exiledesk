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
import { planByRedoCost, type RedoPlan } from "./redo-cost";
import type { useHtcCraft } from "./useHtcCraft";

type Ctx = Parameters<typeof simulateTreeChunked>[0]["ctx"];

/** 比べる時の回す回数 (候補ごと) */
const PICK_RUNS = 150;

export interface AutoPick { nodes: SimNode[]; greater: string; plan: RedoPlan | null; /** 比べた時の平均 (高貴建て) と完成の割合 (候補が 1 つなら null) */ simExpected: number | null; simDone: number | null }

export async function pickAutoTree(inp: AutoTreeInput, ctx: Ctx, start: SimState): Promise<AutoPick> {
  // やり直しの費用から取り方を決める ([[redo-cost.ts]])。カオスで引く物・冒涜に回す物・骨・外れの回し方はここで決め、
  // 残り (偉大なる高貴の使い方、側の消去か素の消去か) はシミュレーターで比べる。決めた物が組めない時の保険に、
  // 今までの決め打ち (一番出にくい物をカオス・冒涜) も候補に入れる
  const plan = planByRedoCost(inp, ctx.cls, ctx.itemLevel);
  const chaosVariants = inp.chaosOk || inp.chaosSide ? [true, false] : [false];
  // 外れの消し方 (側のお告げ / 素の消去) も候補にする。見積もりの側ごとの選択に加え、全部側 / 全部素 も比べる
  // 候補が多いと組むのに数分かかる (30 通り × 150 回)。見積もりの側ごと (undefined) と 素の消去 の 2 通り
  const annuls = ([undefined, "plain"] as const);
  const canOverwrite = !!inp.limits && (inp.fixedSides ?? []).some((sd) => inp.limits![sd] === 2);
  const picks: Array<Partial<AutoTreeInput> & { label: string }> = [];
  if (plan) picks.push({ label: "やり直しの費用から", chaosPick: plan.chaosPick, desecratePick: plan.desecratePick, exaltTiers: plan.exaltTiers, annul: plan.annulSides, ...(plan.reroll ? { reroll: plan.reroll } : {}), ...(plan.bone ? { bone: plan.bone } : {}), ...(plan.chaosPick ? {} : { chaosOk: false, chaosSide: null }) });
  // 決め打ちの骨は、上書きの輪が組める形 (固定 1 + 外れ 1 の枠 2 つの側) だけ普通の骨も試す (天体で回すなら普通の骨が安い)
  const bones = canOverwrite ? ([undefined, "preserved"] as const) : ([undefined] as const);
  for (const ch of chaosVariants) for (const bn of bones) picks.push({ label: `決め打ち${ch ? "" : "・カオス無し"}${bn ? "・普通の骨" : ""}`, ...(bn ? { bone: bn } : {}), ...(ch ? {} : { chaosOk: false, chaosSide: null }) });
  const variants = picks.flatMap((pk) => (["catalyst", "all"] as const).flatMap((g) => annuls.map((an) => ({
    greater: `${pk.label}・${g}${an === "plain" ? "・素の消去" : an === "side" ? "・側の消去" : pk.annul ? "・側ごと" : ""}`,
    nodes: autoTree({ ...inp, ...pk, greater: g, ...(an ? { annul: an } : {}) }),
  }))));
  // 同じ形になった候補は 1 つにする (回す手間の節約)
  const uniq = variants.filter((v, i) => variants.findIndex((w) => JSON.stringify(w.nodes) === JSON.stringify(v.nodes)) === i);
  if (uniq.length === 1) return { ...uniq[0]!, plan, simExpected: null, simDone: null };
  const scored: Array<{ v: (typeof uniq)[number]; pDone: number; expected: number }> = [];
  for (const v of uniq) {
    const r = await simulateTreeChunked({ ctx, start, nodes: v.nodes, runs: PICK_RUNS });
    scored.push({ v, pDone: r.pDone, expected: r.perDone });
  }
  const ok = scored.filter((x) => x.pDone >= 0.9);
  const best = ok.length ? ok.reduce((a, b) => (b.expected < a.expected ? b : a)) : scored.reduce((a, b) => (b.pDone > a.pDone ? b : a));
  return { ...best.v, plan, simExpected: best.expected, simDone: best.pDone };
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
    startKeep: { prefix: start.slots.filter((x) => x.side === "prefix" && x.keep && !x.modId).length, suffix: start.slots.filter((x) => x.side === "suffix" && x.keep && !x.modId).length },
  };
}

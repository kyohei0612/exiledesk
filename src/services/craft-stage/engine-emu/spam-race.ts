/**
 * spam-race.ts — スパムシミュレーター (エミュの画面) の 100 人の競争・その行の形・シェアの包み (2026-10-23 route-race.ts から分けた。
 * エミュの要望の機能なので engine-emu/。打つ処理は核の route-race の routeRun のまま)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { mulberry32 } from "../../htc/rng";
import type { StageItem } from "../types";
import { routeOff, routeRun, routeSeed, targetSides, type Grade, type RaceTarget, type RouteKind, type RoutePrep } from "../route-race";

/**
 * シェアに入れる計算済みの結果 (開いた人は計算せずにこれを出して、すぐ運試し。2026-10-19 オーナー「シェア押したら即運試しのページで計算済みのを出して」)。
 * r = 道ごとの [道, 等級, 使えない理由, 平均の費用, 平均の手数, 半分, 9 割, 使った物, 当たりごとの人数 (当たりが 2 つ以上の時だけ)]、l = 運試しの道と等級、t = その道の着いた人の手数、n = 人数
 */
export interface SharedRace { r: Array<[RouteKind, Grade, string | null, number, number, number, number, Record<string, number>, number[]?]>; l: [RouteKind, Grade]; t: number[]; n: number }
export function packRace(rows: readonly RaceRow[], luck: RaceRow): SharedRace {
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  return {
    r: rows.map((x) => [x.route, x.grade, x.off, r2(x.avgCost), r2(x.avgSteps), r2(x.p50), r2(x.p90), Object.fromEntries(Object.entries(x.uses).map(([k, v]) => [k, r2(v)])), ...(x.hitsBy.length > 1 ? [x.hitsBy] : [])] as SharedRace["r"][number]),
    l: [luck.route, luck.grade], t: luck.tries, n: luck.people,
  };
}
export function unpackRace(s: SharedRace): RaceRow[] {
  return s.r.map(([route, grade, off, avgCost, avgSteps, p50, p90, uses, hitsBy]) => {
    const isLuck = route === s.l[0] && grade === s.l[1];
    return { route, grade, off, hitRate: isLuck ? s.t.length / s.n : off ? 0 : 1, avgCost, avgSteps, p50, p90, uses, tries: isLuck ? s.t : [], people: s.n, hitsBy: hitsBy ?? [] };
  });
}
export interface RaceRow {
  route: RouteKind; grade: Grade;
  /** 使えない理由 (マジックに枠が無い など)。使える時は null */
  off: string | null;
  /** 上限までに着いた割合 */
  hitRate: number;
  /** 着いた人の平均の費用・回数 (打った手の数)、運の幅 (半分 / 9 割の人が着く費用) */
  avgCost: number; avgSteps: number; p50: number; p90: number;
  /** 1 人あたり平均で使った物 (鍵 → 個数) */
  uses: Record<string, number>;
  /** 着いた人の手数 (小さい順) と人数 (運試しの順位に使う、chaos-spam.ts の SpamStats と同じ形) */
  tries: number[]; people: number;
  /** 当たりごとの着いた人数 (targets と同じ順。どの当たりで止まったかの内訳) */
  hitsBy: number[];
  /** 増強の道で当たりがプレとサフィの両方にある時: 両方揃うまで (プレ 1 + サフィ 1) の数字。それ以外は無し */
  both?: RaceStats;
}
/** 着いた人の数字 (着いた割合・平均の費用と手数・半分 / 9 割の人が着く費用) */
export interface RaceStats { hitRate: number; avgCost: number; avgSteps: number; p50: number; p90: number }

/**
 * 1 通り (道 × 等級) を runs 人分打つ。打つのは重い (1 人で数百〜数千手) ので、sliceMs ごとに画面へ手を返す
 * (2026-10-19 スマホ相当 = CPU 4 倍遅くで、まとめて打つと画面が最長 8.9 秒固まった)。stop() が true になったら null で止める
 */
export async function raceOne(data: PatchData, base: string, itemLevel: number, targets: readonly RaceTarget[], price: (key: string) => number, route: RouteKind, grade: Grade,
  opts: { runs: number; maxSteps?: number; seed?: number; prep?: RoutePrep; from?: StageItem; stop?: () => boolean; sliceMs?: number; /** 1 人終わるごと (読み込み中の n/m) */ onPerson?: (done: number) => void }): Promise<RaceRow | null> {
  const runs = opts.runs, maxSteps = opts.maxSteps ?? 3000, sliceMs = opts.sliceMs ?? 25;
  const off = routeOff(data, base, itemLevel, targets, route, opts.prep, opts.from);
  if (off) return { route, grade, off, hitRate: 0, avgCost: 0, avgSteps: 0, p50: 0, p90: 0, uses: {}, tries: [], people: runs, hitsBy: targets.map(() => 0) };
  let t0 = performance.now();
  const breathe = async (): Promise<boolean> => {
    if (performance.now() - t0 < sliceMs) return true;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
    return !opts.stop?.();
  };
  /** runs 人分を need の所まで打つ (同じ種なので any と both は同じ人が打つ) */
  const people = async (need: "any" | "both") => {
    const costs: number[] = [], steps: number[] = [];
    const hitsBy = targets.map(() => 0);
    const uses: Record<string, number> = {};
    for (let r = 0; r < runs; r++) {
      const rng = mulberry32(routeSeed(opts.seed, r, route, grade));
      const run = routeRun(data, base, itemLevel, targets, route, grade, rng, price, opts.prep, opts.from, need);
      if (!run) continue;
      while (run.n < maxSteps && !run.hit()) {
        if (!run.step()) break;
        if ((run.n & 15) === 0 && !(await breathe())) return null;
      }
      for (const [k, v] of Object.entries(run.uses)) uses[k] = (uses[k] ?? 0) + v;
      if (run.hit()) { costs.push(run.cost); steps.push(run.n); const hi = run.hitIndex(); if (hi >= 0) hitsBy[hi]!++; }
      if (need === "any") opts.onPerson?.(r + 1);
      if (!(await breathe())) return null;
    }
    costs.sort((a, b) => a - b);
    const at = (q: number) => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(q * costs.length))]! : 0);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    for (const k of Object.keys(uses)) uses[k] = uses[k]! / runs;
    const stats: RaceStats = { hitRate: steps.length / runs, avgCost: avg(costs), avgSteps: avg(steps), p50: at(0.5), p90: at(0.9) };
    return { stats, steps, uses, hitsBy };
  };
  const one = await people("any");
  if (!one) return null;
  const both = route === "augment" && targetSides(data, targets).length > 1 ? await people("both") : undefined;
  if (both === null) return null;
  return { route, grade, off: one.steps.length === 0 ? "上限の手数までに付かなかった (この等級では付かない段かも)" : null, ...one.stats, uses: one.uses, tries: [...one.steps].sort((a, b) => a - b), people: runs, hitsBy: one.hitsBy, ...(both ? { both: both.stats } : {}) };
}

/**
 * route-race.ts — 狙いの MOD 1 つに、どのスパムが一番早く・安く着くか (2026-10-18 オーナー「エミュレーターに簡易シミュレーターページ。
 * 1 MOD を対象にどのルートが一番早く着くか。要はスパム。冒涜スパムは無し。高貴・増強・カオスのスパム」)。
 *
 * 打つのは全部エミュレーターと同じ applyCurrency (決まりはエンジンのまま)。白のベースから、等級 (無印 / 上級 / 完全) ごとに runs 人分打って平均を出す。
 * 白のベース代はどの道でも同じなので入れない。
 *   - 増強スパム: 変成でマジック → 狙いの側に狙い以外が付いていれば消去 (狙いの側が空くまで)、空いていれば増強 (狙いの側に付くまで) を、狙いが付くまで繰り返す。
 *     (オーナー「狙いたい側の接辞が消えるまで消去、増強は狙いたい側の接辞が付くまで増強、これを一生繰り返す」)。マジックに狙いの側の枠が無いベースは使えない
 *   - カオススパム: MOD 1 つのレアから、狙いが付くまでカオス (1 つ消えて 1 つ付くので MOD は 1 つのまま)
 *   - 高貴スパム: MOD 0 のレアから、高貴 + 偉大な高貴のお告げで 2 つ付ける → 外れたら消去 2 回で 0 に戻して繰り返す
 *     (2026-10-19 オーナー「カオスは 1 MOD レアで開始、高貴は 0 MOD レアで開始。偉大打って消去で 2 MOD でスパム、ベースは同じで 0 MOD レア」)
 *   始めのレア (MOD 0 / 1 つ) を作る費用はどの道にも入れない (カオスの 1 つは高貴 1 回で作るが数えない。狙いそのものが付いたら作り直す)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { applyCurrency } from "./apply-currency";
import { freshItem } from "./run-plan";
import { limitOf, sideOfMod } from "./stage-core";
import { mulberry32 } from "../htc/rng";
import type { StageItem } from "./types";

export type RouteKind = "augment" | "chaos" | "exalt";
/**
 * シェアに入れる計算済みの結果 (開いた人は計算せずにこれを出して、すぐ運試し。2026-10-19 オーナー「シェア押したら即運試しのページで計算済みのを出して」)。
 * r = 道ごとの [道, 等級, 使えない理由, 平均の費用, 平均の手数, 半分, 9 割, 使った物]、l = 運試しの道と等級、t = その道の着いた人の手数、n = 人数
 */
export interface SharedRace { r: Array<[RouteKind, Grade, string | null, number, number, number, number, Record<string, number>]>; l: [RouteKind, Grade]; t: number[]; n: number }
export function packRace(rows: readonly RaceRow[], luck: RaceRow): SharedRace {
  const r2 = (x: number): number => Math.round(x * 100) / 100;
  return {
    r: rows.map((x) => [x.route, x.grade, x.off, r2(x.avgCost), r2(x.avgSteps), r2(x.p50), r2(x.p90), Object.fromEntries(Object.entries(x.uses).map(([k, v]) => [k, r2(v)]))]),
    l: [luck.route, luck.grade], t: luck.tries, n: luck.people,
  };
}
export function unpackRace(s: SharedRace): RaceRow[] {
  return s.r.map(([route, grade, off, avgCost, avgSteps, p50, p90, uses]) => {
    const isLuck = route === s.l[0] && grade === s.l[1];
    return { route, grade, off, hitRate: isLuck ? s.t.length / s.n : off ? 0 : 1, avgCost, avgSteps, p50, p90, uses, tries: isLuck ? s.t : [], people: s.n };
  });
}
export type Grade = "base" | "greater" | "perfect";
export interface RaceTarget { modId: string; minTierIndex: number }
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
}

/** 等級 → カレンシーの鍵の後ろ (spam-counts.ts・StageRoutesPage.vue も使う) */
export const GRADE_KEY: Record<Grade, string> = { base: "", greater: "_greater", perfect: "_perfect" };
/** r 人目の乱数の種 (raceOne と spam-counts.ts で同じ式) */
export const routeSeed = (seed: number | undefined, r: number, route: RouteKind, grade: Grade): number => (seed ?? 1) * 100003 + r * 7919 + route.length * 31 + grade.length;
const allMods = (it: StageItem) => [...it.prefixes, ...it.suffixes];
const sideList = (it: StageItem, side: "prefix" | "suffix") => (side === "prefix" ? it.prefixes : it.suffixes);
export const routeHit = (it: StageItem, t: RaceTarget): boolean => allMods(it).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex);
/** 道の主のカレンシーの鍵 (augment_greater など) */
export const routeKey = (route: RouteKind, grade: Grade): string => `${route}${GRADE_KEY[grade]}`;

/** 1 人分の打ち手。100 人の計算 (raceOne) と画面の運試し (StageRouteLuck.vue) が同じ物を使う */
export interface RouteRun {
  item: StageItem;
  /** 打った回数 (お告げは数えない)・費用・使った物 */
  n: number; cost: number; uses: Record<string, number>;
  /** 最後に打った物 (画面に出す) */
  last: { key: string; omens: string[] } | null;
  /** 付いた瞬間の確率 (MOD の id → 確率。エミュレーターの札の % と神演出に使う、run-plan.ts の chances と同じ) */
  chances: Map<string, number>;
  hit(): boolean;
  /** 決まりどおりに 1 手打つ。打てなかったら false */
  step(): boolean;
}

/** 使えない理由 (無ければ null) */
/** prep = 始めのアイテムの下ごしらえ (ルーンを嵌める。route-runes.ts の runePrep) */
export type RoutePrep = ((it: StageItem) => StageItem) | undefined;

export function routeOff(data: PatchData, base: string, itemLevel: number, target: RaceTarget, route: RouteKind, prep?: RoutePrep): string | null {
  const side = sideOfMod(data, target.modId);
  // 増強の道はマジックに狙いの側の枠が要る (不在のアミュレットなど、マジックで MOD が付かないベースは使えない)
  if (route === "augment" && limitOf({ ...(prep ? prep(freshItem(data, base, itemLevel)) : freshItem(data, base, itemLevel)), rarity: "magic" }, side) < 1) return "マジックに狙いの側の枠が無いベース";
  return null;
}

/** 始めの状態を置いた 1 人分 (作れなければ null) */
export function routeRun(data: PatchData, base: string, itemLevel: number, target: RaceTarget, route: RouteKind, grade: Grade, rng: () => number, price: (key: string) => number, prep?: RoutePrep): RouteRun | null {
  const side = sideOfMod(data, target.modId);
  const g = GRADE_KEY[grade];
  let it: StageItem = freshItem(data, base, itemLevel);
  if (prep) it = prep(it);
  if (route === "chaos") {
    // MOD 1 つのレア (作る高貴 1 回は数えない)。始めの 1 つが狙いそのものなら作り直す (始めは「狙いでない MOD が 1 つ」)
    const blank: StageItem = { ...it, rarity: "rare" };
    for (let k = 0; k < 50 && (k === 0 || routeHit(it, target)); k++) { const first = applyCurrency(data, blank, "exalt", rng, []); if (!first.applied) break; it = first.item; }
    if (!allMods(it).length || routeHit(it, target)) return null;
  } else if (route === "exalt") it = { ...it, rarity: "rare" }; // MOD 0 のレア
  const run: RouteRun = {
    item: it, n: 0, cost: 0, uses: {}, last: null, chances: new Map(),
    hit: () => routeHit(run.item, target),
    step: () => {
      const use = (key: string, omens: string[] = []): boolean => {
        const res = applyCurrency(data, run.item, key, rng, omens);
        if (!res.applied) return false;
        run.item = res.item;
        run.n++;
        run.cost += price(key) + omens.reduce((a, o) => a + price(o), 0);
        run.uses[key] = (run.uses[key] ?? 0) + 1;
        for (const o of omens) run.uses[o] = (run.uses[o] ?? 0) + 1;
        run.last = { key, omens };
        for (const x of res.rolled ?? []) run.chances.set(x.modId, x.chance);
        return true;
      };
      const cur = run.item;
      if (route === "augment") {
        if (cur.rarity === "normal") return use(`transmute${g}`);
        return sideList(cur, side).length ? use("annul") : use(`augment${g}`);
      }
      if (route === "chaos") return use(`chaos${g}`);
      // 高貴: MOD があれば消去で 0 に戻す、0 なら偉大な高貴のお告げで 2 つ
      return allMods(cur).length ? use("annul") : use(`exalt${g}`, ["OmenofGreaterExaltation"]);
    },
  };
  return run;
}

/**
 * 1 通り (道 × 等級) を runs 人分打つ。打つのは重い (1 人で数百〜数千手) ので、sliceMs ごとに画面へ手を返す
 * (2026-10-19 スマホ相当 = CPU 4 倍遅くで、まとめて打つと画面が最長 8.9 秒固まった)。stop() が true になったら null で止める
 */
export async function raceOne(data: PatchData, base: string, itemLevel: number, target: RaceTarget, price: (key: string) => number, route: RouteKind, grade: Grade,
  opts: { runs: number; maxSteps?: number; seed?: number; prep?: RoutePrep; stop?: () => boolean; sliceMs?: number }): Promise<RaceRow | null> {
  const runs = opts.runs, maxSteps = opts.maxSteps ?? 3000, sliceMs = opts.sliceMs ?? 25;
  const off = routeOff(data, base, itemLevel, target, route, opts.prep);
  if (off) return { route, grade, off, hitRate: 0, avgCost: 0, avgSteps: 0, p50: 0, p90: 0, uses: {}, tries: [], people: runs };
  const costs: number[] = [], steps: number[] = [];
  const uses: Record<string, number> = {};
  let t0 = performance.now();
  const breathe = async (): Promise<boolean> => {
    if (performance.now() - t0 < sliceMs) return true;
    await new Promise((r) => setTimeout(r, 0));
    t0 = performance.now();
    return !opts.stop?.();
  };
  for (let r = 0; r < runs; r++) {
    const rng = mulberry32(routeSeed(opts.seed, r, route, grade));
    const run = routeRun(data, base, itemLevel, target, route, grade, rng, price, opts.prep);
    if (!run) continue;
    while (run.n < maxSteps && !run.hit()) {
      if (!run.step()) break;
      if ((run.n & 15) === 0 && !(await breathe())) return null;
    }
    for (const [k, v] of Object.entries(run.uses)) uses[k] = (uses[k] ?? 0) + v;
    if (run.hit()) { costs.push(run.cost); steps.push(run.n); }
    if (!(await breathe())) return null;
  }
  costs.sort((a, b) => a - b);
  const at = (q: number) => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(q * costs.length))]! : 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  for (const k of Object.keys(uses)) uses[k] = uses[k]! / runs;
  return { route, grade, off: steps.length === 0 ? "上限の手数までに付かなかった (この等級では付かない段かも)" : null, hitRate: steps.length / runs, avgCost: avg(costs), avgSteps: avg(steps), p50: at(0.5), p90: at(0.9), uses, tries: [...steps].sort((a, b) => a - b), people: runs };
}

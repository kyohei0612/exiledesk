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
 *   from (始めのアイテム) を渡した時は、カオスの道だけをそのアイテムのまま (フラクチャー・品質・ルーン込み) 打つ (2026-10-22 要望 51092b58、
 *   オーナー「現在のクラフトを参照した状態からカオススパムできるようにしたらええんやない」)。ルーンの下ごしらえ (prep) はしない
 *   当たりは複数並べられる (どれか 1 つが付いたら止める = OR。2026-10-22 オーナー)。結果には当たりごとの人数 (hitsBy) も持つ。
 *   増強の道はプレとサフィが独立に動く (マジックはプレ 1・サフィ 1。メモ sim-decisions-2026-10-20 の 10-21): 当たりのある側に外れが付いていたら消去、
 *   無ければ増強。当たりがプレとサフィの両方にある時は、どれか 1 つの数字に加えて「両方揃うまで (プレ 1 + サフィ 1)」の平均も出す (RaceRow.both。2026-10-22 オーナー)
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
  /** 当たりごとの着いた人数 (targets と同じ順。どの当たりで止まったかの内訳) */
  hitsBy: number[];
  /** 増強の道で当たりがプレとサフィの両方にある時: 両方揃うまで (プレ 1 + サフィ 1) の数字。それ以外は無し */
  both?: RaceStats;
}
/** 着いた人の数字 (着いた割合・平均の費用と手数・半分 / 9 割の人が着く費用) */
export interface RaceStats { hitRate: number; avgCost: number; avgSteps: number; p50: number; p90: number }

/** 等級 → カレンシーの鍵の後ろ (spam-counts.ts・StageRoutesPage.vue も使う) */
export const GRADE_KEY: Record<Grade, string> = { base: "", greater: "_greater", perfect: "_perfect" };
/** r 人目の乱数の種 (raceOne と spam-counts.ts で同じ式) */
export const routeSeed = (seed: number | undefined, r: number, route: RouteKind, grade: Grade): number => (seed ?? 1) * 100003 + r * 7919 + route.length * 31 + grade.length;
const allMods = (it: StageItem) => [...it.prefixes, ...it.suffixes];
const sideList = (it: StageItem, side: "prefix" | "suffix") => (side === "prefix" ? it.prefixes : it.suffixes);
/** 付いている当たりの番号 (targets の何番目か。無ければ -1)。当たりはどれか 1 つ (OR) */
export const routeHitIndex = (it: StageItem, targets: readonly RaceTarget[]): number => targets.findIndex((t) => allMods(it).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex));
export const routeHit = (it: StageItem, targets: readonly RaceTarget[]): boolean => routeHitIndex(it, targets) >= 0;
/** 当たりの側 (プレ / サフィ)。2 つ以上なら増強の道は使えない */
const targetSides = (data: PatchData, targets: readonly RaceTarget[]) => [...new Set(targets.map((t) => sideOfMod(data, t.modId)))];
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
  /** 付いている当たりの番号 (無ければ -1) */
  hitIndex(): number;
  /** 決まりどおりに 1 手打つ。打てなかったら false */
  step(): boolean;
}

/** 使えない理由 (無ければ null) */
/** prep = 始めのアイテムの下ごしらえ (ルーンを嵌める。route-runes.ts の runePrep) */
export type RoutePrep = ((it: StageItem) => StageItem) | undefined;

export function routeOff(data: PatchData, base: string, itemLevel: number, targets: readonly RaceTarget[], route: RouteKind, prep?: RoutePrep, from?: StageItem): string | null {
  const sides = targetSides(data, targets);
  if (from) {
    if (route !== "chaos") return "今のアイテムから始める時はカオスだけ";
    if (from.rarity !== "rare") return "今のアイテムがレアでない";
    if (routeHit(from, targets)) return "今のアイテムにもう狙いが付いている";
    if (!allMods(from).some((m) => !m.fractured)) return "フラクチャー以外の MOD が無い (カオスで消せる MOD が要る)";
    return null;
  }
  // 増強の道はマジックに狙いの側の枠が要る (不在のアミュレットなど、マジックで MOD が付かないベースは使えない)。当たりが両側にあれば両側とも
  if (route === "augment") {
    const magic: StageItem = { ...(prep ? prep(freshItem(data, base, itemLevel)) : freshItem(data, base, itemLevel)), rarity: "magic" };
    if (sides.some((sd) => limitOf(magic, sd) < 1)) return "マジックに狙いの側の枠が無いベース";
  }
  return null;
}

/** 始めの状態を置いた 1 人分 (作れなければ null) */
/** need = 止める所: any = 当たりのどれか 1 つ、both = 当たりのある側が全部揃う (増強の道のプレ 1 + サフィ 1) */
export function routeRun(data: PatchData, base: string, itemLevel: number, targets: readonly RaceTarget[], route: RouteKind, grade: Grade, rng: () => number, price: (key: string) => number, prep?: RoutePrep, from?: StageItem, need: "any" | "both" = "any"): RouteRun | null {
  const sides = targetSides(data, targets);
  const onSide = (sd: "prefix" | "suffix") => targets.filter((t) => sideOfMod(data, t.modId) === sd);
  /** その側に当たりが付いている */
  const sideHit = (it: StageItem, sd: "prefix" | "suffix"): boolean => routeHit({ ...it, prefixes: sd === "prefix" ? it.prefixes : [], suffixes: sd === "suffix" ? it.suffixes : [] }, onSide(sd));
  const g = GRADE_KEY[grade];
  let it: StageItem = from ?? freshItem(data, base, itemLevel);
  if (from) { if (routeOff(data, base, itemLevel, targets, route, undefined, from)) return null; }
  else if (prep) it = prep(it);
  if (route === "chaos" && !from) {
    // MOD 1 つのレア (作る高貴 1 回は数えない)。始めの 1 つが狙いそのものなら作り直す (始めは「狙いでない MOD が 1 つ」)
    const blank: StageItem = { ...it, rarity: "rare" };
    for (let k = 0; k < 50 && (k === 0 || routeHit(it, targets)); k++) { const first = applyCurrency(data, blank, "exalt", rng, []); if (!first.applied) break; it = first.item; }
    if (!allMods(it).length || routeHit(it, targets)) return null;
  } else if (route === "exalt") it = { ...it, rarity: "rare" }; // MOD 0 のレア
  const run: RouteRun = {
    item: it, n: 0, cost: 0, uses: {}, last: null, chances: new Map(),
    hit: () => (need === "both" ? sides.every((sd) => sideHit(run.item, sd)) : routeHit(run.item, targets)),
    hitIndex: () => routeHitIndex(run.item, targets),
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
        // 当たりのある側に外れが付いていたら消去 (どれが消えるかは運)、無ければ増強 (空いた側に付く)
        return sides.some((sd) => sideList(cur, sd).length > 0 && !sideHit(cur, sd)) ? use("annul") : use(`augment${g}`);
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
export async function raceOne(data: PatchData, base: string, itemLevel: number, targets: readonly RaceTarget[], price: (key: string) => number, route: RouteKind, grade: Grade,
  opts: { runs: number; maxSteps?: number; seed?: number; prep?: RoutePrep; from?: StageItem; stop?: () => boolean; sliceMs?: number }): Promise<RaceRow | null> {
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

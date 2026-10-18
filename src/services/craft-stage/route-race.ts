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
import { limitOf } from "./stage-core";
import { mulberry32 } from "../htc/rng";
import type { StageItem } from "./types";

export type RouteKind = "augment" | "chaos" | "exalt";
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
}

const GRADE_KEY: Record<Grade, string> = { base: "", greater: "_greater", perfect: "_perfect" };
const allMods = (it: StageItem) => [...it.prefixes, ...it.suffixes];
const sideList = (it: StageItem, side: "prefix" | "suffix") => (side === "prefix" ? it.prefixes : it.suffixes);

export function raceRoutes(data: PatchData, base: string, itemLevel: number, target: RaceTarget, price: (key: string) => number, opts: { runs?: number; maxSteps?: number; seed?: number; /** この 1 通りだけ回す (画面で 1 つずつ間を空けて回す時) */ only?: { route: RouteKind; grade: Grade } } = {}): RaceRow[] {
  const runs = opts.runs ?? 300, maxSteps = opts.maxSteps ?? 3000;
  const mod = data.mods.get(target.modId);
  const side: "prefix" | "suffix" = mod?.type === "suffix" ? "suffix" : "prefix";
  const hit = (it: StageItem) => allMods(it).some((m) => m.modId === target.modId && m.tierIndex >= target.minTierIndex);
  const out: RaceRow[] = [];
  for (const route of ["augment", "chaos", "exalt"] as const) {
    for (const grade of ["perfect", "greater", "base"] as const) {
      if (opts.only && (opts.only.route !== route || opts.only.grade !== grade)) continue;
      const g = GRADE_KEY[grade];
      // 増強の道はマジックに狙いの側の枠が要る (不在のアミュレットなど、マジックで MOD が付かないベースは使えない)
      const magic = { ...freshItem(data, base, itemLevel), rarity: "magic" as const };
      if (route === "augment" && limitOf(magic, side) < 1) { out.push({ route, grade, off: "マジックに狙いの側の枠が無いベース", hitRate: 0, avgCost: 0, avgSteps: 0, p50: 0, p90: 0, uses: {} }); continue; }
      const costs: number[] = [], steps: number[] = [];
      const uses: Record<string, number> = {};
      let hits = 0;
      for (let r = 0; r < runs; r++) {
        const rng = mulberry32((opts.seed ?? 1) * 100003 + r * 7919 + route.length * 31 + grade.length);
        let it: StageItem = freshItem(data, base, itemLevel);
        let cost = 0, n = 0, ok = false;
        const use = (key: string, omens: string[] = []): boolean => {
          const res = applyCurrency(data, it, key, rng, omens);
          if (!res.applied) return false;
          it = res.item;
          n++;
          cost += price(key) + omens.reduce((a, o) => a + price(o), 0);
          uses[key] = (uses[key] ?? 0) + 1;
          for (const o of omens) uses[o] = (uses[o] ?? 0) + 1;
          return true;
        };
        if (route === "augment") {
          if (!use(`transmute${g}`)) break;
          while (n < maxSteps && !(ok = hit(it))) {
            const mine = sideList(it, side);
            if (mine.length) { if (!use("annul")) break; }
            else if (!use(`augment${g}`)) break;
          }
        } else if (route === "chaos") {
          // MOD 1 つのレア (作る高貴 1 回は数えない)
          // 始めの 1 つが狙いそのものなら作り直す (始めは「狙いでない MOD が 1 つ」)
          const blank: StageItem = { ...it, rarity: "rare" };
          for (let k = 0; k < 50 && (k === 0 || hit(it)); k++) { const first = applyCurrency(data, blank, "exalt", rng, []); if (!first.applied) break; it = first.item; }
          if (!allMods(it).length || hit(it)) break;
          while (n < maxSteps && !(ok = hit(it))) if (!use(`chaos${g}`)) break;
        } else {
          // MOD 0 のレア → 偉大な高貴のお告げで 2 つ → 外れたら消去で 0 に戻す
          it = { ...it, rarity: "rare" };
          while (n < maxSteps && !(ok = hit(it))) {
            if (allMods(it).length > 0) { if (!use("annul")) break; continue; }
            if (!use(`exalt${g}`, ["OmenofGreaterExaltation"])) break;
          }
        }
        ok = ok || hit(it);
        if (ok) { hits++; costs.push(cost); steps.push(n); }
      }
      costs.sort((a, b) => a - b);
      const at = (q: number) => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(q * costs.length))]! : 0);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      for (const k of Object.keys(uses)) uses[k] = uses[k]! / runs;
      out.push({ route, grade, off: hits === 0 ? "上限の手数までに付かなかった (この等級では付かない段かも)" : null, hitRate: hits / runs, avgCost: avg(costs), avgSteps: avg(steps), p50: at(0.5), p90: at(0.9), uses });
    }
  }
  return out;
}

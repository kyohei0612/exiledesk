/**
 * spam-counts.ts — 始めのアイテムからスパムの道で狙いに着くまでの、平均の使った物と着いた割合 (2026-10-20 J3、シミュ部長の ③ の白から作る費用)。
 *
 * 打ち方は route-race.ts の routeRun と同じ決まりで、始めのアイテムを渡せる形にした物 (打つのは全部 applyCurrency)。
 *   - augment: ノーマルなら変成。狙いの側に狙いでない MOD があれば消去、無ければ増強 (狙いは側ごとに 1 つまで、両側なら両方付くまで)
 *   - chaos: レアから、狙いが全部付くまでカオス (レアでなければ使えない)
 *   - exalt: ノーマルは MOD 0 のレアとして始める。消せる MOD (固定でない・当たっていない) があれば消去、無ければ偉大な高貴のお告げで高貴
 *     (空きが 2 つ無い時はお告げ無しの高貴)
 * 打って数える (runs 人、既定 300、乱数の種は seed)。平均の使った物は打った人数で割る (着かなかった人の分も入る、route-race の uses と同じ)。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { applyCurrency } from "./apply-currency";
import { limitOf, listOf } from "./stage-core";
import { mulberry32 } from "../htc/rng";
import type { Grade, RouteKind } from "./route-race";
import type { StageItem, StageMod } from "./types";

export interface SpamTarget { modId: string; minTierIndex: number }
export interface SpamCounts {
  /** 使えない理由 (使える時は null) */
  off: string | null;
  /** 上限の手数までに着いた割合 */
  hitRate: number;
  /** 1 人あたり平均で使った物 (鍵 → 個数、お告げも入る) */
  uses: Record<string, number>;
  /** 着いた人の平均の手数 (お告げは数えない) */
  avgSteps: number;
  runs: number;
}

const GRADE_KEY: Record<Grade, string> = { base: "", greater: "_greater", perfect: "_perfect" };
const mods = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes];
const hit = (m: StageMod, t: SpamTarget): boolean => !m.unrevealed && m.modId === t.modId && m.tierIndex >= t.minTierIndex;

export function spamCounts(
  data: PatchData, item: StageItem, route: RouteKind, grade: Grade, targets: readonly SpamTarget[],
  opts: { runs?: number; maxSteps?: number; seed?: number } = {},
): SpamCounts {
  const runs = opts.runs ?? 300, maxSteps = opts.maxSteps ?? 3000;
  const g = GRADE_KEY[grade];
  const sideOf = (t: SpamTarget): "prefix" | "suffix" => (data.mods.get(t.modId)?.type === "suffix" ? "suffix" : "prefix");
  const empty = (off: string): SpamCounts => ({ off, hitRate: 0, uses: {}, avgSteps: 0, runs });
  if (!targets.length) return empty("狙いが無い");
  const sides = targets.map(sideOf);
  if (new Set(sides).size !== sides.length) return empty("狙いは側ごとに 1 つまで");
  if (route === "chaos" && item.rarity !== "rare") return empty("カオスの道はレアから");
  if (route === "augment") {
    const magic: StageItem = { ...item, rarity: "magic" };
    if (item.rarity === "rare") return empty("増強の道はノーマルかマジックから");
    if (sides.some((s) => limitOf(magic, s) < 1)) return empty("マジックに狙いの側の枠が無いベース");
  }
  const start: StageItem = route === "exalt" && item.rarity === "normal" ? { ...item, rarity: "rare" } : item;
  const done = (it: StageItem): boolean => targets.every((t) => mods(it).some((m) => hit(m, t)));
  const wrongOn = (it: StageItem, side: "prefix" | "suffix", t: SpamTarget): boolean =>
    (side === "prefix" ? it.prefixes : it.suffixes).some((m) => !m.fractured && !hit(m, t));

  const free = (it: StageItem): number => (["prefix", "suffix"] as const).reduce((a, s) => a + Math.max(0, limitOf(it, s) - listOf(it, s).length), 0);
  const uses: Record<string, number> = {};
  const steps: number[] = [];
  for (let r = 0; r < runs; r++) {
    const rng = mulberry32((opts.seed ?? 1) * 100003 + r * 7919 + route.length * 31 + grade.length);
    let it = start, n = 0;
    const use = (key: string, omens: string[] = []): boolean => {
      const res = applyCurrency(data, it, key, rng, omens);
      if (!res.applied) return false;
      it = res.item; n++;
      uses[key] = (uses[key] ?? 0) + 1;
      for (const o of omens) uses[o] = (uses[o] ?? 0) + 1;
      return true;
    };
    while (n < maxSteps && !done(it)) {
      let ok: boolean;
      if (route === "augment") {
        if (it.rarity === "normal") ok = use(`transmute${g}`);
        else {
          const open = targets.filter((t) => !mods(it).some((m) => hit(m, t)));
          ok = open.some((t) => wrongOn(it, sideOf(t), t)) ? use("annul") : use(`augment${g}`);
        }
      } else if (route === "chaos") ok = use(`chaos${g}`);
      else {
        const removable = mods(it).some((m) => !m.fractured && !targets.some((t) => hit(m, t)));
        ok = removable ? use("annul") : free(it) >= 2 ? use(`exalt${g}`, ["OmenofGreaterExaltation"]) : use(`exalt${g}`);
      }
      if (!ok) break;
    }
    if (done(it)) steps.push(n);
  }
  for (const k of Object.keys(uses)) uses[k] = uses[k]! / runs;
  const avg = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  return { off: steps.length ? null : "上限の手数までに着かなかった", hitRate: steps.length / runs, uses, avgSteps: avg, runs };
}

/**
 * spam-counts.ts — 始めのアイテムからスパムの道で狙いに着くまでの、平均の使った物と着いた割合 (2026-10-20 J3、シミュ部長の ③ の白から作る費用)。
 *
 * 1 手の決め方は route-race.ts の routeStep 1 本 (エミュのスパムシミュの routeRun と同じ物、11-07)。当たりの式も同じ routeHitMod (aimHits の sameText)。
 * ここは始めのアイテムを渡せる・狙いを全部 (targets) / どれか (anyOf) で止める形にして数えるだけ (打つのは全部 applyCurrency)。
 *   - augment: ノーマルなら変成。狙いは側ごとに 1 つまで、両側なら両方付くまで
 *   - chaos: レアから (レアでなければ使えない)
 *   - exalt: ノーマルは MOD 0 のレアとして始める
 * 打って数える (runs 人、既定 300、乱数の種は seed)。平均の使った物は打った人数で割る (着かなかった人の分も入る、route-race の uses と同じ)。
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency } from "../../craft-stage/apply-currency";
import { limitOf, sideOfMod } from "../../craft-stage/stage-core";
import { mulberry32 } from "../../htc/rng";
import { routeHitMod, routeSeed, routeStep, type Grade, type RouteKind } from "../../craft-stage/route-race";
import type { StageItem, StageMod } from "../../craft-stage/types";

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

const mods = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes];

export function spamCounts(...a: Parameters<typeof spamCountsSteps>): SpamCounts {
  const g = spamCountsSteps(...a);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
/** spamCounts を区切って回す (30 人ごとに 1 回返す = 画面の糸を止めない、ツリーの始まりの値段 use-tree-cost)。答えは spamCounts と同じ */
export function* spamCountsSteps(
  data: PatchData, item: StageItem, route: RouteKind, grade: Grade, targets: readonly SpamTarget[],
  opts: {
    runs?: number; maxSteps?: number; seed?: number;
    /** 「どれか」: このうちどれか 1 つが付けば当たり (2026-10-20 J9、シミュ ③ の候補 2 つ以上)。targets (全部要る) と一緒にも使える */
    anyOf?: readonly SpamTarget[];
  } = {},
): Generator<void, SpamCounts> {
  const runs = opts.runs ?? 300, maxSteps = opts.maxSteps ?? 3000;
  const sideOf = (t: SpamTarget): "prefix" | "suffix" => sideOfMod(data, t.modId);
  const empty = (off: string): SpamCounts => ({ off, hitRate: 0, uses: {}, avgSteps: 0, runs });
  const anyOf = opts.anyOf ?? [];
  if (!targets.length && !anyOf.length) return empty("狙いが無い");
  const sides = targets.map(sideOf);
  if (new Set(sides).size !== sides.length) return empty("狙いは側ごとに 1 つまで");
  if (route === "chaos" && item.rarity !== "rare") return empty("カオスの道はレアから");
  if (route === "augment") {
    const magic: StageItem = { ...item, rarity: "magic" };
    if (item.rarity === "rare") return empty("増強の道はノーマルかマジックから");
    if ([...sides, ...anyOf.map(sideOf)].some((s) => limitOf(magic, s) < 1)) return empty("マジックに狙いの側の枠が無いベース");
  }
  const start: StageItem = route === "exalt" && item.rarity === "normal" ? { ...item, rarity: "rare" } : item;
  const hitOf = (t: SpamTarget): ((m: StageMod) => boolean) => routeHitMod(data, [t]);
  const has = (it: StageItem, t: SpamTarget): boolean => mods(it).some(hitOf(t));
  const anyDone = (it: StageItem): boolean => !anyOf.length || anyOf.some((t) => has(it, t));
  const done = (it: StageItem): boolean => targets.every((t) => has(it, t)) && anyDone(it);
  /** 当たりの MOD (狙いか「どれか」の候補) */
  const isHit = routeHitMod(data, [...targets, ...anyOf]);
  const uses: Record<string, number> = {};
  const steps: number[] = [];
  for (let r = 0; r < runs; r++) {
    if (r && r % 30 === 0) yield;
    const rng = mulberry32(routeSeed(opts.seed, r, route, grade));
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
      // まだ付いていない狙いの側 (「どれか」がまだなら候補の側全部)。消去・増強・高貴の決まりは routeStep
      const open = [...new Set([...targets.filter((t) => !has(it, t)), ...(anyDone(it) ? [] : anyOf)].map(sideOf))];
      const s = routeStep(it, route, grade, isHit, open);
      if (!use(s.key, s.omens)) break;
    }
    if (done(it)) steps.push(n);
  }
  for (const k of Object.keys(uses)) uses[k] = uses[k]! / runs;
  const avg = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  return { off: steps.length ? null : "上限の手数までに着かなかった", hitRate: steps.length / runs, uses, avgSteps: avg, runs };
}

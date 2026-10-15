/**
 * swamp.ts — 今日のお題の沼カウンター (docs/craft-challenge.md「沼カウンター」、2026-10-16)。
 * 「進んだ」= 狙いの MOD (段の下限つき) が揃っている数が増えた。数え方は仮 (md は言葉だけで、細かい所は決まっていない):
 *   カオス沼 = 進まなかったカオス (削減のお告げ付きは削減沼の方に数える)
 *   削減沼   = 削減のお告げ (Omen of Whittling) 付きのカオスで進まなかった
 *   消去沼   = 消去で狙いの MOD が外れた (揃っている数が減った)
 *   振り出し = 0 手目へのリセット (手順に残らないので、送る時に一緒に)
 * サーバー (server/live/src/challenge.ts の Swamp) と同じ形
 */
import type { PlayedStep } from "../craft-stage/run-plan";
import type { StageItem } from "../craft-stage/types";
import { hits, type AimTarget } from "../craft-stage/aim-odds";
import { splitOmens } from "../craft-stage/run-plan";

export interface Swamp { chaos: number; whittle: number; annul: number; resets: number }
export const WHITTLING = "OmenofWhittling";

/** 狙いが揃っている数 */
export const doneCount = (item: StageItem, ts: readonly AimTarget[]): number =>
  ts.filter((t) => [...item.prefixes, ...item.suffixes].some((m) => hits(m, t))).length;

const kindOf = (key: string): string => key.replace(/_(greater|perfect)$/, "");

export function countSwamp(log: readonly PlayedStep[], ts: readonly AimTarget[], resets: number): Swamp {
  const s: Swamp = { chaos: 0, whittle: 0, annul: 0, resets };
  for (const p of log) {
    if (!p.out.applied) continue;
    const kind = kindOf(p.out.currency);
    const before = doneCount(p.before, ts), after = doneCount(p.after, ts);
    if (kind === "chaos" && after <= before) {
      if (splitOmens(p.out.omen).includes(WHITTLING)) s.whittle++;
      else s.chaos++;
    } else if (kind === "annul" && after < before) s.annul++;
  }
  return s;
}
export const swampTotal = (s: Swamp): number => s.chaos + s.whittle + s.annul + s.resets;

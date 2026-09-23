/**
 * spam-total.ts — スパム + 仕上げの合計の分布と、段階ごとの累計 ([[spam-plan.ts]] から分けた。1 ファイル 500 行まで)
 */
import type { FinishPlan } from "./prefix-finish";

/** 合計の分布。`stages` は段階ごとの**累計**の費用を 1 回ずつ (予算でどこまで行けるかを画面で数える) */
export interface SpamTotal {
  expected: number; p50: number; p80: number; p90: number;
  stages: Array<{ label: string; cum: number[] }>;
}

/**
 * サフィの段階 (`phase`、プレだけの指輪は 0) に仕上げを 1 回ずつ足して、分布と段階ごとの累計を出す。
 * 予算 (オーナー 2026-09-23:「基本的に 500 神以内にしてみよう、どこまでできるか」) は画面で数える
 */
export function totalOf(finish: FinishPlan, expected: number, phase: readonly number[]): SpamTotal {
  const rnd = mulberry32(7);
  const parts = phase.map((x) => ({ x, ...finish.sample(rnd) }));
  const stages: SpamTotal["stages"] = [];
  let run = parts.map(() => 0);
  const add = (label: string, f: (p: (typeof parts)[number]) => number): void => {
    run = run.map((v, i) => v + f(parts[i]!));
    stages.push({ label, cum: run });
  };
  if (phase.some((x) => x > 0)) add("サフィが揃う", (p) => p.x);
  if (finish.exalt) add("プレを高貴で足し終わる", (p) => p.exalt);
  if (finish.steps.length) add(finish.desecrate ? "品質・エッセンスまで" : "完成", (p) => p.fixed);
  if (finish.desecrate) add("完成 (冒涜まで)", (p) => p.desecrate);
  const sum = [...run].sort((a, b) => a - b);
  const q = (f: number): number => sum[Math.min(sum.length - 1, Math.floor(sum.length * f))]!;
  return { expected, p50: q(0.5), p80: q(0.8), p90: q(0.9), stages };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

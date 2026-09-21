/**
 * model-probs.ts — ヴァールオーブと結晶の当たり確率 (経路の組み立てから使う)
 *
 * 2026-09-21 に model.ts (601 行) から切り出した。中身は変えていない。
 * 外から使う時は今まで通り `./model` から読む (model.ts がまとめて出している)。
 */
import { type CorruptParams } from "./model-types";

export const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

export function normalizedVaal(p: CorruptParams): { none: number; level: number; quality: number; sockets: number } {
  const w = [p.vaalNone, p.vaalLevel, p.vaalQuality, p.vaalSockets].map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w[0] + w[1] + w[2] + w[3];
  if (sum <= 0) return { none: 0.25, level: 0.25, quality: 0.25, sockets: 0.25 };
  return { none: w[0] / sum, level: w[1] / sum, quality: w[2] / sum, sockets: w[3] / sum };
}

/**
 * コラプトの結晶を「品質系統がまだ」の状態 (レベル 21) に使った時の当たり確率。
 * 生存 × 品質段のうち最大段 (0 を除く qualitySteps−1 段の 1 つ)。
 */
export function crystalHitQuality(p: CorruptParams): number {
  const steps = Math.max(2, Math.round(p.qualitySteps)) - 1;
  return (1 - clamp01(p.crystalDestroy)) / steps;
}
/** コラプトの結晶を「レベル系統がまだ」の状態 (品質 23%) に使った時の当たり確率 (生存 × 半々) */
export function crystalHitLevel(p: CorruptParams): number {
  return (1 - clamp01(p.crystalDestroy)) / 2;
}

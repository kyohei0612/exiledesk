/**
 * stage-tuning.ts — 正しい値が分からない所を使う人が決める設定 (2026-10-21 オーナー「分からない所を使う人にいじらせたい」、開発版の画面から)。
 * null = エンジンの既定のまま。打つ処理 (parts.ts) と確率の表 (odds.ts・outcomes.ts) が同じ値を読む (画面の側で計算しない)。
 *
 * - catalysingPerPct: 触媒の高貴のお告げで、カタリストの品質 1% ごとに対応する MOD の重みへ足す倍率。
 *   既定 0.2 = Craft of Exile の式 (1 + 0.2 × 品質、20% を超えた分は 1% ごとに 0.12 = 0.6 倍の傾き。catalysing-multiplier.ts)。
 *   ゲーム内・クライアントに数字は無い (poe2db の説明文は「確率を上げる」だけ)。変えた時も 20% を超えた分は同じ 0.6 倍の傾き
 * - sanctifyK: 聖別のお告げ + 神のオーブで、MOD ごとに掛ける倍率 (×100、78〜122)。既定は範囲の中でランダム (apply-vaal.ts)
 */
import { catalysingMultiplier } from "../htc/catalysing-multiplier";
import { ABSOLUTE_MAX_QUALITY } from "../htc/quality";
import { SANCTIFY_MAX, SANCTIFY_MIN } from "./apply-vaal";

export interface StageTuning {
  catalysingPerPct: number | null;
  sanctifyK: number | null;
}
/** 触媒の高貴の既定 (CoE の 1% ごと +0.2) */
export const CATALYSING_PER_PCT = 0.2;
const DEFAULT_MAX = 20;
const OVER_RATIO = 0.6;

let tuning: StageTuning = { catalysingPerPct: null, sanctifyK: null };

export function stageTuning(): Readonly<StageTuning> {
  return tuning;
}
export function setStageTuning(t: Partial<StageTuning>): void {
  const next = { ...tuning, ...t };
  if (next.catalysingPerPct != null && !(next.catalysingPerPct >= 0)) next.catalysingPerPct = null;
  if (next.sanctifyK != null) next.sanctifyK = Math.max(SANCTIFY_MIN, Math.min(SANCTIFY_MAX, Math.round(next.sanctifyK)));
  tuning = next;
}

/** 品質 (%) → 対応する MOD の重みに掛かる倍率 (設定が無ければエンジンの既定 catalysingMultiplier) */
export function tunedCatalysingMultiplier(qualityPct: number): number {
  const r = tuning.catalysingPerPct;
  if (r == null) return catalysingMultiplier(qualityPct);
  if (!(qualityPct > 0)) return 1;
  const q = Math.min(qualityPct, ABSOLUTE_MAX_QUALITY);
  return 1 + r * Math.min(q, DEFAULT_MAX) + r * OVER_RATIO * Math.max(0, q - DEFAULT_MAX);
}

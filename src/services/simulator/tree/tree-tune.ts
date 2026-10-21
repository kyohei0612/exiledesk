/**
 * tree-tune.ts — ツリー (木・レシピ) が持つエンジンの設定 (2026-10-22 オーナー「ここ (ツリー) でも、触媒などの設定を変えられるように。エンジンは同じだからいけると思う」)。
 * 形は手順 JSON の 1 手の tune (StepTune) と同じ: 触媒の高貴の 1% ごとの倍率・聖別の倍率・MOD の重み。無い物はエンジンの既定。
 * 値はエンジンの入口の setStageTuning に渡すだけ (倍率の計算はエンジン)。見本・ルート精査・100 人回しはこの木の設定で打つ (withTreeTune)
 */
import { setStageTuning, stageTuning, type StageTuning } from "../../craft-stage/engine";
import type { TreeDoc } from "./tree-model";

export interface TreeTune { catalysing_per_pct?: number; sanctify_k?: number; weights?: Record<string, number> }

/** 木の設定 → エンジンの設定 (無い物は既定) */
export const tuningOf = (t: TreeTune | undefined): StageTuning => ({ catalysingPerPct: t?.catalysing_per_pct ?? null, sanctifyK: t?.sanctify_k ?? null, modWeights: { ...(t?.weights ?? {}) } });
/** エンジンの設定 → 木の設定 (既定から変えた物だけ。全部既定なら undefined) */
export function tuneOf(s: Readonly<StageTuning>): TreeTune | undefined {
  const t: TreeTune = {
    ...(s.catalysingPerPct != null ? { catalysing_per_pct: s.catalysingPerPct } : {}),
    ...(s.sanctifyK != null ? { sanctify_k: s.sanctifyK } : {}),
    ...(Object.keys(s.modWeights).length ? { weights: { ...s.modWeights } } : {}),
  };
  return Object.keys(t).length ? t : undefined;
}
/** 木の設定で打つ (終わったら元の設定に戻す。入れ子でも同じ) */
export function withTreeTune<T>(doc: TreeDoc, run: () => T): T {
  const keep = stageTuning();
  setStageTuning(tuningOf(doc.tune));
  try { return run(); } finally { setStageTuning(keep); }
}

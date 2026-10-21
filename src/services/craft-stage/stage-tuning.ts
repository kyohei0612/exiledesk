/**
 * stage-tuning.ts — 正しい値が分からない所を使う人が決める設定 (2026-10-21 オーナー「分からない所を使う人にいじらせたい」、開発版の画面から)。
 * null = エンジンの既定のまま。打つ処理 (parts.ts) と確率の表 (odds.ts・outcomes.ts) が同じ値を読む (画面の側で計算しない)。
 *
 * - catalysingPerPct: 触媒の高貴のお告げで、カタリストの品質 1% ごとに対応する MOD の重みへ足す倍率。
 *   既定 0.2 = Craft of Exile の式 (1 + 0.2 × 品質、20% を超えた分は 1% ごとに 0.12 = 0.6 倍の傾き。catalysing-multiplier.ts)。
 *   ゲーム内・クライアントに数字は無い (poe2db の説明文は「確率を上げる」だけ)。変えた時も 20% を超えた分は同じ 0.6 倍の傾き
 * - sanctifyK: 聖別のお告げ + 神のオーブで、MOD ごとに掛ける倍率 (×100、78〜122)。既定は範囲の中でランダム (apply-vaal.ts)
 * - modWeights: MOD ごとの重み (2026-10-22 オーナー「1000 で置いて、修正できるように」。正解が誰にも分からない重み = poe2db の仮置き 1・CoE で埋めた値など)。
 *   値 W = その MOD の一番重い段の重み。ほかの段は同じ比で動かす (キャストスピードのように全段同じなら全段 W)。
 *   候補を引く candidates (stage-core、打つ処理と確率の表が通る 1 か所) と MOD 一覧 (mod-list.ts) が読む
 */
import { catalysingMultiplier } from "../htc/catalysing-multiplier";
import { ABSOLUTE_MAX_QUALITY } from "../htc/quality";
import type { Mod } from "../../vendor/poe2htc/engine/types";

/** 聖別の倍率の幅 (×100。聖別のお告げの 0.78〜1.22。apply-vaal.ts もここから) */
export const SANCTIFY_MIN = 78;
export const SANCTIFY_MAX = 122;

export interface StageTuning {
  catalysingPerPct: number | null;
  sanctifyK: number | null;
  /** MOD の id → 一番重い段の重み (無い MOD は既定のまま) */
  modWeights: Readonly<Record<string, number>>;
}
/** 触媒の高貴の既定 (CoE の 1% ごと +0.2) */
export const CATALYSING_PER_PCT = 0.2;
const DEFAULT_MAX = 20;
const OVER_RATIO = 0.6;

let tuning: StageTuning = { catalysingPerPct: null, sanctifyK: null, modWeights: {} };

export function stageTuning(): Readonly<StageTuning> {
  return tuning;
}
export function setStageTuning(t: Partial<StageTuning>): void {
  const next = { ...tuning, ...t };
  if (next.catalysingPerPct != null && !(next.catalysingPerPct >= 0)) next.catalysingPerPct = null;
  if (next.sanctifyK != null) next.sanctifyK = Math.max(SANCTIFY_MIN, Math.min(SANCTIFY_MAX, Math.round(next.sanctifyK)));
  next.modWeights = Object.fromEntries(Object.entries(next.modWeights ?? {}).filter(([, w]) => Number.isFinite(w) && w >= 0));
  tuning = next;
}

/**
 * 手順 JSON の 1 手に書く設定 (手の追加キー `tune`、2026-10-22 オーナー「再生・共有でも同じ設定に」)。
 * その手で使ったお告げに効く物だけ・既定から変えた物だけ。無ければ null (= 既定で打った手)
 */
export interface StepTune { catalysing_per_pct?: number; sanctify_k?: number; weights?: Record<string, number> }
export function tuneForStep(omensUsed: readonly string[]): StepTune | null {
  const t: StepTune = {
    // 重みはどの手にも効きうる (乱数で付く・消える) ので、直していれば打てた手全部に書く
    ...(Object.keys(tuning.modWeights).length ? { weights: { ...tuning.modWeights } } : {}),
    ...(tuning.catalysingPerPct != null && omensUsed.includes("OmenofCatalysingExaltation") ? { catalysing_per_pct: tuning.catalysingPerPct } : {}),
    ...(tuning.sanctifyK != null && omensUsed.includes("OmenofSanctification") ? { sanctify_k: tuning.sanctifyK } : {}),
  };
  return Object.keys(t).length ? t : null;
}
/** 手に書いた設定で 1 手打つ (書いていない手は既定)。打った後は元の設定に戻す (画面で決めている値は再生で変わらない) */
export function withStepTune<T>(t: StepTune | null | undefined, run: () => T): T {
  const keep = tuning;
  setStageTuning({ catalysingPerPct: t?.catalysing_per_pct ?? null, sanctifyK: t?.sanctify_k ?? null, modWeights: t?.weights ?? {} });
  try { return run(); } finally { tuning = keep; }
}

/** 品質 (%) → 対応する MOD の重みに掛かる倍率 (設定が無ければエンジンの既定 catalysingMultiplier) */
export function tunedCatalysingMultiplier(qualityPct: number): number {
  const r = tuning.catalysingPerPct;
  if (r == null) return catalysingMultiplier(qualityPct);
  if (!(qualityPct > 0)) return 1;
  const q = Math.min(qualityPct, ABSOLUTE_MAX_QUALITY);
  return 1 + r * Math.min(q, DEFAULT_MAX) + r * OVER_RATIO * Math.max(0, q - DEFAULT_MAX);
}

/** その MOD の既定の重み (一番重い段。weight-overrides で埋めた後の値) */
export const defaultWeightOf = (mod: Mod): number => mod.tiers.reduce((a, t) => Math.max(a, t.weight), 0);
/** 直した重みの倍率 (直していない・既定が 0 の MOD は 1) */
export function weightScaleOf(mod: Mod): number {
  const w = tuning.modWeights[mod.id];
  if (w == null) return 1;
  const top = defaultWeightOf(mod);
  return top > 0 ? w / top : 1;
}
/** 直した重みを段に入れた MOD (一覧の表示用。直していなければそのまま) */
export function weightedMod(mod: Mod): Mod {
  const k = weightScaleOf(mod);
  return k === 1 ? mod : { ...mod, tiers: mod.tiers.map((t) => ({ ...t, weight: t.weight * k })) };
}

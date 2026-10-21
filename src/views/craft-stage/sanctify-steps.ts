/**
 * sanctify-steps.ts — 聖別の倍率の選び (StageSanctifyBar の帯と StageOmenTune のお告げの下で同じ物。2026-10-22 に 2 か所の写しを 1 つに)
 */
import { SANCTIFY_MAX, SANCTIFY_MIN } from "../../services/craft-stage/engine";

/** 倍率 ×100 の並び (大きい順) */
export const SANCTIFY_STEPS = Array.from({ length: SANCTIFY_MAX - SANCTIFY_MIN + 1 }, (_, i) => SANCTIFY_MAX - i);
/** 倍率の書き方 (×1.22) */
export const sanctifyLabel = (n: number): string => `×${(n / 100).toFixed(2)}`;
/** 選ぶ欄の形 (品質の帯と同じ 24px の高さ) */
export const SANCTIFY_SELECT = "h-6 cursor-pointer rounded border border-white/15 bg-black/60 px-1 text-white/80 tabular-nums";

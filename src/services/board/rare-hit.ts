/**
 * rare-hit.ts — エミュレーターで打った 1 手が「当たりの速報」になるか (Web 版だけ、2026-10-16。docs/roadmap-2026-10.md「自動の札」)。
 * 乱数で付いた MOD (変成・増強・王者・錬金・高貴・カオス) が T1 で、付いた瞬間の確率がベースの線 (rare-line.ts) 以下なら札の中身を返す。
 * 指名で付けた手・エッセンス・骨・ルーンは出さない。1 手で幾つも付いた時 (錬金) は一番珍しい物 1 つ
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { PlayedStep } from "../craft-stage/run-plan";
import { belowLine, rareLineOf } from "./rare-line";
import { BOARD_HITS_ENABLED, boardHitsOn, sendHit, type BoardHit } from "./board-api";
import { noLog } from "../../utils/no-log";

export const HIT_CUR_RE = /^(transmute|augment|regal|alchemy|exalt|chaos)(_greater|_perfect)?$/;

/** n = このアイテムにこのカレンシーを打った何回目か */
export function rareHitOf(data: PatchData, step: PlayedStep, n: number): BoardHit | null {
  const cur = step.out.currency;
  if (!step.out.applied || !HIT_CUR_RE.test(cur) || (step.out as { picked?: boolean }).picked || !step.chances) return null;
  const line = rareLineOf(data, step.before.base);
  if (!line) return null;
  let best: { m: PlayedStep["added"][number]; p: number } | null = null;
  for (const m of step.added) {
    const p = step.chances[m.modId];
    if (p != null && belowLine(p, m.tierName, line) && (!best || p < best.p)) best = { m, p };
  }
  if (!best) return null;
  return { base: step.before.base, ilvl: step.before.itemLevel, cur, n, modId: best.m.modId, ti: best.m.tierIndex, v: [...best.m.values], p: best.p };
}

/**
 * 打った手ごとに呼ぶ (state/craft-stage.ts の use)。札になる時だけサーバーへ。
 * 送らない: 設定で止めた端末・記録しない端末と録画モード (no-log)・開発版で本番のサーバーを向いている時 (VITE_WEB_API を手元の wrangler dev に向けた時だけ送る)
 */
export function maybeSendHit(data: PatchData, step: PlayedStep, n: number): void {
  if (!BOARD_HITS_ENABLED || !boardHitsOn.value || noLog()) return;
  if (import.meta.env.DEV && !import.meta.env.VITE_WEB_API) return;
  const h = rareHitOf(data, step, n);
  if (h) void sendHit(h);
}

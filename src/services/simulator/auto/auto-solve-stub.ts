/**
 * auto-solve-stub.ts — 「順番だけ自動」の仮の解き手 (シミュ部長、2026-10-20)。
 * 解析君の buildAutoModel が「まだ作っている途中」を返す間だけ、画面とワーカーを動かすために使う (画面には「仮の数字」と出す)。数字は意味を持たない。
 * 本物 (auto-solve.ts) ができたら使われなくなるので、その時に消す
 */
import type { OrderResult, SolveOpts } from "./auto-solve";

/** 本物の build がまだの時の理由 (auto-model.ts の今の返り値) */
export const NOT_READY_JA = "まだ作っている途中";

export interface StubModel { stub: true; keys: string[]; R: number; redo: Record<string, number> }

export const buildStub = (keys: string[], R: number, redo: Record<string, number>): StubModel => ({ stub: true, keys, R, redo });

/** 仮: 前にある行ほど後ろの手で壊れやすい、とだけ見た数字 (値の形を確かめる用) */
export function solveStub(model: StubModel, order: readonly string[], opts: SolveOpts = {}): OrderResult {
  const t0 = Date.now();
  const ks = order.filter((k) => model.keys.includes(k));
  let cost = 0, finish = 1;
  ks.forEach((k, i) => {
    const r = model.redo[k] || 10;
    cost += r * (1 + 0.6 * (ks.length - 1 - i));
    finish *= 1 - Math.min(0.15, r / 4000) * (ks.length - 1 - i) / Math.max(1, ks.length);
  });
  finish = Math.max(0.05, finish);
  // 重さの見本 (本物は値だけ 0.2 秒以下が目標)
  const until = t0 + (opts.mc ? 150 : 15);
  while (Date.now() < until) { /* 待つ */ }
  const R = model.R;
  return { cost, finish, R, perFinish: (R + cost) / finish - R, mc: opts.mc ?? 0, ms: Date.now() - t0 };
}

/**
 * auto-order.worker.ts — 「順番だけ自動」の計算を画面とは別の場所 (Web Worker) で (シミュ部長、2026-10-20)。
 * 値だけ (mc 無し) で候補を全部 → 安い順に上位 top と今の順番だけ 1 人ずつ mc 人回し、出た順に返す。
 * 止めるのは画面の側でワーカーごと捨てる (auto-order.ts の runAutoOrder)。1 つの順番の値は解析君の solveOrder
 */
import { solveOrder, type AutoModel, type OrderResult } from "./auto-solve";
import { solveStub, type StubModel } from "./auto-solve-stub";

export interface AutoJob { model: AutoModel | StubModel; cands: string[][]; current: string[]; top: number; mc: number }
export type AutoMsg =
  | { kind: "step"; done: number; total: number }
  | { kind: "row"; row: OrderResult & { order: string[]; current: boolean } }
  | { kind: "done" }
  | { kind: "error"; message: string };

const post = (m: AutoMsg): void => (self as unknown as Worker).postMessage(m);
const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((k, i) => k === b[i]);

self.addEventListener("message", (e: MessageEvent<AutoJob>) => {
  const { model, cands, current, top, mc } = e.data;
  const solve = (order: string[], opts?: { mc: number }): OrderResult => ("stub" in model ? solveStub(model, order, opts) : solveOrder(model, order, opts));
  try {
    const vals: Array<{ order: string[]; v: number }> = [];
    let last = 0;
    cands.forEach((order, i) => {
      vals.push({ order, v: solve(order).perFinish });
      // 知らせるのは 0.1 秒に 1 回まで
      if (Date.now() - last > 100 || i === cands.length - 1) { last = Date.now(); post({ kind: "step", done: i + 1, total: cands.length + Math.min(top, cands.length) }); }
    });
    vals.sort((a, b) => a.v - b.v);
    const picks = vals.slice(0, top).map((x) => x.order);
    if (!picks.some((o) => same(o, current))) picks.push(current);
    picks.forEach((order, j) => {
      post({ kind: "row", row: { ...solve(order, { mc }), order, current: same(order, current) } });
      post({ kind: "step", done: cands.length + j + 1, total: cands.length + picks.length });
    });
    post({ kind: "done" });
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
});

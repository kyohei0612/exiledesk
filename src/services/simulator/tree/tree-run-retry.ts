/**
 * tree-run-retry.ts — 100 人回しの 1 人分の乱数の列と、予期せぬ狙い MOD で止まった人のやり直し (S-33g ②、スイッチ goalRetry)。
 * オーナー 11-16「予期せぬで止まったらそのルートはカウントには残すけどやり直してもっかい最初から挑戦にしたら損した感じにならんでしょ」「やり直しはおすすめで」
 * (おすすめ = やり直す前に使った費用はその人の費用に足す・1 人 3 回まで、超えたら止まりで終わり)。tree-run.ts が 500 行に届いたので分けた。
 */
import { mulberry32 } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";

/** 箱ごとの列 (perBox)。種・何人目・箱の名前を混ぜて 1 本ずつ作る。やり直しも同じ列の続きを引く (同じ木なら同じ数) */
export function boxStreams(seed: number, i: number): (box: string) => () => number {
  const m = new Map<string, () => number>();
  return (box) => {
    let f = m.get(box);
    if (!f) {
      let h = 2166136261 ^ seed;
      for (const c of `${i}|${box}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      m.set(box, (f = mulberry32(h >>> 0)));
    }
    return f;
  };
}

/** やり直しの上限 (1 人あたり。超えたら止まりで終わる) */
export const GOAL_RETRY_MAX = 3;

/** やり直しで足し合わせる 1 人分の結果の形 (tree-run の Person のうち使う所) */
export interface RetryPart {
  end: string; cost: number; visits: { box: string; cost: number; pass?: true }[]; uses: Record<string, number>; restarts: number; odd: Set<string>;
  goalAt?: string; essAt?: string; ltAt?: string;
  /** やり直す前に予期せぬ狙い MOD で止まった所 (古い順。結果のまとめの「予期せぬ狙い MOD で止まった」の数えに残す) */
  retried?: Array<{ goalAt?: string; essAt?: string; ltAt?: string }>;
}

/** 予期せぬ狙い MOD (S-33g ②・S-33e ⑧・低いティア S-33g) で止まり、まだやり直せる人か */
export const retryable = (p: RetryPart): boolean => flag("goalRetry") && p.end === "stuck" && !!(p.goalAt || p.essAt || p.ltAt) && (p.retried?.length ?? 0) < GOAL_RETRY_MAX;

/** 止まった前の挑戦 prev とやり直した挑戦 next を 1 人分に足す (費用・使った物・通った道は足し、止まった所は retried に残す) */
export function mergeRetry<P extends RetryPart>(prev: P, next: P): P {
  const uses = { ...prev.uses };
  for (const [k, n] of Object.entries(next.uses)) uses[k] = (uses[k] ?? 0) + n;
  const stop = { ...(prev.goalAt ? { goalAt: prev.goalAt } : {}), ...(prev.essAt ? { essAt: prev.essAt } : {}), ...(prev.ltAt ? { ltAt: prev.ltAt } : {}) };
  return {
    ...next, cost: prev.cost + next.cost, uses, restarts: prev.restarts + next.restarts + 1, odd: new Set([...prev.odd, ...next.odd]),
    visits: [...prev.visits, ...next.visits.map((v) => ({ ...v, cost: v.cost + prev.cost }))],
    retried: [...(prev.retried ?? []), stop, ...(next.retried ?? [])],
  };
}

/**
 * 1 人目の挑戦 (S-72c): 予期せぬ狙い MOD で止まったら最初から作り直す (11-16 オーナー「1人目も予期せぬなら作り直しで」)。
 * 100 人の 3 回までの上限は無く、足した費用が打ち止めの神 (capDiv) を超えるか作り直しが手の上限 (capSteps) 回に届いたら打ち止め。one は 1 回分 (同じ乱数の列の続き)
 */
export function firstTryRun<P extends RetryPart>(one: () => P, capDiv: number, capSteps: number): P {
  let p = one();
  for (let k = 0; p.end === "stuck" && (p.goalAt || p.essAt || p.ltAt); k++) {
    if (p.cost > capDiv || k >= capSteps) return { ...p, end: "capped" } as P;
    p = mergeRetry(p, one());
  }
  return p;
}

/**
 * 予期せぬ狙い MOD の止まりの数え (S-33g ②・S-33e ⑧・低いティア)。goal / ess / low = 止めた手の箱ごとの回数 (やり直した分も入れる)、
 * stuckOdd = 止まりで終わった人のうち予期せぬ狙い MOD で止まった人の、止まった箱ごとの人数 (止まりの欄で「予期せぬ」と「木の不具合」を分ける)
 */
export function stopCounts(people: readonly (RetryPart & { at: string })[]): { goalStop: Record<string, number>; essStop: Record<string, number>; lowStop: Record<string, number>; stuckOdd: Record<string, number> } {
  const goalStop: Record<string, number> = {}, essStop: Record<string, number> = {}, lowStop: Record<string, number> = {}, stuckOdd: Record<string, number> = {};
  const add = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };
  for (const p of people) {
    for (const s of [...(p.retried ?? []), ...(p.end === "stuck" ? [p] : [])]) { if (s.goalAt) add(goalStop, s.goalAt); if (s.essAt) add(essStop, s.essAt); if (s.ltAt) add(lowStop, s.ltAt); }
    if (p.end === "stuck" && (p.goalAt || p.essAt || p.ltAt)) add(stuckOdd, p.at);
  }
  return { goalStop, essStop, lowStop, stuckOdd };
}

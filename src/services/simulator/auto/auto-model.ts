/**
 * auto-model.ts — シミュレーターの狙い (QuizSimIn) から動的計画法の形と重みを組み立てる (解析君、2026-10-20)。入口の型は auto-solve.ts
 */
import type { AutoInput, AutoSupport } from "./auto-solve";

/** 計算の材料 (組み立て済み)。中身は auto-model・auto-actions・auto-solve だけが見る */
export interface AutoModel {
  /** 並べる行のキー (④ の simOrder のうち自動で並べる物: "mod:<id>"・"rest:frac"・"rest:<id>") */
  keys: string[];
  /** 始め 1 個の代金 (高貴建て) */
  R: number;
}

/** 自動に対応している組み合わせか */
export function autoSupport(input: AutoInput): AutoSupport {
  void input;
  return { ok: false, reason: "まだ作っている途中" };
}

/** 形と重みを組み立てる。対応していなければ null */
export function buildAutoModel(input: AutoInput): AutoModel | null {
  return autoSupport(input).ok ? { keys: [], R: input.sim.startPrice } : null;
}

/** 並べる行のキー (この並びを入れ替えた物を solveOrder に渡す) */
export const orderableKeys = (model: AutoModel): string[] => [...model.keys];

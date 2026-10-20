/**
 * auto-model.ts — シミュレーターの狙い (QuizSimIn) から動的計画法の形と重みを組み立てる (解析君、2026-10-20)。入口の型は auto-solve.ts
 */
import type { AutoBuilt, AutoInput } from "./auto-solve";

/** 計算の材料 (組み立て済み、構造化複製できる素の物)。中身は auto-model・auto-actions・auto-solve だけが見る */
export interface AutoModel {
  /** 並べる行のキー (④ の simOrder のうち自動で並べる物: "mod:<id>"・"rest:frac"・"rest:<id>") */
  keys: string[];
  /** 始め 1 個の代金 (高貴建て) */
  R: number;
}

/** 形と重みを組み立てる。対応していなければ ok: false と理由 */
export function buildAutoModel(input: AutoInput): AutoBuilt {
  void input;
  return { ok: false, reason: { ja: "まだ作っている途中", en: "Not ready yet" } };
}

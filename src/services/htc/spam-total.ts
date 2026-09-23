/**
 * spam-total.ts — スパム + 仕上げの合計の分布と、段階ごとの累計 ([[spam-plan.ts]] から分けた。1 ファイル 500 行まで)
 */
import type { FinishPlan } from "./prefix-finish";

/**
 * 「1 手ずつ」の画面に出す 1 手 (オーナー 2026-09-23:「1 個 1 個確率出していこう、次へ みたいな」)。
 * 外れ無しで進んだ時の道 (一番付きやすい狙いから付いたとして)。外れ・消去の費用は段階の平均に入っている
 */
export interface PathStep {
  /** この手で狙う物 (どれか 1 つが付けば当たり) */
  want: string[];
  action: string;
  /** 1 回で当たる確率 */
  odds: number;
  /** 1 回の値段 (高貴換算) */
  perTry: number;
  /**
   * この手で狙いが 1 つ付くまでの**支出の期待値** (外れの消去・狙いが消えた時のやり直しも込み)。
   * 解いた「残りの期待値」の、この手の前と後の差 (オーナー 2026-09-23:「次の一手が確率と予想期待値による支出」)
   */
  spend: number;
  /**
   * 外れた時のリカバリー (オーナー 2026-09-23:「進めるのは MOD の数だけ、失敗時のリカバリーどうするかだよね」)。
   * 外れ = 狙い以外が付いた。その後に打つ手と、消去が何に当たるか
   */
  miss: MissPlan | null;
  /** 選べる打ち方 (高貴の段階 × カタリスト)。`delta` は今の手より何高貴高いか。無ければ空 */
  options: Array<{ label: string; odds: number; delta: number; chosen: boolean; forceKey: string; forced: boolean }>;
}

export interface MissPlan {
  /** 外れる確率 (1 − odds) */
  p: number;
  /** 外れた後に打つ手 */
  action: string;
  /** 消去の時、何が消えるか。exalt (外れを残して次を打つ) の時は空 */
  outcomes: Array<{ kind: "junk" | "target" | "spam" | "breach"; modId?: string; p: number }>;
  /** 外れ 1 回で増える費用の期待値 (外れた状態の残り − 外れ無しの残り) */
  loss: number;
  /** 外れ 1 回の後始末に打つ物の値段 (消去 + お告げ。やり直しならスパムまで込み、残すなら 0)。挑戦回数の予算に使う */
  cost: number;
  /** 選べるリカバリーと、それぞれの外れ 1 回の損。`forceKey` に label を入れると固定して解き直す */
  options: Array<{ label: string; loss: number; chosen: boolean; forceKey: string; forced: boolean }>;
}

/**
 * 1 手ずつ進める画面の「今の状態で次に打つ手」(オーナー 2026-09-23:「1 手 1 手考えながらやろう。
 * 1 手進むごとに画面切り替わる感じ」)。結果を押すと、その状態でまた聞き直す
 */
export type PlayMove =
  | {
      kind: "exalt"; label: string; perTry: number;
      /** 付く狙いと確率。残りは外れ */
      hits: Array<{ modId: string; p: number }>;
      /** この手の後にブリーチの MOD が居るか (付け直しを含む手なら true) */
      breachAfter: boolean;
      /** この状態から揃うまでの残りの見込み (高貴換算) */
      remaining: number;
    }
  | {
      kind: "annul"; label: string; perTry: number;
      /** 何が消えるか。spam = スパムの狙い (消えたらスパムからやり直し) */
      removes: Array<{ kind: "junk" | "target" | "spam" | "breach"; modId?: string; p: number }>;
      remaining: number;
    }
  | { kind: "reset"; label: string; perTry: number; remaining: number };

/** 合計の分布。`stages` は段階ごとの**累計**の費用を 1 回ずつ (予算でどこまで行けるかを画面で数える) */
export interface SpamTotal {
  expected: number; p50: number; p80: number; p90: number;
  stages: Array<{ label: string; cum: number[] }>;
}

/**
 * サフィの段階 (`phase`、プレだけの指輪は 0) に仕上げを 1 回ずつ足して、分布と段階ごとの累計を出す。
 * 予算 (オーナー 2026-09-23:「基本的に 500 神以内にしてみよう、どこまでできるか」) は画面で数える
 */
export function totalOf(finish: FinishPlan, expected: number, phase: readonly number[]): SpamTotal {
  const rnd = mulberry32(7);
  const parts = phase.map((x) => ({ x, ...finish.sample(rnd) }));
  const stages: SpamTotal["stages"] = [];
  let run = parts.map(() => 0);
  const add = (label: string, f: (p: (typeof parts)[number]) => number): void => {
    run = run.map((v, i) => v + f(parts[i]!));
    stages.push({ label, cum: run });
  };
  if (phase.some((x) => x > 0)) add("サフィが揃う", (p) => p.x);
  if (finish.exalt) add("プレを高貴で足し終わる", (p) => p.exalt);
  if (finish.steps.length) add(finish.desecrate ? "品質・エッセンスまで" : "完成", (p) => p.fixed);
  if (finish.desecrate) add("完成 (冒涜まで)", (p) => p.desecrate);
  const sum = [...run].sort((a, b) => a - b);
  const q = (f: number): number => sum[Math.min(sum.length - 1, Math.floor(sum.length * f))]!;
  return { expected, p50: q(0.5), p80: q(0.8), p90: q(0.9), stages };
}

/** 決まった種の乱数 (回すたびに同じ分布になるように) */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

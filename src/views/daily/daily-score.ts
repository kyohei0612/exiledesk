/**
 * daily-score.ts — 順位のスコア (D-02b、11-11 オーナー「スコア（費用÷完成率）を出して順位付けしようか」)。
 * スコア = 完成 1 個あたりの費用 ÷ 完成率 (割合)。小さいほど上、同じスコア (0.1 で丸めた数) なら使った時間の短い人、時間も同じなら先に出した人
 * (11-11 オーナー「その場合かかった時間で優劣決めておk」)。
 * 画面の順位 (daily-api の rankOf)・サーバーの順位の並べ (server/live/src/daily/api.ts)・締めの台本 (scripts/_daily-roll-entry.ts)・シェアの順位 (daily-share) が同じここを呼ぶ。
 * 効くのは SCORE_FROM の日から。前の締めた日の順位・称号は費用の順 (同じなら先に出した人) のまま
 */

/** スコアで並べる最初の日 ("YYYY-MM-DD")。まだ締めていない 11-11 のお題から (11-11 オーナー「その仕組み採用でスコアも採用。出しておk」) */
export const SCORE_FROM: string | null = "2026-11-11";

/** その日 ("YYYY-MM-DD"、お題の id "dYYYY-MM-DD" も可) がスコアで並べる日か。dev = 開発版の画面 (前の日もスコアで見せる) */
export function byScore(day: string, dev = false): boolean {
  const d = day.replace(/^d/, "");
  return dev || (SCORE_FROM != null && d >= SCORE_FROM);
}

/** スコア (0.1 で丸め)。完成率 0 は null (順位に載らない) */
export function scoreOf(cost: number, rate: number): number | null {
  return rate > 0 ? Math.round((cost * 1000) / rate) / 10 : null;
}

/** 並べの鍵 (小さいほど上)。スコアの日はスコア、前の日は費用 */
export function rankKey(cost: number, rate: number, score: boolean): number {
  return score ? (scoreOf(cost, rate) ?? Infinity) : cost;
}

/** 並べ (小さいほど上)。ms = 使った時間 (始めてから提出まで)、at = 出した時刻。スコアの日は 鍵 → 時間 → 出した時刻、前の日は 鍵 → 出した時刻。
 * at が無い所 (画面の表 = サーバーの並びのまま) は 0 で同じ扱い = 安定の並べ替えで元の順 */
export function rankCmp(a: { cost: number; rate: number; ms?: number; at?: number }, b: { cost: number; rate: number; ms?: number; at?: number }, score: boolean): number {
  return rankKey(a.cost, a.rate, score) - rankKey(b.cost, b.rate, score) || (score ? (a.ms ?? 0) - (b.ms ?? 0) : 0) || (a.at ?? 0) - (b.at ?? 0);
}

/** サーバーの SQL の並べ (daily_tries の列 t.cost・t.rate・t.started_at・t.submitted_at)。スコアは scoreOf と同じ丸め (0.1) で比べる */
export function rankOrderSql(score: boolean): string {
  return score ? "ROUND(t.cost * 1000.0 / t.rate) / 10, t.submitted_at - t.started_at, t.submitted_at" : "t.cost, t.submitted_at";
}

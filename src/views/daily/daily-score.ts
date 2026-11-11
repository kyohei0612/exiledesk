/**
 * daily-score.ts — 順位のスコア (D-02b、11-11 オーナー「スコア（費用÷完成率）を出して順位付けしようか」)。
 * スコア = 完成 1 個あたりの費用 ÷ 完成率 (割合)。小さいほど上、同じなら先に出した人。
 * 画面の順位 (daily-api の rankOf)・サーバーの順位の並べ (server/live/src/daily/api.ts)・締めの台本 (scripts/_daily-roll-entry.ts)・シェアの順位 (daily-share) が同じここを呼ぶ。
 * 効くのは SCORE_FROM の日から。前の締めた日の順位・称号は費用の順のまま。出すまでは null で、開発版の画面だけスコアで並べる
 */

/** スコアで並べる最初の日 ("YYYY-MM-DD")。出す時にその日を入れる (オーナーの「出して」の後) */
export const SCORE_FROM: string | null = null;

/** その日 ("YYYY-MM-DD"、お題の id "dYYYY-MM-DD" も可) がスコアで並べる日か。dev = 開発版の画面 (出す前に見せる) */
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

/** サーバーの SQL の並べ (daily_tries の列 t.cost・t.rate・t.submitted_at) */
export function rankOrderSql(score: boolean): string {
  return score ? "t.cost * 100.0 / t.rate, t.submitted_at" : "t.cost, t.submitted_at";
}

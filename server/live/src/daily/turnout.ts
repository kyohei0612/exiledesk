/**
 * お題ごとの参加の数と諦めた人の並び (D-50f・D-50g)。`daily_tries` の今の列 (started_at・submitted_at・gave_up_at) を数えるだけ。
 * 名前は返さない (諦めた人の一覧は匿名 = 画面が「失敗エグザイルA」… と振る、オーナー 11-14「匿名性がいいから失敗エグザイルA で表示」)。
 * 始める前の諦め (今日のレシピを見るために諦めた人 = 始めた時刻と諦めた時刻が同じ、D-50c) は挑戦に数えない。
 */
import { SUBMIT_GRACE_MS, TIME_LIMIT_MS } from "./time";

export type TurnRow = { topic_id: string; started_at: number; submitted_at: number | null; gave_up_at: number | null };
/** tried = 挑戦した人 (始める前の諦めを除く) = submitted + gaveUp + timeout + playing */
export type Turnout = { tried: number; submitted: number; gaveUp: number; timeout: number; playing: number };
/** 諦めた人の 1 行: ms = 始めてから諦めまで (時間切れは 1 時間)、timeout = 時間切れ */
export type OutRow = { ms: number; timeout?: true };

export function turnoutOf(rows: TurnRow[], now: number): { counts: Turnout; out: OutRow[] } {
  const counts: Turnout = { tried: 0, submitted: 0, gaveUp: 0, timeout: 0, playing: 0 };
  const out: OutRow[] = [];
  for (const r of rows) {
    if (r.submitted_at) { counts.tried++; counts.submitted++; continue; }
    if (r.gave_up_at) {
      if (r.gave_up_at <= r.started_at) continue; // 始める前の諦め
      counts.tried++; counts.gaveUp++;
      out.push({ ms: Math.min(r.gave_up_at - r.started_at, TIME_LIMIT_MS) });
      continue;
    }
    counts.tried++;
    if (now > r.started_at + TIME_LIMIT_MS + SUBMIT_GRACE_MS) { counts.timeout++; out.push({ ms: TIME_LIMIT_MS, timeout: true }); }
    else counts.playing++;
  }
  // 粘った時間の長い順 (同じなら時間切れが先)
  out.sort((a, b) => b.ms - a.ms || Number(!!b.timeout) - Number(!!a.timeout));
  return { counts, out };
}

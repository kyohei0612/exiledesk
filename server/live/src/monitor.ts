/**
 * 見張り (2026-10-07 オーナー「色々監視できる？」)。数字の日報を Discord に流すのは 10-26 にやめた (オーナー「既定の報告はいらなくなった」、毎朝 9 時の AI の評価と見解だけ #日報 へ = ai-review.ts)。
 *   - alert():  異常を控える (同じ物は 6 時間に 1 回まで。KV の alertlog: に 2 日残し、手元の scripts/pull-server-notes.mjs が毎朝読む)
 *   - reqLog(): 1 回ごとの記録 (ダッシュボードの「ログ」で見る。path・status・ms・国)
 */
import type { Env, Fetch } from "./types";

const ALERT_TTL = 6 * 3600;
const ALERT_LOG_TTL = 2 * 86400;

/**
 * 異常を控える。同じ key は ALERT_TTL の間は 1 回だけ。alertlog: に残すだけで Discord には送らない (2026-10-08 オーナー「定時報告とバグのリアルタイム通知のみ」)。
 * 前は毎朝の日報の投稿に載せていた。今は毎朝の AI の評価と見解の材料 (scripts/pull-server-notes.mjs が data-cache/logs/<日>-server.json に)
 */
export async function alert(env: Env, key: string, text: string, _fetchFn: Fetch = fetch, now = new Date()): Promise<boolean> {
  const k = `alert:${key}`;
  if (await env.LIVE.get(k)) return false;
  await env.LIVE.put(k, now.toISOString(), { expirationTtl: ALERT_TTL });
  await env.LIVE.put(`alertlog:${now.toISOString()}:${key}`, text.slice(0, 200), { expirationTtl: ALERT_LOG_TTL });
  console.warn(JSON.stringify({ alert: key, text: text.slice(0, 200) }));
  return true;
}

/** 1 回ごとの記録 (JSON 1 行。ダッシュボードのログで絞り込める) */
export function reqLog(req: Request, url: URL, status: number, ms: number, extra: Record<string, unknown> = {}): void {
  const cf = (req as Request & { cf?: { country?: string } }).cf;
  console.log(JSON.stringify({ path: url.pathname, status, ms: Math.round(ms), country: cf?.country ?? null, ...extra }));
}

/** 日本時間の「昨日」の始まりと終わり (UTC の ISO)、1 週間前。today = true なら「今日のここまで」(確かめ用) */
export function yesterdayJst(now = new Date(), today = false): { since: string; until: string; weekSince: string; label: string } {
  // 日報は 9:00 (JST) が境 (2026-10-10 オーナー「9:00 報告なら 9:00 を境に。今朝の報告は昨日の 9:01 から今朝の 8:59 まで」)。
  // 9:00 JST = 0:00 UTC。前は「昨日 0〜24 時」で、夜中〜朝の分が 1 日遅れて載っていた
  const nine = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(today ? nine : nine - 86400e3), until = today ? now : new Date(nine), weekSince = new Date(until.getTime() - 7 * 86400e3);
  return { since: since.toISOString(), until: until.toISOString(), weekSince: weekSince.toISOString(), label: today ? "今日のここまで" : "この 24 時間" };
}

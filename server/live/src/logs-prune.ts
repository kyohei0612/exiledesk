/**
 * D1 の記録を大きさで整理する (2026-10-28 オーナー「ギガで管理だな３ＧＢ上限で設定あふっれたら古い奴から整理」、設計図 Y-66)。
 *   毎朝 9:00 (JST、cron `0 0 * * *`) に 1 回だけ。期間では消さない
 *   1. D1 の大きさ (どの問い合わせにも付く meta.size_after) が 3 GB 以下なら何もしない (読むのは 1 行だけ)
 *   2. 超えていたら中身の大きさ (logs の body + fb_images の data) を数える。SQLite は消しても入れ物が縮まず空きを使い回すので、
 *      入れ物の大きさだけで決めると毎朝消し続けてしまう。中身が 3 GB 以下なら消さない
 *   3. 中身が 3 GB を超えていたら、logs を古い日から日ごと消して 2.7 GB まで下げる (毎朝少しずつ消し続けないよう 1 割空ける)。今日の分は消さない
 * 消したら alert に控える (毎朝の AI の評価と見解が読む)。シェア・要望の画像・記録しない端末の表は触らない (画像は 90 日で別に消える)
 */
import type { Env } from "./types";
import { alert } from "./monitor";

/** 上限 (バイト)。D1 の無料の上限は 5 GB */
export const LOGS_LIMIT_BYTES = 3e9;
/** 消す時に下げる先 */
export const LOGS_TARGET_BYTES = 2.7e9;
/** 1 回の DELETE で消す行の数 (1 つの問い合わせを重くしない) */
const BATCH = 5000;

export interface PruneResult { size: number; data: number | null; days: string[]; deleted: number }

export async function pruneLogs(db: D1Database, today: string, limit = LOGS_LIMIT_BYTES, target = LOGS_TARGET_BYTES): Promise<PruneResult> {
  const size = (await db.prepare("SELECT 1").run()).meta.size_after;
  if (size <= limit) return { size, data: null, days: [], deleted: 0 };
  const perDay = (await db.prepare("SELECT day, SUM(length(CAST(body AS BLOB))) AS b FROM logs GROUP BY day ORDER BY day").all<{ day: string; b: number }>()).results;
  const img = (await db.prepare("SELECT COALESCE(SUM(length(data)), 0) AS b FROM fb_images").first<{ b: number }>())?.b ?? 0;
  let data = img + perDay.reduce((a, r) => a + r.b, 0);
  const total = data;
  if (data <= limit) return { size, data, days: [], deleted: 0 };
  const days: string[] = [];
  for (const r of perDay) {
    if (data <= target || r.day >= today) break;
    days.push(r.day);
    data -= r.b;
  }
  let deleted = 0;
  if (days.length) {
    const last = days[days.length - 1];
    for (;;) {
      const n = (await db.prepare("DELETE FROM logs WHERE id IN (SELECT id FROM logs WHERE day <= ? LIMIT ?)").bind(last, BATCH).run()).meta.changes;
      deleted += n;
      if (n < BATCH) break;
    }
  }
  return { size, data: total, days, deleted };
}

/** 毎朝の cron から。消した時だけ控える */
export async function pruneLogsDaily(env: Env, now = new Date()): Promise<void> {
  if (!env.LOGS) return;
  const today = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const r = await pruneLogs(env.LOGS, today);
  const gb = (b: number): string => (b / 1e9).toFixed(2);
  if (r.deleted) await alert(env, "記録の整理", `D1 ${gb(r.size)} GB・中身 ${gb(r.data ?? 0)} GB が上限 ${gb(LOGS_LIMIT_BYTES)} GB を超えたので ${r.days[0]}〜${r.days[r.days.length - 1]} の記録 ${r.deleted} 行を消した`);
}

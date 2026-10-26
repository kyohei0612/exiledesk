/**
 * AI の評価と見解の全文を #日報 に流す (2026-10-26 オーナー「日報に全文くれ。今の日報読みづらいし要点だけだからな」)。
 * 手元の scripts/post-ai-review.mjs が docs/org/analytics/daily/<日>-ai.md を Discord 向けの塊 (2000 字まで) に切って D1 の ai_review に置く。
 * ここは置かれた物を REPORT_WEBHOOK (日報報告君、無ければ DISCORD_WEBHOOK) で古い順に流し、流せた所まで sent を進め、全部流したら posted_at を付けるだけ。
 * 同じ日は 1 回だけ (day が主キー、流した日は台本が置き直さない)。入口は POST /ai-review/flush (中身は受け取らない = 置いた物しか流せない) と毎時の cron。KV は使わない
 */
import type { Env, Fetch } from "./types";

/** 1 回で流す塊の上限 (Discord の webhook は 2 秒に 5 回まで。サブリクエストの枠 50 の内) */
const MAX_POSTS = 20;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function flushAiReview(env: Env, fetchFn: Fetch = fetch, now = Date.now()): Promise<{ posted: number; days: string[]; error?: string }> {
  const hook = (env.REPORT_WEBHOOK ?? env.DISCORD_WEBHOOK ?? "").trim();
  if (!env.LOGS || !hook) return { posted: 0, days: [], error: "置き場か webhook が無い" };
  const rows = (await env.LOGS.prepare("SELECT day, chunks, sent FROM ai_review WHERE posted_at IS NULL ORDER BY day LIMIT 3").all<{ day: string; chunks: string; sent: number }>()).results ?? [];
  let posted = 0;
  const days: string[] = [];
  for (const row of rows) {
    const chunks = JSON.parse(row.chunks) as string[];
    let sent = row.sent;
    while (sent < chunks.length && posted < MAX_POSTS) {
      const r = await fetchFn(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: chunks[sent]!.slice(0, 2000), allowed_mentions: { parse: [] } }) });
      if (!r.ok) {
        await env.LOGS.prepare("UPDATE ai_review SET sent = ? WHERE day = ?").bind(sent, row.day).run();
        return { posted, days, error: `Discord ${r.status}` };
      }
      sent++; posted++;
      await wait(500);
    }
    await env.LOGS.prepare("UPDATE ai_review SET sent = ?, posted_at = ? WHERE day = ?").bind(sent, sent >= chunks.length ? now : null, row.day).run();
    if (sent >= chunks.length) days.push(row.day);
    if (posted >= MAX_POSTS) break;
  }
  return { posted, days };
}

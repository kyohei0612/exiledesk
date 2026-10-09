/**
 * 分析用の記録 (2026-10-09 オーナー「ユーザーのデータを分析できるようにログはしっかり残そう。分析に使えるやつは全てログに。
 * サーバー重くならない仕組みで」「重くならないならサーバーで保管」)。
 *
 * 送る側 (src/services/telemetry/log-sender.ts) が 1 分おき・画面を離れる時にまとめて POST /log。サーバーは中身を解かずに
 * (CPU を使わない) D1 に 1 行ずつ置く (無料 10 万行/日・5 GB)。取り出しは GET /logs/day?day=YYYY-MM-DD&key= (1 行 1 まとまりの JSONL)、
 * 手元には scripts/pull-logs.mjs。日報に昨日の件数を載せる。
 */
import type { Env } from "./types";

/** 1 まとまりの上限 (これより大きい物は捨てる。送る側は 200 件・約 200 KB で切る) */
export const MAX_BODY = 512 * 1024;

/** 日本時間の日付 */
export const jstDay = (d = new Date()): string => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

/** まとまりを置く。中身は JSON の文字列のまま (頭の app と n だけ見る) */
export async function saveLog(env: Env, text: string, country: string, now = new Date()): Promise<"ok" | string> {
  if (!env.LOGS) return "置き場が無い";
  if (!text || text.length > MAX_BODY) return "大きすぎる";
  // 頭の 200 文字から app と n を拾う (送る側が先頭に置く。全体は解かない)
  const head = text.slice(0, 200);
  const app = /"app":"(web|app)"/.exec(head)?.[1];
  const n = Number(/"n":(\d{1,4})/.exec(head)?.[1] ?? NaN);
  if (!app || !Number.isFinite(n) || text[0] !== "{") return "形が違う";
  await env.LOGS.prepare("INSERT INTO logs (at, day, app, country, n, body) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(now.toISOString(), jstDay(now), app, country || null, n, text).run();
  return "ok";
}

/** その日のまとまりを JSONL で (1 行 1 まとまり。受け取った時刻と国を頭に足す) */
export async function dayLogs(env: Env, day: string): Promise<string> {
  if (!env.LOGS) return "";
  const r = await env.LOGS.prepare("SELECT at, country, body FROM logs WHERE day = ? ORDER BY id").bind(day).all<{ at: string; country: string | null; body: string }>();
  return (r.results ?? []).map((x) => `{"at":"${x.at}","country":${JSON.stringify(x.country)},"b":${x.body}}`).join("\n");
}

/** その日の件数 (まとまりの数と記録の数) */
export async function dayCount(env: Env, day: string): Promise<{ batches: number; records: number } | null> {
  if (!env.LOGS) return null;
  const r = await env.LOGS.prepare("SELECT COUNT(*) AS b, COALESCE(SUM(n), 0) AS r FROM logs WHERE day = ?").bind(day).first<{ b: number; r: number }>();
  return r ? { batches: r.b, records: r.r } : null;
}

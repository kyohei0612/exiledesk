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
  const r = await env.LOGS.prepare("SELECT at, country, body FROM logs WHERE day = ? AND at >= ? ORDER BY id").bind(day, env.STATS_SINCE ?? "").all<{ at: string; country: string | null; body: string }>();
  return (r.results ?? []).map((x) => `{"at":"${x.at}","country":${JSON.stringify(x.country)},"b":${x.body}}`).join("\n");
}

/** その日の件数 (まとまりの数と記録の数) */
export async function dayCount(env: Env, day: string): Promise<{ batches: number; records: number } | null> {
  if (!env.LOGS) return null;
  const r = await env.LOGS.prepare("SELECT COUNT(*) AS b, COALESCE(SUM(n), 0) AS r FROM logs WHERE day = ? AND at >= ?").bind(day, env.STATS_SINCE ?? "").first<{ b: number; r: number }>();
  return r ? { batches: r.b, records: r.r } : null;
}

/** その時間の件数 (日報の 9:00〜9:00。at は UTC の ISO) */
export async function countBetween(env: Env, since: string, until: string): Promise<{ batches: number; records: number } | null> {
  if (!env.LOGS) return null;
  const r = await env.LOGS.prepare("SELECT COUNT(*) AS b, COALESCE(SUM(n), 0) AS r FROM logs WHERE at >= ? AND at < ?").bind(since, until).first<{ b: number; r: number }>();
  return r ? { batches: r.b, records: r.r } : null;
}

/** Discord に送る 1 ファイルの上限 (2026-10-09 オーナー指定)。行の途中では切らない */
export const FILE_MAX = 8 * 1024 * 1024;

/** JSONL を行の切れ目で FILE_MAX バイト (UTF-8) 以下ずつに分ける。1 行で超える物はその行だけで 1 本 */
export function splitJsonl(text: string, max = FILE_MAX): string[] {
  if (!text) return [];
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur: string[] = [];
  let size = 0;
  for (const line of text.split("\n")) {
    const n = enc.encode(line).length + 1;
    if (cur.length && size + n > max) { out.push(cur.join("\n")); cur = []; size = 0; }
    cur.push(line);
    size += n;
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}

/**
 * その日の記録のお知らせを Discord (LOGS_WEBHOOK) へ 1 通だけ (毎朝 9 時の cron と GET /logs/send)。D1 からは消さない。
 * 2026-10-13 オーナー「日報の送信が変、めちゃくちゃ多重でくる、整理して」: 前はファイルを付けて送り、大きすぎて 413 の時に 1 本ずつ送り直していたので、
 * ファイルの数だけ投稿が来ていた。記録は D1 にあり取り出しは GET /logs/day か scripts/pull-logs.mjs なので、ファイルは付けず行数と大きさの 1 行だけ
 */
export async function sendDayLogs(env: Env, day: string, fetchFn: typeof fetch = fetch): Promise<{ ok: boolean; files: number; bytes: number; lines: number; error?: string }> {
  if (!env.LOGS_WEBHOOK) return { ok: false, files: 0, bytes: 0, lines: 0, error: "LOGS_WEBHOOK が無い" };
  const text = await dayLogs(env, day);
  const lines = text ? text.split("\n").length : 0;
  const bytes = new TextEncoder().encode(text).length;
  const content = `**分析用の記録 ${day}** ${lines} 行 · ${(bytes / 1024 / 1024).toFixed(2)} MB (取り出しは scripts/pull-logs.mjs)`;
  const r = await fetchFn(env.LOGS_WEBHOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
  return { ok: r.ok, files: 0, bytes, lines, ...(r.ok ? {} : { error: `Discord ${r.status}` }) };
}


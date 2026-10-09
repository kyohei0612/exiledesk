#!/usr/bin/env node
/**
 * pull-logs.mjs — 分析用の記録 (server/live の D1) を日ごとに手元へ (2026-10-09)
 *   node scripts/pull-logs.mjs [YYYY-MM-DD ...]   (日付が無ければ昨日。日本時間)
 * 置き場: data-cache/logs/<日付>.jsonl (1 行 = 届いた 1 まとまり: {at, country, b: {app, n, v, uid, sid, dev, recs: [{k, t, d}]}})
 * key は環境変数 EXILEDESK_LIVE_KEY (server/live の REFRESH_KEY と同じ)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev";
const KEY = process.env.EXILEDESK_LIVE_KEY;
if (!KEY) { console.error("EXILEDESK_LIVE_KEY が無い (server/live の REFRESH_KEY)"); process.exit(1); }
const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
const days = process.argv.slice(2).length ? process.argv.slice(2) : [yesterday];
const out = resolve(ROOT, "data-cache/logs");
mkdirSync(out, { recursive: true });
for (const day of days) {
  const r = await fetch(`${BASE}/logs/day?day=${day}&key=${encodeURIComponent(KEY)}`);
  if (!r.ok) { console.error(day, r.status, await r.text()); continue; }
  const text = await r.text();
  writeFileSync(resolve(out, `${day}.jsonl`), text);
  const lines = text ? text.split("\n").length : 0;
  console.log(`${day}: ${lines} まとまり → data-cache/logs/${day}.jsonl`);
}

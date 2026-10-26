#!/usr/bin/env node
/**
 * post-ai-review.mjs — AI の評価と見解の全文を Discord の #日報 に流す (2026-10-26 オーナー「日報に全文くれ。今の日報読みづらいし要点だけだからな」)
 *   node scripts/post-ai-review.mjs <YYYY-MM-DD> [--dry]   (日付が無ければ昨日。日本時間。--dry は切った塊を出すだけで置かない・流さない)
 * docs/org/analytics/daily/<日>-ai.md を Discord で読める形 (見出しは太字、表は箇条書き) にし、見出しごとに 2000 字までの塊に切って本番の D1 の ai_review に置き、
 * server/live の POST /ai-review/flush を 1 回叩く → Worker が日報報告君の webhook (secret の REPORT_WEBHOOK) で順に流す (server/live/src/ai-review.ts)。
 * webhook の URL は手元に持たない。同じ日は 1 回だけ (流した日は置き直さない。D1 の posted_at が印、KV は使わない)。
 * 毎朝 9:05 の日報の予定のタスクが <日>-ai.md を書いた後に回す
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = resolve(ROOT, "server/live");
const BASE = process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev";
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
const LIMIT = 1900; // Discord の 1 回の上限は 2000 字。少し余らせる

const md = readFileSync(resolve(ROOT, `docs/org/analytics/daily/${day}-ai.md`), "utf8");

/** md → Discord の文 (見出しは太字、表は「見出し: 値」の箇条書き、ほかはそのまま) */
function toDiscord(text) {
  const out = [];
  let head = null;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const cells = /^\s*\|(.*)\|\s*$/.exec(line)?.[1].split("|").map((s) => s.trim());
    if (cells) {
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!head) { head = cells; continue; }
      out.push(`- ${cells[0]}: ${cells.slice(1).map((c, i) => (head[i + 1] ? `${head[i + 1]} ${c}` : c)).join(" · ")}`);
      continue;
    }
    head = null;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) out.push(h[1].length === 1 ? `📝 **${h[2]}**` : `\n**${h[2].replace(/\*\*/g, "")}**`);
    else out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 見出し (太字の行) ごとに分け、2000 字までに詰める。1 つの節が長すぎる時は行で切る */
function chunk(text) {
  const parts = text.split(/\n(?=\n\*\*)/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let cur = "";
  const push = (s) => { if (cur && cur.length + 2 + s.length > LIMIT) { out.push(cur); cur = ""; } cur = cur ? `${cur}\n\n${s}` : s; };
  for (const p of parts) {
    if (p.length <= LIMIT) { push(p); continue; }
    for (const line of p.split("\n")) {
      if (line.length > LIMIT) { for (let i = 0; i < line.length; i += LIMIT) push(line.slice(i, i + LIMIT)); } else if (cur.length + 1 + line.length > LIMIT) { out.push(cur); cur = line; } else cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const chunks = chunk(toDiscord(md));
console.log(`${day}: ${chunks.length} 回に分けて流す (${chunks.map((c) => c.length).join("・")} 字)`);
if (DRY) { for (const c of chunks) console.log(`----\n${c}`); process.exit(0); }

// wrangler は node で直に (daily-summary.mjs と同じ。shell を通すと SQL の空白で引数が崩れる)
const WRANGLER = resolve(LIVE, "node_modules/wrangler/bin/wrangler.js");
const wr = (a) => execFileSync(process.execPath, [WRANGLER, ...a], { windowsHide: true, cwd: LIVE, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"] });
const q = (sql) => { const s = wr(["d1", "execute", "exiledesk-logs", "--remote", "--json", "--command", sql]); return JSON.parse(s.slice(s.indexOf("[")))[0].results; };
const prev = q(`SELECT sent, posted_at FROM ai_review WHERE day = '${day}'`)[0];
if (prev?.posted_at) { console.log(`${day} はもう流した (同じ日は 1 回だけ)`); process.exit(0); }
if (prev && prev.sent > 0) console.log(`${day} は途中まで流れている (${prev.sent} 回目まで)。置き直さず続きを流す`);
else {
  // 塊は JSON で 1 行に。SQL は一時のファイルで渡す (コマンドの引数だと引用符が崩れる)
  const dir = mkdtempSync(join(tmpdir(), "ai-review-"));
  const f = join(dir, "put.sql");
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
  writeFileSync(f, `INSERT OR REPLACE INTO ai_review (day, chunks, at, sent, posted_at) VALUES (${lit(day)}, ${lit(JSON.stringify(chunks))}, ${Date.now()}, 0, NULL);\n`);
  try { wr(["d1", "execute", "exiledesk-logs", "--remote", "--file", f, "-y"]); } finally { rmSync(dir, { recursive: true, force: true }); }
  console.log(`D1 に置いた`);
}
const r = await fetch(`${BASE}/ai-review/flush`, { method: "POST" });
console.log(`流した: ${r.status} ${await r.text()}`);

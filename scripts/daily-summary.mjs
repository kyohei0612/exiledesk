#!/usr/bin/env node
/**
 * daily-summary.mjs — 毎朝の日報のまとめ (2026-10-21、オーナー「Discord の日報はセッションに送って分析君にまとめさせる、毎朝」)
 *   node scripts/daily-summary.mjs [YYYY-MM-DD]   (日付が無ければ昨日。日本時間)
 * Discord の日報 (Analytics Engine の数字) は手元から読めないので、D1 の記録 (pull-logs.mjs) と要望 (KV fb:) から作る。
 * 書く物: docs/org/analytics/daily/<日付>.md (昨日の訪問・PV・画面ごと・ブログの記事ごと・前の日と前の週の同じ曜日との差・要望)。
 * 毎朝 9:15 の予定のタスク (exiledesk-daily-summary) が動かし、分析君がこの md を読んで 3〜5 行でブラックへ。commit・送信はしない。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = resolve(ROOT, "server/live");
const WRANGLER = resolve(LIVE, "node_modules/wrangler/bin/wrangler.js");
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const shift = (day, n) => jstDay(Date.parse(`${day}T00:00:00+09:00`) + n * 86400e3);
const day = process.argv[2] ?? jstDay(Date.now() - 86400e3);
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`日付の形が違う: ${day}`);
const prev = shift(day, -1), week = shift(day, -7);
const logFile = (d) => resolve(ROOT, `data-cache/logs/${d}.jsonl`);

// 1. 記録を取る (3 日とも毎回取り直す。手元のファイルはその日の途中で取った物のことがある)
execFileSync(process.execPath, [resolve(ROOT, "scripts/pull-logs.mjs"), day, prev, week], { windowsHide: true, cwd: ROOT, stdio: "inherit" });

// 2. 日ごとの数字 (analyze-logs.py --json) と、昨日の全文
const py = (args) => execFileSync("python", [resolve(ROOT, "scripts/analyze-logs.py"), ...args], { windowsHide: true, cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
const stats = (d) => (existsSync(logFile(d)) ? JSON.parse(py([logFile(d), "--json"])) : null);
const [cur, p1, p7] = [stats(day), stats(prev), stats(week)];
const full = py([logFile(day)]);

// 3. 要望 (KV fb:<逆順の時刻>:<id>)。昨日の 0 時から今まで (朝に来た物も 1 日早く拾う)。連絡先・uid は持ち出さない
const wr = (args) => execFileSync(process.execPath, [WRANGLER, ...args], { windowsHide: true, cwd: LIVE, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
const since = Date.parse(`${day}T00:00:00+09:00`);
let feedback = [], fbError = null;
try {
  const keys = JSON.parse(wr(["kv", "key", "list", "--binding", "LIVE", "--remote", "--prefix", "fb:"])).map((k) => k.name);
  const recent = keys.filter((k) => 1e13 - Number(k.split(":")[1]) >= since - 60e3);
  feedback = recent.map((k) => JSON.parse(wr(["kv", "key", "get", "--binding", "LIVE", "--remote", k]))).filter((f) => Date.parse(f.at) >= since);
} catch (e) { fbError = String(e).slice(0, 200); }

// 3b. Discord の書き込み (server/live の Bot が今朝 9:03 に D1 の discord_daily に置いた 1 日分、src/discord.ts。2026-10-24)
const today = shift(day, 1);
const hm = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
let discordMd;
try {
  const rows = JSON.parse(wr(["d1", "execute", "exiledesk-logs", "--remote", "--json", "--command", `SELECT body FROM discord_daily WHERE day = '${today}'`]))[0].results;
  const d = rows[0] ? JSON.parse(rows[0].body) : null;
  if (!d) discordMd = `(${today} の分が無い: 9:03 の Bot の回が動いていない)`;
  else if (d.status === "未設定") discordMd = "Bot 未設定 (トークンか読むチャンネルが無い。docs/org/analytics/notes/2026-10-24-discord-bot.md)";
  else discordMd = d.channels.map((c) => `### チャンネル ${c.id} (${c.messages.length} 件${c.error ? `、読めなかった: ${c.error}` : ""})\n` + (c.messages.map((m) => `- ${hm(m.at)} · ${m.author}${m.webhook ? " (webhook)" : m.bot ? " (bot)" : ""}: ${m.text.replace(/\s+/g, " ").slice(0, 400)}${m.files.length ? ` [添付 ${m.files.join(", ")}]` : ""}`).join("\n") || "(無し)")).join("\n\n");
} catch (e) { discordMd = /no such table/i.test(`${e} ${e?.stdout ?? ""}`) ? "Bot 未設定 (本番の D1 に表がまだ無い。migrations/0009_discord.sql)" : `読めなかった: ${String(e).slice(0, 200)}`; }

// 4. md に書く
const diff = (a, b) => (b == null ? "—" : `${a - b >= 0 ? "+" : ""}${a - b}`);
const row = (name, key) => `| ${name} | ${cur[key]} | ${diff(cur[key], p1?.[key])} | ${diff(cur[key], p7?.[key])} |`;
const per = (s) => (s && s.visits ? (s.pv / s.visits).toFixed(2) : "—");
const counts = (obj, ref1, ref7) => Object.entries(obj).map(([k, v]) => `| ${k} | ${v} | ${diff(v, ref1 ? ref1[k] ?? 0 : null)} | ${diff(v, ref7 ? ref7[k] ?? 0 : null)} |`).join("\n");
const jst = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ");
const md = `# 日報のまとめ ${day} (JST)

出どころ: D1 の記録 (pull-logs.mjs → analyze-logs.py) と要望 (KV)。Discord の日報 (Analytics Engine) とは数え方が違う。差は 前の日 ${prev} / 前の週の同じ曜日 ${week}${p7 ? "" : " (記録なし)"}。

## 数字
| | ${day} | 前の日との差 | 前の週との差 |
|---|---|---|---|
${row("訪問", "visits")}
${row("人", "people")}
${row("PV", "pv")}
${row("PV (PC)", "pv_pc")}
${row("PV (スマホ)", "pv_mobile")}
${row("初めての訪問", "first")}
${row("1 手打った訪問", "used_visits")}
${row("1 手 (エミュレーター)", "uses")}
| PV / 訪問 | ${per(cur)} | 前の日 ${per(p1)} | 前の週 ${per(p7)} |

どこから: ${Object.entries(cur.ref).map(([k, v]) => `${k} ${v}`).join("、")}

## 画面ごと (切り替えの回数)
| 画面 | 回数 | 前の日との差 | 前の週との差 |
|---|---|---|---|
${counts(cur.screens, p1?.screens, p7?.screens)}

## ブログ (記事:言語 ごとの PV)
${Object.keys(cur.blog).length ? `| 記事:言語 | PV | 前の日との差 | 前の週との差 |\n|---|---|---|---|\n${counts(cur.blog, p1?.blog, p7?.blog)}` : "(記録なし)"}

## 要望・バグ (${day} 0 時から今まで ${feedback.length} 件)
${fbError ? `読めなかった: ${fbError}` : feedback.map((f) => `- ${f.id} · ${jst(f.at)} · v${f.context?.version ?? "?"} · ${f.context?.lang ?? ""} · ${f.context?.base ?? ""}\n  - ${String(f.text).replace(/\s+/g, " ").slice(0, 400)}\n  - ${(f.context?.summaryJa ?? []).join(" / ").replace(/\s+/g, " ").slice(0, 300)}`).join("\n") || "(無し)"}

## Discord の書き込み (Bot が ${today} 9:03 に取った分)
${discordMd}

## 全文 (analyze-logs.py)
\`\`\`
${full.trim()}
\`\`\`
`;
const out = resolve(ROOT, `docs/org/analytics/daily/${day}.md`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, md);
console.log(`書いた: ${out}`);

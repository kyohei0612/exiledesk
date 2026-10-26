#!/usr/bin/env node
/**
 * pull-server-notes.mjs — 記録 (D1 の logs) の外にある、その日のサーバーの材料を 1 つの JSON に (2026-10-26、毎朝の AI の評価と見解が読む)
 *   node scripts/pull-server-notes.mjs [YYYY-MM-DD ...]   (日付が無ければ昨日。日本時間。pull-logs.mjs も最後にこれを回す)
 * 置き場: data-cache/logs/<日>-server.json = {
 *   alerts:   サーバーの異常 (KV alertlog:<時刻>:<種類>、相場が取れない・サーバーのエラー等。配信の見張りは除く) [{ at, kind, text }]
 *   feedback: 要望・バグ (KV fb:、その日の 0 時から今まで) [{ id, at, kind, text, version, lang, base, summary }]。連絡先・uid・IP は持ち出さない
 *   discord:  Discord の書き込み (D1 の discord_daily の次の日の行 = その朝 9:03 に Bot が取った分、src/discord.ts) か null
 *   errors:   読めなかった物の訳
 * }
 * 前は数字の日報 (daily-summary.mjs、10-26 に消した) の md にだけ載っていた
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = resolve(ROOT, "server/live");
const WRANGLER = resolve(LIVE, "node_modules/wrangler/bin/wrangler.js");
const wr = (args) => execFileSync(process.execPath, [WRANGLER, ...args], { windowsHide: true, cwd: LIVE, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const days = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!days.length) days.push(jstDay(Date.now() - 86400e3));
const out = resolve(ROOT, "data-cache/logs");
mkdirSync(out, { recursive: true });

for (const day of days) {
  const since = Date.parse(`${day}T00:00:00+09:00`);
  const note = { day, alerts: [], feedback: [], discord: null, errors: [] };
  try {
    const from = new Date(since).toISOString(), to = new Date(since + 86400e3).toISOString();
    note.alerts = JSON.parse(wr(["kv", "key", "list", "--binding", "LIVE", "--remote", "--prefix", "alertlog:"]))
      .map((k) => k.name.slice("alertlog:".length)).filter((n) => n.slice(0, 24) >= from && n.slice(0, 24) < to && !n.slice(25).startsWith("配信の見張り"))
      .map((n) => ({ at: n.slice(0, 24), kind: n.slice(25) }));
    for (const a of note.alerts) { try { a.text = wr(["kv", "key", "get", "--binding", "LIVE", "--remote", `alertlog:${a.at}:${a.kind}`]).trim(); } catch { /* 文は無くてよい */ } }
  } catch (e) { note.errors.push(`異常: ${String(e).slice(0, 200)}`); }
  try {
    // fb:<1e13 - 時刻>:<id>。その日の 0 時から今まで (朝に来た物も拾う)
    const keys = JSON.parse(wr(["kv", "key", "list", "--binding", "LIVE", "--remote", "--prefix", "fb:"])).map((k) => k.name).filter((k) => 1e13 - Number(k.split(":")[1]) >= since - 60e3);
    note.feedback = keys.map((k) => JSON.parse(wr(["kv", "key", "get", "--binding", "LIVE", "--remote", k]))).filter((f) => Date.parse(f.at) >= since)
      .map((f) => ({ id: f.id, at: f.at, kind: f.kind, text: f.text, version: f.context?.version, lang: f.context?.lang, base: f.context?.base, summary: f.context?.summaryJa }));
  } catch (e) { note.errors.push(`要望: ${String(e).slice(0, 200)}`); }
  try {
    const next = jstDay(since + 86400e3);
    const s = wr(["d1", "execute", "exiledesk-logs", "--remote", "--json", "--command", `SELECT body FROM discord_daily WHERE day = '${next}'`]);
    const row = JSON.parse(s)[0].results[0];
    note.discord = row ? JSON.parse(row.body) : null;
  } catch (e) { note.errors.push(`Discord: ${String(e).slice(0, 200)}`); }
  writeFileSync(resolve(out, `${day}-server.json`), JSON.stringify(note, null, 1));
  console.log(`${day}: 異常 ${note.alerts.length}・要望 ${note.feedback.length}・Discord ${note.discord ? note.discord.channels.reduce((a, c) => a + c.messages.length, 0) + " 件" : "無し"}${note.errors.length ? `・読めなかった ${note.errors.length}` : ""} → data-cache/logs/${day}-server.json`);
}

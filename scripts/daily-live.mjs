#!/usr/bin/env node
/**
 * daily-live.mjs — デイリーの挑戦中の人の木と動作の控えを取り出す (設計図 D-57b、オーナー 11-12「レシピに保存しなくてもこっちで見れるように」)。
 * 読むだけ。サーバーに読む口は無いので、締めの台本と同じ道で D1 を直に読む (wrangler d1 execute --remote、オーナーのログイン。scripts/_d1-shim.mjs)。
 *   node scripts/daily-live.mjs                       今日のお題の全員 (名前・状態・送った回数・箱の数・シミュで開ける URL)
 *   node scripts/daily-live.mjs --day 2026-11-12      その日のお題
 *   node scripts/daily-live.mjs --name ミラ           その人だけ (名前の一部でも)
 *   node scripts/daily-live.mjs --acts                動作の列も出す (始めてからの分:秒・種類・中身)
 *   node scripts/daily-live.mjs --out <フォルダー>    1 人 1 つの JSON (木・動作・状態) を書く
 *   EXILEDESK_D1_LOCAL=<置き場> を付けると本番でなく手元の D1 (pnpm dev:daily-api の置き場)
 * URL は https://exiledesk.com/web.html#recipe=… の形 (開発版は --base http://localhost:1440/web.html)。開くのは写しなので触っても元は変わらない
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { remoteD1, target } from "./_d1-shim.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const today = new Date(Math.floor((Date.now() + JST - H16) / DAY) * DAY).toISOString().slice(0, 10);
const day = opt("--day") ?? today;
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { console.error("--day YYYY-MM-DD"); process.exit(1); }
const name = opt("--name"), out = opt("--out"), base = opt("--base") ?? "https://exiledesk.com/web.html";
const ACTS = args.includes("--acts");

/** 共有のレシピの URL と同じ詰め方 (src/services/craft-stage/share.ts の packJson: deflate-raw → base64url) */
async function packJson(v) {
  const s = new Blob([new TextEncoder().encode(JSON.stringify(v))]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return Buffer.from(await new Response(s).arrayBuffer()).toString("base64url");
}
const mmss = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
const hm = (ms) => new Date(ms + JST).toISOString().slice(11, 16);

const db = remoteD1();
const topicId = `d${day}`;
const { results } = await db
  .prepare("SELECT n.name, l.first_at, l.at, l.n, l.tree, l.acts, t.started_at, t.submitted_at, t.gave_up_at, t.cost, t.rate FROM daily_live l JOIN daily_nicks n ON n.id = l.nick_id LEFT JOIN daily_tries t ON t.topic_id = l.topic_id AND t.nick_id = l.nick_id WHERE l.topic_id = ? ORDER BY l.first_at")
  .bind(topicId)
  .all();
const rows = results.filter((r) => !name || String(r.name).includes(name));
console.log(`${target()} · お題 ${topicId} · 控えのある人 ${results.length}${name ? ` (「${name}」で ${rows.length})` : ""}`);
if (out) mkdirSync(out, { recursive: true });
for (const r of rows) {
  let tree = null;
  try { tree = r.tree ? JSON.parse(r.tree) : null; } catch { /* 読めない木は URL を出さない */ }
  const acts = String(r.acts ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const state = r.submitted_at ? `提出 (費用 ${r.cost ?? "—"}・完成率 ${r.rate}%)` : r.gave_up_at ? "諦めた" : Date.now() > r.started_at + 3600e3 ? "時間切れ" : "挑戦中";
  const url = tree ? `${base}#recipe=${await packJson({ v: 2, n: `${r.name} (${day} 挑戦中の控え)`, t: tree })}` : null;
  console.log(`\n■ ${r.name} — ${state} · 始め ${hm(r.started_at)} · 控え ${hm(r.first_at)}〜${hm(r.at)} (${r.n} 回) · 動作 ${acts.length}${acts.length ? "" : " (30 日を過ぎて消えたか、まだ無い)"}`);
  console.log(url ? `  開く: ${url}` : "  木が無い (始め方を選ぶ前)");
  if (ACTS) for (const a of acts) { const { t, k, ...rest } = a; console.log(`  ${mmss(Number(t) || 0)} ${k}${Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""}`); }
  if (out) writeFileSync(join(out, `${topicId}-${String(r.name).replace(/[\\/:*?"<>|]/g, "_")}.json`), JSON.stringify({ topicId, name: r.name, state, startedAt: r.started_at, firstAt: r.first_at, at: r.at, sends: r.n, url, tree, acts }, null, 1), "utf8");
}
if (out) console.log(`\n書いた: ${out} (${rows.length} 人)`);

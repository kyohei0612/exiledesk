#!/usr/bin/env node
/**
 * daily-fetch-home.mjs — デイリーの週の取得を家の PC で 1 回 (設計図 Y-53・D-80e、2026-11-09)。予定のタスクで日曜 16:05 JST に回す。
 *   ① 取る: Worker と同じコード (server/live/src/ninja/ の ninjaTick) を、手元の空の SQLite で最後まで回す (上限 400 本)
 *   ② 写す: 締めた後の ninja_job の行と daily_fetch_items を、本番の D1 へ wrangler d1 execute --remote --file で
 *   ③ 組む: 来週の予定 (daily_plan) を scripts/daily-roll.mjs --d1 --week-only で (締め・お題は書かない)
 * 鍵は使わない (Y-90)。D1 はオーナーの wrangler のログインで読み書きする。
 * 確認ページ (403・cf-mitigated・HTML) が 1 本でも出たら、以降の問い合わせを 0 にして止め、品 0 の ninja_job だけを写す = その週は前の週の品のまま。
 * 窓 (日 16:00〜月 16:00 JST) の外で回った時は取らず、その週の予定が無ければ ③ だけ (前の週の型で組む)。
 * その週の ninja_job が本番に 1 行でもあれば取らない (週 1 回)。止めのスイッチは本番の ninja_ctl の home_stop = '1'。
 *
 *   node scripts/daily-fetch-home.mjs [--local] [--no-roll]
 *     --local   = 取るだけで本番に写さない・組まない (取った物の数を出す)。本番の D1 も読まない
 *     --no-roll = ③ を回さない
 * 1 回ごとに docs/org/daily/notes/fetch-home.log へ 1 行 (git には入らない)。
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { inline, localD1, remoteD1, writeSql } from "./_d1-shim.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, "docs/org/daily/notes/fetch-home.log");
const args = process.argv.slice(2);
const LOCAL = args.includes("--local");
const NO_ROLL = args.includes("--no-roll");

const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const jstNow = () => new Date(Date.now() + JST).toISOString().slice(0, 16).replace("T", " ");
function record(line) {
  const l = `${jstNow()} JST ${line}`;
  console.log(l);
  try {
    appendFileSync(LOG, l + "\n");
  } catch {
    /* 記録の置き場が無くても止めない */
  }
}

/** 確認ページを見たら以降は 1 本も送らない fetch */
function guardedFetch() {
  const g = { tripped: null, sent: 0 };
  g.fetch = async (url, init) => {
    if (g.tripped) throw new Error(`確認ページの後なので送らない: ${g.tripped}`);
    g.sent++;
    const res = await fetch(url, init);
    const ct = res.headers.get("content-type") ?? "";
    if (res.status === 403 || res.headers.get("cf-mitigated") === "challenge" || (res.ok && ct.includes("text/html"))) g.tripped = `HTTP ${res.status}${res.headers.get("cf-mitigated") ? ` cf-mitigated=${res.headers.get("cf-mitigated")}` : ""} ${ct.split(";")[0]} (${String(url).replace(/\?.*/, "")})`;
    return res;
  };
  return g;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ① 手元で最後まで回す。返り = 締めた ninja_job の行と品 */
async function fetchLocal(J, week) {
  const db = await localD1();
  const kv = new Map();
  const env = { LOGS: db, LIVE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) }, NINJA_PER_RUN: "10" };
  const g = guardedFetch();
  for (let tick = 0; ; tick++) {
    const now = new Date();
    const w = J.windowOf(now);
    await J.ninjaTick(env, now, g.fetch);
    const job = await db.prepare("SELECT * FROM ninja_job WHERE week = ?").bind(week).first();
    if (g.tripped && job?.state === "running") await J.finalize(env, job, "stopped", `確認ページ: ${g.tripped}`);
    if (!job || job.state !== "running" || g.tripped || w.week !== week) break;
    if (tick % 10 === 0) console.log(`  ${job.requests} 本…`);
    // 429・5xx の待ち (not_before) と送る間隔 (interval_ms) の分だけ休む
    const wait = Math.max((job.not_before ?? 0) - Date.now(), (job.last_sent ?? 0) + (job.interval_ms ?? 2500) - Date.now(), 200);
    await sleep(Math.min(wait, 130_000));
  }
  const job = await db.prepare("SELECT * FROM ninja_job WHERE week = ?").bind(week).first();
  const { results: items } = await db.prepare("SELECT * FROM daily_fetch_items WHERE week = ? ORDER BY id").bind(week).all();
  // 確認ページの後の失敗で選び方が「済み」になる事があるので、止めた週は state も stopped に揃える
  if (g.tripped && job) Object.assign(job, { state: "stopped", people: 0, errors: JSON.stringify([`確認ページで止めた: ${g.tripped}`]) });
  return { job, items: g.tripped ? [] : items, tripped: g.tripped, sent: g.sent };
}

/** ② 本番へ写す。確認ページで止めた週は品を写さない */
function copyRemote(job, items) {
  const cols = ["week", "state", "league", "version", "snapshot", "ascs", "interval_ms", "not_before", "last_sent", "pending", "requests", "errors", "started_at", "finished_at", "people", "items"];
  const itemCols = ["week", "slot", "sub", "base", "ilvl", "quality", "quality_kind", "mods", "fractured", "desecrated", "corrupted", "sanctified", "who", "asc", "skill"];
  const lines = [
    inline("DELETE FROM daily_fetch_items WHERE week = ?", [job.week]),
    ...items.map((it) => inline(`INSERT INTO daily_fetch_items (${itemCols.join(", ")}) VALUES (${itemCols.map(() => "?").join(", ")})`, itemCols.map((c) => it[c]))),
    inline(`INSERT OR REPLACE INTO ninja_job (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, cols.map((c) => (c === "items" ? items.length : c === "pending" ? null : job[c]))),
  ];
  writeSql(lines);
}

function roll(day) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/daily-roll.mjs"), "--d1", "--week-only", "--day", day], { cwd: ROOT, encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  console.log(out);
  return { ok: r.status === 0, last: out.split("\n").filter(Boolean).slice(-1)[0] ?? "" };
}

const J = await bundleEntry("server/live/src/ninja/job.ts");
const now = new Date();
const win = J.windowOf(now);
const curNo = Math.floor((now.getTime() + JST - H16) / DAY);
const dayName = (no) => new Date(no * DAY).toISOString().slice(0, 10);
// 組む週: 窓の中なら来週 (= 取る週)、外なら今の日の週
const week = win.open ? win.week : dayName(curNo - ((new Date(curNo * DAY).getUTCDay() + 6) % 7));

if (LOCAL) {
  if (!win.open) {
    console.log(`窓の外 (日 16:00〜月 16:00 JST) なので取らない`);
    process.exit(0);
  }
  const r = await fetchLocal(J, week);
  console.log(`週 ${week}: ${r.job?.state} ・${r.sent} 本・${r.job?.people ?? 0} 人・${r.items.length} 品${r.tripped ? ` ・確認ページで止めた (${r.tripped})` : ""}`);
  if (r.items[0]) console.log(`1 つ目: ${r.items[0].slot} ${r.items[0].base}`);
  process.exit(0);
}

const D1 = remoteD1();
try {
  if (win.open) {
    const ctl = await D1.prepare("SELECT v FROM ninja_ctl WHERE k = 'home_stop'").first();
    const had = await D1.prepare("SELECT state, requests, people, items FROM ninja_job WHERE week = ?").bind(week).first();
    if (ctl?.v === "1") record(`週 ${week}: 止めのスイッチ (ninja_ctl home_stop = 1) なので取らない`);
    else if (had) record(`週 ${week}: もう取ってある (${had.state}・${had.requests} 本・${had.items ?? 0} 品) ので取らない`);
    else {
      const r = await fetchLocal(J, week);
      if (!r.job) throw new Error("手元の取得が始まらなかった");
      copyRemote(r.job, r.items);
      record(`週 ${week}: ${r.job.state}・${r.sent} 本・${r.job.people ?? 0} 人・${r.items.length} 品を本番へ${r.tripped ? ` ・確認ページで止めた = 前の週の品のまま (${r.tripped})` : ""}`);
    }
  } else record(`週 ${week}: 窓 (日 16:00〜月 16:00 JST) の外なので取らない = 前の週の品のまま`);

  if (!NO_ROLL) {
    const plan = await D1.prepare("SELECT 1 AS x FROM daily_plan WHERE week = ? LIMIT 1").bind(week).first();
    if (plan) record(`週 ${week}: 予定はもうある`);
    else {
      const r = roll(win.open ? week : dayName(curNo));
      record(`週 ${week}: 予定を組んだ ${r.ok ? "" : "が落ちた "}(${r.last.slice(0, 160)})`);
      if (!r.ok) process.exit(1);
    }
  }
} catch (e) {
  record(`週 ${week}: 落ちた ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
}

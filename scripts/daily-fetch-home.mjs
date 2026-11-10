#!/usr/bin/env node
/**
 * daily-fetch-home.mjs — デイリーの週の取得と週の予定を家の PC で 1 回 (設計図 Y-53・D-80e、2026-11-09)。予定のタスクで日曜 16:05 JST に回す。
 *   ① 取る: Worker と同じコード (server/live/src/ninja/ の ninjaTick) を、手元の空の SQLite で最後まで回す (上限 400 本)
 *   ② 組む: 取れた品から来週の予定 (daily_plan、D-06) を手元で組む。daily-roll.mjs の ① と同じ関数 (_daily-roll-entry.ts の roll、材料は rollJson)
 *   ③ 写す: 品 (daily_fetch_items)・取得の結果の行 (ninja_job)・週の型と予定 (daily_samples・daily_plan) を 1 つのファイルで本番の D1 へ
 *      (wrangler d1 execute --remote --file、途中で落ちれば全部戻る)。毎日のお題はサーバーが予定から出す (settleFromPlan、今のまま)
 * 鍵は使わない (Y-90)。D1 はオーナーの wrangler のログインで読み書きする。
 * 確認ページ (403・cf-mitigated・HTML) が 1 本でも出たら、以降の問い合わせを 0 にして止め、品 0 の ninja_job を写す = その週は前の週の品のまま (予定は前の週の型で組む)。
 * 窓 (日 16:00〜月 16:00 JST) の外で回った時は取らず、その週の予定が無ければ ② ③ だけ (前の週の型で組む)。
 * その週の ninja_job が本番に 1 行でもあれば取らない (週 1 回)。止めのスイッチは本番の ninja_ctl の home_stop = '1'。
 *
 *   node scripts/daily-fetch-home.mjs [--local | --more]
 *     --more  = お題に使える人が足りない週の取り直し (D-80f、毎日の台本 daily-roll.mjs が呼ぶ)。今の週を 1 ビルド 6 → 10 人で、週 2 回まで
 *     --local = 取るだけで写さない・組まない (取った物の数を出す)。D1 も読まない
 *   EXILEDESK_D1_LOCAL=<置き場> を付けると、読む・写すの行き先が本番でなく手元の D1 になる (_d1-shim.mjs、本番に書かずに通しを見る試し用)
 * 1 回ごとに docs/org/daily/notes/fetch-home.log へ 1 行 (git には入らない)。
 */
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { inline, localD1, remoteD1, target, writeSql } from "./_d1-shim.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, "docs/org/daily/notes/fetch-home.log");
const args = process.argv.slice(2);
const LOCAL = args.includes("--local");

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

/**
 * ① 手元で最後まで回す。返り = 締めた ninja_job の行と品。
 * clock = 窓の時計 (ふだんは今。取り直し --more は窓の外で回るので、その週の窓の中の時刻を渡して同じ週として回す。送る間隔・待ちは本物の時間のまま)
 */
async function fetchLocal(J, week, clock = () => new Date()) {
  const db = await localD1();
  const kv = new Map();
  const env = { LOGS: db, LIVE: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) }, NINJA_PER_RUN: "10" };
  const g = guardedFetch();
  for (let tick = 0; ; tick++) {
    const now = clock();
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

const JOB_COLS = ["week", "state", "league", "version", "snapshot", "ascs", "interval_ms", "not_before", "last_sent", "pending", "requests", "errors", "started_at", "finished_at", "people", "items"];
const ITEM_COLS = ["week", "slot", "sub", "base", "ilvl", "quality", "quality_kind", "mods", "fractured", "desecrated", "corrupted", "sanctified", "who", "asc", "skill"];

/** ③ の品と結果の行の SQL。確認ページで止めた週は品を写さない */
function fetchSql(job, items) {
  return [
    inline("DELETE FROM daily_fetch_items WHERE week = ?", [job.week]),
    ...items.map((it) => inline(`INSERT INTO daily_fetch_items (${ITEM_COLS.join(", ")}) VALUES (${ITEM_COLS.map(() => "?").join(", ")})`, ITEM_COLS.map((c) => it[c]))),
    inline(`INSERT OR REPLACE INTO ninja_job (${JOB_COLS.join(", ")}) VALUES (${JOB_COLS.map(() => "?").join(", ")})`, JOB_COLS.map((c) => (c === "items" ? items.length : c === "pending" ? null : job[c]))),
  ];
}

/**
 * ② 週の予定を手元で組み、③ の SQL にする。材料は D1 の rollJson (前の週の型・出たお題の履歴) に、手元で取った品と結果の行を差し込んだ物。
 * 書く所は rollPost を「SQL を集めるだけの D1」に渡して作る (Worker の書き方と同じ文になる)
 */
async function planSql(D1, day, fetched) {
  // 束ねた中に読み込みの時に location を読む画面の部品がある (daily-roll.mjs と同じ守り)
  globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
  const R = await bundleEntry("server/live/src/daily/roll.ts");
  const M = await bundleEntry("scripts/_daily-roll-entry.ts");
  const inp = await R.rollJson(D1, Date.now(), day);
  if (fetched) {
    inp.job = { week: fetched.job.week, state: fetched.job.state, people: fetched.job.people, items: fetched.items.length, requests: fetched.job.requests };
    inp.items = fetched.items.map((it) => Object.fromEntries(ITEM_COLS.filter((c) => c !== "week" && c !== "asc" && c !== "skill").map((c) => [c, it[c]])));
  }
  const ver = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const { body, log } = M.roll(M.loadPatchSync(), inp, ver, false);
  for (const l of log) console.log(l);
  if (!body.week) return { lines: [], log };
  const lines = [];
  const rec = {
    prepare: (sql) => ({ bind: (...a) => ({ first: () => D1.prepare(sql).bind(...a).first(), _sql: () => inline(sql, a) }) }),
    batch: async (stmts) => void lines.push(...stmts.map((s) => s._sql())),
  };
  await R.rollPost(rec, { week: body.week }, null);
  return { lines, log };
}

const J = await bundleEntry("server/live/src/ninja/job.ts");
const now = new Date();
const win = J.windowOf(now);
const curNo = Math.floor((now.getTime() + JST - H16) / DAY);
const dayName = (no) => new Date(no * DAY).toISOString().slice(0, 10);
// 組む週: 窓の中なら来週 (= 取る週)、外なら今の日の週
const week = win.open ? win.week : dayName(curNo - ((new Date(curNo * DAY).getUTCDay() + 6) % 7));

/**
 * 取り直し (D-80f、11-10 オーナー「A　で、忍者取り直しでいいな追加でもっかい取って、人数増やす感じ」)。毎日の台本 (daily-roll.mjs) が、
 * 明日から先にお題に使える人 (フル MOD、段は D-04) のいない日を見つけた時だけ呼ぶ。今の日の週を、1 ビルドの人数を増やして取り直す
 * (1 回目 6 人・2 回目 10 人 = アプリの元の人数。最大 63 → 126 → 210 人)。週 2 回まで (数は ninja_ctl の more:<週>)。
 * 取り方・間隔・止まり方はふだんと同じ (確認ページが出たら 0 にして止める、上限 400 本)。写すのは品・結果の行・週の型 (予定は組み直さず、続けて回る毎日の台本が拾う)
 */
if (args.includes("--more")) {
  const D1m = remoteD1();
  const mweek = dayName(curNo - ((new Date(curNo * DAY).getUTCDay() + 6) % 7));
  try {
    if (typeof J.setBuildSize !== "function") { record(`取り直し 週 ${mweek}: 人数を増やす口が無い (分析の直し待ち) ので取らない`); process.exit(2); }
    const ctl = await D1m.prepare("SELECT v FROM ninja_ctl WHERE k = 'home_stop'").first();
    if (ctl?.v === "1") { record(`取り直し 週 ${mweek}: 止めのスイッチ (home_stop = 1) なので取らない`); process.exit(2); }
    const done = Number((await D1m.prepare("SELECT v FROM ninja_ctl WHERE k = ?").bind(`more:${mweek}`).first())?.v ?? 0);
    if (done >= 2) { record(`取り直し 週 ${mweek}: もう 2 回取り直した (週 2 回まで) ので取らない`); process.exit(2); }
    const size = done === 0 ? 6 : 10;
    J.setBuildSize(size);
    // その週の窓の中 (日曜 17:00 JST) の時計で回す = 同じ週として取る
    const inWindow = Date.parse(`${mweek}T00:00:00Z`) - 16 * 3600e3;
    const t0 = Date.now();
    const got = await fetchLocal(J, mweek, () => new Date(inWindow + (Date.now() - t0)));
    if (!got.job || got.tripped || !got.items.length) { record(`取り直し 週 ${mweek} (${done + 1} 回目・1 ビルド ${size} 人): 取れなかった ${got.tripped ? `確認ページ (${got.tripped})` : `${got.job?.state ?? "始まらない"}・${got.items.length} 品`} = 前の品のまま`); process.exit(1); }
    globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
    const M = await bundleEntry("scripts/_daily-roll-entry.ts");
    const items = got.items.map((it) => Object.fromEntries(ITEM_COLS.filter((c) => c !== "week" && c !== "asc" && c !== "skill").map((c) => [c, it[c]])));
    const rows = M.sampleRowsOf(M.loadPatchSync(), items);
    const lines = [
      ...fetchSql(got.job, got.items),
      ...rows.map((s) => inline("INSERT OR REPLACE INTO daily_samples (week, id, item_class, base, mods, n) VALUES (?, ?, ?, ?, ?, ?)", [mweek, s.id, s.itemClass, s.base, JSON.stringify(s.mods), s.n ?? 1])),
      inline("INSERT OR REPLACE INTO ninja_ctl (k, v) VALUES (?, ?)", [`more:${mweek}`, String(done + 1)]),
    ];
    writeSql(lines);
    record(`取り直し 週 ${mweek} (${done + 1} 回目・1 ビルド ${size} 人): ${got.job.state}・${got.sent} 本・${got.job.people ?? 0} 人・${got.items.length} 品 → 型 ${rows.length} → ${target()}へ ${lines.length} 文`);
    process.exit(0);
  } catch (e) {
    record(`取り直し 週 ${mweek}: 落ちた ${String(e?.message ?? e).slice(0, 300)}`);
    process.exit(1);
  }
}

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
  let fetched = null, said = "";
  if (win.open) {
    const ctl = await D1.prepare("SELECT v FROM ninja_ctl WHERE k = 'home_stop'").first();
    const had = await D1.prepare("SELECT state, requests, people, items FROM ninja_job WHERE week = ?").bind(week).first();
    if (ctl?.v === "1") said = "止めのスイッチ (ninja_ctl home_stop = 1) なので取らない";
    else if (had) said = `もう取ってある (${had.state}・${had.requests} 本・${had.items ?? 0} 品) ので取らない`;
    else {
      fetched = await fetchLocal(J, week);
      if (!fetched.job) throw new Error("手元の取得が始まらなかった");
      said = `${fetched.job.state}・${fetched.sent} 本・${fetched.job.people ?? 0} 人・${fetched.items.length} 品${fetched.tripped ? ` ・確認ページで止めた = 前の週の品のまま (${fetched.tripped})` : ""}`;
    }
  } else said = "窓 (日 16:00〜月 16:00 JST) の外なので取らない = 前の週の品のまま";

  const plan = await D1.prepare("SELECT 1 AS x FROM daily_plan WHERE week = ? LIMIT 1").bind(week).first();
  const p = plan ? { lines: [], log: ["予定はもうある"] } : await planSql(D1, win.open ? week : dayName(curNo), fetched);
  const lines = [...(fetched ? fetchSql(fetched.job, fetched.items) : []), ...p.lines];
  writeSql(lines);
  const planned = p.log.find((l) => l.startsWith("予定")) ?? "予定は組まなかった";
  record(`週 ${week}: ${said} / ${planned.slice(0, 200)} → ${lines.length ? `${target()}へ ${lines.length} 文` : "写す物なし"}`);
} catch (e) {
  record(`週 ${week}: 落ちた ${String(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
}

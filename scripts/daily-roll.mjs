#!/usr/bin/env node
/**
 * daily-roll.mjs — デイリーの 16:00 の切り替え (設計図 D-59、2026-11-05)。予定のタスクで毎日 15:55 JST に回す (Y-45 と同じ形)。
 *   ① その週の予定が無ければ、週の取得 (Y-53) の品 → 型 → 月〜日の予定 (D-06)  ② 投稿の機械の確かめ (D-20)
 *   ③ 前の日を締める (順位・日の結果・称号、D-59 ①。--d1 の時は締めそびれた過去の日 (14 日まで) も先に締める ①b)  ④ 次のお題 (D-84)
 * エンジンを使う所は _daily-roll-entry.ts (画面と同じ関数)。この台本は GET /daily/roll.json を読んで POST /daily/topic に書くだけ。
 * 回らなかった日も Worker が週の予定からお題を出すので、毎日は止まらない (台本が回るのは投稿を使う・締める・称号のため)。何度回しても同じ物は二重に書かない。
 *
 *   EXILEDESK_LIVE_KEY=<server/live の REFRESH_KEY> node scripts/daily-roll.mjs [--day YYYY-MM-DD] [--dry]
 *     --day = 組む日 (16:00 に始まる日)。省くと、16:00 より前なら今日、後なら今の日 (遅れて回した時)
 *     --dry = 組んだ物を出すだけで書かない
 *     --verify = 締めで上位 10 人を検算する (D-58、daily-cost.ts の runCost。画面もお題の種・値段で回す形 (11-10) が本番に出た後に始まった日の締めから付ける)
 *   EXILEDESK_LIVE_BASE で行き先を替える (手元の wrangler dev は http://localhost:8787。本番に書かない Y-71)
 *
 *   node scripts/daily-roll.mjs --d1 [--week-only] [--day …] [--dry]   (鍵なし、D-80e、2026-11-09)
 *     --d1 = 口を通さず、Worker と同じ rollJson・rollPost (server/live/src/daily/roll.ts) を本番の D1 に直に (wrangler d1 execute --remote、オーナーのログイン)。
 *            お題の相場の写しは KV の market を wrangler で読む。覚えていた GET /daily.json (60 秒) は捨てないので、最大 60 秒は前の形が出る
 *     --week-only = 週の予定 (①) だけを書く (日曜 16:05 の週の取得の続き、scripts/daily-fetch-home.mjs)。締め・投稿・お題は書かない
 *   node scripts/daily-roll.mjs --d1 --redo [--day …] [--dry]   (直す口、D-59、2026-11-12。中身は _daily-redo.mjs)
 *     置いた次の日のお題を、出る前 (16:00 より前)・挑戦が 0 の時だけ消して、同じ回の中で組み直す (箱から出たお題なら箱の印も戻す)。
 *     消す前の行は docs/org/daily/notes/redo-<日>-<時刻>.json に控え、組み直しが落ちたら控えから戻す。手で戻すのは --redo-restore <控え>。
 *     予定のタスクは付けない (人が回す時だけ)。--dry = 消す行と組み直したお題を出すだけで書かない
 *   明日から先にお題に使える人のいない日があれば、書いた後に daily-fetch-home.mjs --more で取り直して、もう 1 回だけ回す (D-80f、--no-more で止める)
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { bundleEntry } from "./_bundle-ts.mjs";
import { longValue, remoteD1, remoteKv } from "./_d1-shim.mjs";

const BASE = process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev";
const KEY = process.env.EXILEDESK_LIVE_KEY;
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const D1 = args.includes("--d1");
const WEEK_ONLY = args.includes("--week-only");
// 検算 (D-58)。画面がお題の種・値段で回す形 (11-10) が本番に出る前の日の締めには付けない (前の版の提出は合わない)
const VERIFY = args.includes("--verify");
const dayArg = args[args.indexOf("--day") + 1];
if (!KEY && !D1) {
  console.error("EXILEDESK_LIVE_KEY が要る (server/live の REFRESH_KEY)。鍵なしは --d1");
  process.exit(1);
}

const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const now = Date.now();
const curNo = Math.floor((now + JST - H16) / DAY);
const sinceStart = (now + JST - H16) % DAY;
// 16:00 の前 (= 今の日の終わり近く) なら次の日を、16:00 を過ぎていれば今の日を組む
const target = dayArg && /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : new Date((sinceStart > DAY - 2 * 3600e3 ? curNo + 1 : curNo) * DAY).toISOString().slice(0, 10);

const headers = { "x-exiledesk-key": KEY, "content-type": "application/json" };
const R = D1 ? await bundleEntry("server/live/src/daily/roll.ts") : null;
const db = D1 ? remoteD1() : null;
// 直す口 (D-59、--redo / --redo-restore <控え>): 置いた次の日のお題を 16:00 より前に消して組み直す。この 2 つを付けた時だけ通る (予定のタスクは付けない)
const REDO = args.includes("--redo"), restoreAt = args.indexOf("--redo-restore");
let redo = null;
if (REDO || restoreAt >= 0) {
  if (!D1 || WEEK_ONLY || VERIFY) { console.error("--redo / --redo-restore は --d1 と一緒の時だけ (--week-only・--verify とは一緒に使えない)"); process.exit(1); }
  const X = await import("./_daily-redo.mjs");
  if (restoreAt >= 0) { console.log(await X.redoRestore(db, args[restoreAt + 1], now, DRY)); process.exit(0); }
  // --after = 出た後の差し替え (オーナーの言葉がある時だけ、D-59)。--reject-box "<訳>" = そのお題の箱の投稿を落ちた (no) にする (組み直しで同じ投稿が出ない)
  const rb = args.indexOf("--reject-box");
  redo = await X.redoTake(db, now, target, DRY, { after: args.includes("--after"), rejectBox: rb >= 0 ? args[rb + 1] : null });
  if (redo.stop) { console.log(`直す口: 何も書かずに終わる — ${redo.stop}`); process.exit(1); }
  redo.check = () => X.redoCheck(db, redo);
}
let inp;
if (D1) inp = await R.rollJson(db, now, target);
else {
  const res = await fetch(`${BASE}/daily/roll.json?day=${target}`, { headers });
  if (!res.ok) throw new Error(`roll.json: ${res.status} ${(await res.text()).slice(0, 200)}`);
  inp = await res.json();
}

// 束ねた中に読み込みの時に location を読む画面の部品がある (daily-cost → シミュの木 → web/track → utils/no-log、11-08 から)。
// 画面の無い台本なので、無い時だけ住所の無い形を置く (no-log は手元の住所でないので「送る」扱いだが、台本は記録を送らない)
globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
const M = await bundleEntry("scripts/_daily-roll-entry.ts");
const data = M.loadPatchSync();
const ver = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
// 締めそびれた日を拾う (D-59 ①b、11-11): 締めはふだん「組む日の前の日」1 日だけなので、PC が消えていて回らなかった日は後から締まらなかった。
// 挑戦があって日の結果が 0 の過去の日 (14 日まで) を古い順に、その日を前の日とする回で締めだけ書く (称号は全部の日から計算し直すので二重にならない)
if (D1 && !WEEK_ONLY && !redo) {
  const DAYMS = 86400e3, nameOfNo = (n) => new Date(n * DAYMS).toISOString().slice(0, 10), noOfName = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / DAYMS);
  const tNo = noOfName(target);
  const { results: late } = await db.prepare(
    "SELECT DISTINCT substr(t.topic_id, 2) AS day FROM daily_tries t WHERE substr(t.topic_id, 2) < ? AND substr(t.topic_id, 2) >= ? AND NOT EXISTS (SELECT 1 FROM daily_results r WHERE r.day = substr(t.topic_id, 2)) ORDER BY day",
  ).bind(nameOfNo(tNo - 1), nameOfNo(tNo - 15)).all();
  for (const { day } of late ?? []) {
    const lin = await R.rollJson(db, now, nameOfNo(noOfName(day) + 1));
    const close = M.roll(data, lin, ver, false).body.close;
    if (!close) { console.log(`締めそびれ ${day}: 締められない (お題が無い・まだ終わっていない)`); continue; }
    console.log(`締めそびれ ${day}: 挑戦 ${lin.tries.length}・解決 ${close.results.filter((r) => r.place).length}${DRY ? " (書かない)" : ""}`);
    if (!DRY) console.log(`close (d1): ${JSON.stringify(await R.rollPost(db, { close }, null))}`);
  }
  // 締めた日の結果を称号の計算に入れるため、組む日の材料を読み直す
  if (late?.length && !DRY) inp = await R.rollJson(db, now, target);
}
// 直す口: --dry は消していないので、読んだ材料から置いたお題を抜いた形で組む。組み直しで書くのは 箱の確かめ・予定の揃え直し・お題 だけ (週・締めは書かない)
if (redo && DRY) redo.patch(inp);
let rolled;
try { rolled = M.roll(data, inp, ver, VERIFY); } catch (e) { if (redo && !DRY) await redo.restore(`組み直しが落ちた (${String(e).slice(0, 120)})`); throw e; }
const { body, log } = rolled;
if (redo) { delete body.week; delete body.close; if (!body.topic && !DRY) { await redo.restore("組み直してもお題が出なかった"); process.exit(1); } }
if (WEEK_ONLY) for (const k of Object.keys(body)) if (k !== "week") delete body[k];
for (const l of log) console.log(l);
if (DRY) {
  console.log(JSON.stringify(body, null, 1).slice(0, 4000));
  process.exit(0);
}
if (!Object.keys(body).length) {
  console.log("書く物は無い");
  process.exit(0);
}
if (D1) {
  // 相場の写し (KV market、11-10 で約 540KB) は 1 文に埋めると D1 の 1 文の上限 (100KB) を超えて全部が落ちる (SQLITE_TOOBIG)。
  // お題の行は印だけで入れ、同じ書き込みの中で小分けに足す (D-80e)。Worker の口は値を bind するので要らない
  const market = body.topic ? remoteKv("market") : null;
  const big = market ? longValue(db, { table: "daily_topics", col: "prices", id: `d${body.topic.day}`, value: market }) : null;
  let out;
  try { out = await R.rollPost(big ? big.db : db, body, big ? big.mark : market); } catch (e) { if (redo) await redo.restore(`書き込みが落ちた (${String(e).slice(0, 120)})`); throw e; }
  console.log(`topic (d1): ${JSON.stringify(out)}`);
  if (redo) process.exit(await redo.check());
  moreAndAgain();
  process.exit(0);
}
const w = await fetch(`${BASE}/daily/topic`, { method: "POST", headers, body: JSON.stringify(body) });
console.log(`topic: ${w.status} ${(await w.text()).slice(0, 200)}`);
if (!w.ok) process.exit(1);
moreAndAgain();

/**
 * D-80f: 明日から先にお題に使える人のいない日 (needMore) があれば、今日のお題を書いた後に忍者から人数を増やして同じ週をもう 1 回取り
 * (daily-fetch-home.mjs --more、週 2 回まで)、取れたらこの台本をもう 1 回だけ回して予定を組み直す (今日のお題は出た後なので変わらない)。
 * 取り直しの後の回 (--no-more) からは呼ばない
 */
function moreAndAgain() {
  if (!body.needMore?.length || args.includes("--no-more") || WEEK_ONLY) return;
  const run = (file, a) => spawnSync(process.execPath, [new URL(file, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), ...a], { stdio: "inherit", env: process.env });
  console.log(`取り直し (D-80f): ${body.needMore.join("・")} にお題に使える人がいない → 忍者から人数を増やして取り直す`);
  const f = run("./daily-fetch-home.mjs", ["--more"]);
  if (f.status !== 0) { console.log(`取り直しは取れなかった (exit ${f.status})。予定のまま (印の無い日はサーバーが前の日のお題を出す)`); return; }
  const dayAt = args.indexOf("--day");
  const keep = args.filter((a, i) => a !== "--dry" && !(dayAt >= 0 && (i === dayAt || i === dayAt + 1)));
  const again = run("./daily-roll.mjs", [...keep, "--no-more", "--day", target]);
  console.log(`取り直しの後の組み直し: exit ${again.status}`);
}

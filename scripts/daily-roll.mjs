#!/usr/bin/env node
/**
 * daily-roll.mjs — デイリーの 16:00 の切り替え (設計図 D-59、2026-11-05)。予定のタスクで毎日 15:55 JST に回す (Y-45 と同じ形)。
 *   ① その週の予定が無ければ、週の取得 (Y-53) の品 → 型 → 月〜日の予定 (D-06)  ② 投稿の機械の確かめ (D-20)
 *   ③ 前の日を締める (順位・日の結果・称号、D-59 ①)  ④ 次のお題 (D-84)
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
const { body, log } = M.roll(data, inp, ver, VERIFY);
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
  const out = await R.rollPost(big ? big.db : db, body, big ? big.mark : market);
  console.log(`topic (d1): ${JSON.stringify(out)}`);
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

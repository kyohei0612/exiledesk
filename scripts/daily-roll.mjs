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
 *     --verify = 締めで上位 10 人を検算する (D-58、daily-cost.ts の runCost。画面がお題の種・値段で回すシミュの D-41 ④ の後から付ける)
 *   EXILEDESK_LIVE_BASE で行き先を替える (手元の wrangler dev は http://localhost:8787。本番に書かない Y-71)
 */
import { readFileSync } from "node:fs";
import { bundleEntry } from "./_bundle-ts.mjs";

const BASE = process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev";
const KEY = process.env.EXILEDESK_LIVE_KEY;
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
// 検算 (D-58)。画面がお題の種・値段で回すようになる (シミュの D-41 ④) までは付けない
const VERIFY = args.includes("--verify");
const dayArg = args[args.indexOf("--day") + 1];
if (!KEY) {
  console.error("EXILEDESK_LIVE_KEY が要る (server/live の REFRESH_KEY)");
  process.exit(1);
}

const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const now = Date.now();
const curNo = Math.floor((now + JST - H16) / DAY);
const sinceStart = (now + JST - H16) % DAY;
// 16:00 の前 (= 今の日の終わり近く) なら次の日を、16:00 を過ぎていれば今の日を組む
const target = dayArg && /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : new Date((sinceStart > DAY - 2 * 3600e3 ? curNo + 1 : curNo) * DAY).toISOString().slice(0, 10);

const headers = { "x-exiledesk-key": KEY, "content-type": "application/json" };
const res = await fetch(`${BASE}/daily/roll.json?day=${target}`, { headers });
if (!res.ok) throw new Error(`roll.json: ${res.status} ${(await res.text()).slice(0, 200)}`);
const inp = await res.json();

const M = await bundleEntry("scripts/_daily-roll-entry.ts");
const data = M.loadPatchSync();
const ver = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const { body, log } = M.roll(data, inp, ver, VERIFY);
for (const l of log) console.log(l);
if (DRY) {
  console.log(JSON.stringify(body, null, 1).slice(0, 4000));
  process.exit(0);
}
if (!Object.keys(body).length) {
  console.log("書く物は無い");
  process.exit(0);
}
const w = await fetch(`${BASE}/daily/topic`, { method: "POST", headers, body: JSON.stringify(body) });
console.log(`topic: ${w.status} ${(await w.text()).slice(0, 200)}`);
if (!w.ok) process.exit(1);

// 新しい送り方の再現の確かめ (2026-10-10、server/live/src/sim.ts)。
//
// 1. server/live で `npx wrangler dev --remote -c wrangler.sim.jsonc --port 8799 --var REFRESH_KEY:<一時の鍵>` を動かしておく
// 2. node scripts/sim-telemetry.mjs <一時の鍵> [since] [until]
//    本物の印 (since〜until、UTC) を訪問ごとに取り出し、新しい Web 版と同じ形 (画面を離れた時に 1 回、/log の __ev に乗せる。
//    40 件溜まったら途中でも送る) で送り直す → exiledesk_events_sim に入る → 1 分待って日報の集計を本物と並べる
const [KEY, SINCE = "2026-10-10T00:00:00Z", UNTIL = "2026-10-10T06:00:00Z"] = process.argv.slice(2);
const BASE = process.env.SIM_BASE ?? "http://127.0.0.1:8799";
if (!KEY) { console.error("鍵が要る (wrangler dev の --var REFRESH_KEY と同じ)"); process.exit(1); }
const q = (p, o = {}) => `${BASE}${p}?${new URLSearchParams({ key: KEY, ...o })}`;

const sessions = await (await fetch(q("/__sim/export", { since: SINCE, until: UNTIL }))).json();
if (!Array.isArray(sessions)) { console.error(sessions); process.exit(1); }
console.log(`本物の訪問 ${sessions.length} (印 ${sessions.reduce((a, s) => a + s.ev.length, 0)})`);

// 新しい Web 版が送る形 (log-sender.ts の flush + track.ts の pull と同じ)。40 件で一度送る (track.ts の buf.length >= 40)
const bodies = [];
for (const s of sessions) {
  for (let i = 0; i < s.ev.length; i += 40) {
    const ev = { uid: s.uid, sid: s.sid, first: s.first && i === 0, dev: s.dev, ref: s.ref, ev: s.ev.slice(i, i + 40) };
    bodies.push(`{"app":"web","n":0,"v":"sim","uid":"${s.uid}","sid":"${s.sid}","dev":"${s.dev}","recs":[],"__ev":${JSON.stringify(ev)}}`);
  }
}
const simSince = new Date(Date.now() - 5_000).toISOString();
let ok = 0, ng = 0;
for (let i = 0; i < bodies.length; i += 8) {
  const rs = await Promise.all(bodies.slice(i, i + 8).map((b) => fetch(`${BASE}/log`, { method: "POST", body: b, headers: { "content-type": "text/plain;charset=UTF-8" } }).then((r) => r.ok).catch(() => false)));
  for (const r of rs) r ? ok++ : ng++;
}
console.log(`送った ${ok} 本 (失敗 ${ng}) = 前の形なら 15 秒おきの /event`);
// Analytics Engine は書いてから読めるまで少しかかる
await new Promise((r) => setTimeout(r, 75_000));
const simUntil = new Date(Date.now() + 60_000).toISOString();
const cmp = await (await fetch(q("/__sim/compare", { since: SINCE, until: UNTIL, simSince, simUntil }))).json();
console.log(JSON.stringify(cmp, null, 1));

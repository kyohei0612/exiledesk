// boot.json を作る (2026-10-10、server/data)。相場は poe2scout から、配信の情報は server/live の /live.json (8 時間おきに更新) から。
// node scripts/build-boot.mjs → server/data/out/boot.json と _headers。GitHub Actions が 1 時間おきに作って exiledesk-data に deploy する
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "server/data/out");
const SCOUT = "https://api.poe2scout.com";
const LIVE = process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev";
const UA = { accept: "application/json", "user-agent": "ExileDesk-web/0.1 (https://github.com/kyohei0612/exiledesk)" };

const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };
const leagues = await get(`${SCOUT}/poe2/Leagues`);
// 今のリーグ (IsCurrent かつ HC でない)。画面の market-store / server/live/src/market.ts と同じ選び方
const cur = leagues.find((l) => l.IsCurrent && !l.Value.startsWith("HC")) ?? leagues[0] ?? null;
const items = cur ? await get(`${SCOUT}/poe2/Leagues/${encodeURIComponent(cur.Value)}/Items`) : [];
if (!items.length) throw new Error("品目が 0 件 (前の boot.json を残すため止める)");
let live = null;
try { live = await get(`${LIVE}/live.json`); } catch (e) { console.warn("live.json:", String(e)); }

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "boot.json"), JSON.stringify({ live, market: { at: new Date().toISOString(), leagues, league: cur?.Value ?? null, items } }));
// よそ (web.exiledesk) から読むので CORS、ブラウザは 10 分覚える
writeFileSync(join(out, "_headers"), "/boot.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=600\n");
console.log(`boot.json: ${cur?.Value} 品目 ${items.length}、配信の情報 ${live ? "あり" : "なし"}`);

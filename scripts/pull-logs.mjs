#!/usr/bin/env node
/**
 * pull-logs.mjs — 分析用の記録 (server/live の D1) を日ごとに手元へ (2026-10-09)
 *   node scripts/pull-logs.mjs [YYYY-MM-DD ...]   (日付が無ければ昨日。日本時間)
 * 置き場: data-cache/logs/<日付>.jsonl (1 行 = 届いた 1 まとまり: {at, country, b: {app, n, v, uid, sid, dev, recs: [{k, t, d}]}})
 * 取り方は 2 つ:
 *   - 環境変数 EXILEDESK_LIVE_KEY (server/live の REFRESH_KEY と同じ) があれば server/live の /logs/day から
 *   - 無ければ wrangler で D1 を直接読む (2026-10-19、鍵が手元に無かった。wrangler login 済みなら動く)
 * 分析は python scripts/analyze-logs.py data-cache/logs/<日付>.jsonl ...
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev";
const KEY = process.env.EXILEDESK_LIVE_KEY;
const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10);
const days = process.argv.slice(2).length ? process.argv.slice(2) : [yesterday];
const out = resolve(ROOT, "data-cache/logs");
mkdirSync(out, { recursive: true });

/** wrangler で 1 日分 (D1 の day 列 = 日本時間の日付)。body は文字のまま入っているので b に解いて 1 行ずつ */
function viaWrangler(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`日付の形が違う: ${day}`);
  // npx は Windows で shell 経由になり、SQL の引数が引用されずに崩れる。server/live の wrangler を node で直接動かす
  const bin = resolve(ROOT, "server/live/node_modules/wrangler/bin/wrangler.js");
  const args = [bin, "d1", "execute", "exiledesk-logs", "--remote", "--json", "--command", `SELECT at, country, body FROM logs WHERE day = '${day}' ORDER BY id`];
  // 2026-10-25 9:05 の毎朝の回で 1 度だけ落ちた (手で回すと通る、その時だけの失敗)。3 回まで読み直し、落ちた訳は wrangler の stderr の終わりを残す
  let json;
  for (let i = 1; ; i++) {
    try {
      json = execFileSync(process.execPath, args, { windowsHide: true, cwd: resolve(ROOT, "server/live"), encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
      break;
    } catch (e) {
      const why = `${e.stderr ?? ""}${e.stdout ?? ""}`.replace(/\s+/g, " ").trim().slice(-300) || String(e).slice(-300);
      if (i >= 3) throw new Error(`3 回とも読めない: ${why}`);
      console.error(day, `読めない (${i} 回目、5 秒後に読み直す): ${why}`);
      execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 5000)"]);
    }
  }
  const rows = JSON.parse(json)[0].results;
  return rows.flatMap((r) => { try { return [JSON.stringify({ at: r.at, country: r.country, b: JSON.parse(r.body) })]; } catch { return []; } }).join("\n");
}

for (const day of days) {
  let text;
  if (KEY) {
    const r = await fetch(`${BASE}/logs/day?day=${day}`, { headers: { "x-exiledesk-key": KEY } });
    if (!r.ok) { console.error(day, r.status, await r.text()); continue; }
    text = await r.text();
  } else {
    try { text = viaWrangler(day); } catch (e) {
      // 前に取った途中の物で日報を作らないよう、その日のファイルは消す (daily-summary.mjs が「昨日の記録が無い」で止まる)
      rmSync(resolve(out, `${day}.jsonl`), { force: true });
      console.error(day, "wrangler で読めない (code 7403 なら wrangler login が要る):", String(e.message ?? e).slice(0, 400));
      continue;
    }
  }
  writeFileSync(resolve(out, `${day}.jsonl`), text);
  const lines = text ? text.split("\n").length : 0;
  console.log(`${day}: ${lines} まとまり → data-cache/logs/${day}.jsonl${KEY ? "" : " (wrangler)"}`);
}

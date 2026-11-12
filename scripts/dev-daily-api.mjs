#!/usr/bin/env node
/**
 * dev-daily-api.mjs — 開発の時のデイリーの口 (`pnpm dev:daily-api`)。1440 (pnpm dev:web) は止めずに、横でこれを立てるだけでデイリーが動く。
 * server/live を wrangler dev --local (port 8797・手元の D1) で立て、見本を入れる: 今週の月曜から今日までのお題 (16:00 の台本 daily-roll.mjs を手元の口へ回す)・昨日の順位 (見本の名前 5 人)。
 * 画面は開発の時だけ http://localhost:8797 を読む (src/views/daily/daily-api.ts、本番の行き先は変えない)。置き場は残り、`-- --fresh` で作り直す。止めるのは Ctrl+C。
 * 本番の D1・KV には触らない (Y-71)。
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// DAILY_DEV_PORT で別の口を横に立てられる (部長の確かめ用。画面は VITE_DAILY_API で向ける)
const PORT = Number(process.env.DAILY_DEV_PORT ?? 8797);
const BASE = `http://localhost:${PORT}`;
const KEY = "dev-local";
// 道が長いと wrangler の手元の D1 が internal error で落ちる (scratchpad の深い道で見た、11-04)。短い Temp 直下に置く
const PERSIST = join(tmpdir(), PORT === 8797 ? "exiledesk-daily-dev" : `exiledesk-daily-dev-${PORT}`);
const CONFIG = join(ROOT, "server/live/wrangler.jsonc");

/** wrangler の場所。worktree には server/live/node_modules が無いので本体の checkout のを使う */
function findWrangler() {
  const bin = (root) => join(root, "server/live/node_modules/.bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");
  if (existsSync(bin(ROOT))) return bin(ROOT);
  const common = spawnSync("git", ["-C", ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).stdout.trim();
  if (common && existsSync(bin(dirname(common)))) return bin(dirname(common));
  throw new Error("wrangler が無い: server/live で pnpm install");
}
const WR = findWrangler();
const wr = (args, opts = {}) => spawnSync(WR, [...args, "-c", CONFIG], { cwd: ROOT, encoding: "utf8", shell: true, ...opts });
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** 日本語の名前を shell 越しに渡さないよう、SQL はファイルで渡す */
function sql(command) {
  const file = `${PERSIST}-seed.sql`;
  writeFileSync(file, command, "utf8");
  const r = wr(["d1", "execute", "exiledesk-logs", "--local", "--persist-to", `"${PERSIST}"`, "--file", `"${file}"`]);
  rmSync(file, { force: true });
  if (r.status !== 0) throw new Error(`d1 execute: ${(r.stdout + r.stderr).slice(-400)}`);
}

// `pnpm daily:reset` (= --reset): 立てたままの置き場から見本 (ndev*) 以外の名前と挑戦・結果・称号を消して終わる (D-37h)。
// 画面は開発版だけ読み込み時に控えの名前が無いと知り、控えを捨てて同じ名前で作り直す = 読み直すだけで「1 時間の挑戦を始める」
if (process.argv.includes("--reset")) {
  sql(["daily_tries", "daily_results", "daily_awards"].map((t) => `DELETE FROM ${t} WHERE nick_id NOT LIKE 'ndev%';`).join(" ") + " DELETE FROM daily_nicks WHERE id NOT LIKE 'ndev%';");
  console.log(`[daily:reset] 消した (${PERSIST})。デイリーのページを読み直す`);
  process.exit(0);
}

// 日の番号 (16:00 JST 区切り、daily-api.ts の dayNoOf と同じ)
const JST = 9 * 3600e3, H16 = 16 * 3600e3, DAY = 86400e3;
const now = Date.now();
const today = Math.floor((now + JST - H16) / DAY);
const dayName = (no) => new Date(no * DAY).toISOString().slice(0, 10);
const monday = today - ((new Date(today * DAY).getUTCDay() + 6) % 7);

// 置き場は残す (立て直しても名前・挑戦が残り、ブラウザに覚えた名前と食い違わない)。--fresh の時だけ作り直す
if (process.argv.includes("--fresh")) { console.log(`[dev:daily-api] 置き場を作り直す: ${PERSIST}`); rmSync(PERSIST, { recursive: true, force: true }); }
const mig = wr(["d1", "migrations", "apply", "exiledesk-logs", "--local", "--persist-to", `"${PERSIST}"`]);
if (mig.status !== 0) throw new Error(`migrations: ${(mig.stdout + mig.stderr).slice(-400)}`);

console.log(`[dev:daily-api] server/live を ${BASE} で立てる`);
// DAILY_DEV_VARS="名前:値,名前:値" で手元の口だけの設定を足せる (部長の確かめ用。例: クラフト箱の知らせの行き先 BOX_WEBHOOK と絵を作る先 BOX_CARD_ORIGIN を手元の受け皿に向ける)
const extraVars = (process.env.DAILY_DEV_VARS ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Z0-9_]+:.+$/.test(s)).flatMap((s) => ["--var", `"${s}"`]);
const dev = spawn(WR, ["dev", "--local", "--port", String(PORT), "--persist-to", `"${PERSIST}"`, "--var", `REFRESH_KEY:${KEY}`, ...extraVars, "-c", `"${CONFIG}"`], { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "inherit"] });
dev.stdout.on("data", () => {});
const stop = () => { if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(dev.pid), "/t", "/f"]); else dev.kill(); };
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("exit", stop);

for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/daily.json`)).ok) break; } catch { /* まだ */ }
  if (i > 120) throw new Error("wrangler dev が 60 秒で立たない");
  await new Promise((r) => setTimeout(r, 500));
}

/** お題を 1 日分 (16:00 の台本をそのまま手元の口へ) */
function roll(no) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/daily-roll.mjs"), "--day", dayName(no)], { cwd: ROOT, encoding: "utf8", env: { ...process.env, EXILEDESK_LIVE_BASE: BASE, EXILEDESK_LIVE_KEY: KEY } });
  if (r.status !== 0) throw new Error(`daily-roll ${dayName(no)}: ${(r.stdout + r.stderr).slice(-400)}`);
  console.log(`[dev:daily-api] ${r.stdout.trim().split("\n").find((l) => l.startsWith("お題")) ?? `お題 ${dayName(no)}: 済み`}`);
}
for (let no = Math.min(monday, today - 1); no < today; no++) roll(no);

// 昨日の順位の見本 (名前・費用・完成率・使った時間)。合言葉は見本なので使えない値
const SAMPLE = [["ミラ", 4.2, 96, 41], ["Kazuto", 5.8, 92, 55], ["ゆずぽん", 6.1, 99, 23], ["Ruin", 9.4, 90, 58], ["しおり", 12.5, 94, 37]];
const y = `d${dayName(today - 1)}`, yStart = (today - 1) * DAY + H16 - JST + 3600e3;
// 見本の人の木 = 昨日のお題のスタートだけ (順位の行からレシピを開く D-50b を見るため)。人ごとにフラクチャーを替える
const yt = (await (await fetch(`${BASE}/daily.json`)).json()).yesterdayTopic;
const M = yt?.aims ? await bundleEntry("scripts/_dev-daily-entry.ts") : null;
const recipeOf = (i) => (M ? M.startRecipe(yt.base, yt.ilvl, yt.aims, yt.aims[i % yt.aims.length].modId) : null);
sql(SAMPLE.map(([name, cost, rate, mins], i) =>
  `INSERT OR IGNORE INTO daily_nicks (id, name, name_key, pass_hash, created) VALUES (${q(`ndev${i}`)}, ${q(name)}, ${q(String(name).toLowerCase())}, 'dev', ${now});` +
  `INSERT OR IGNORE INTO daily_tries (topic_id, nick_id, started_at, submitted_at, cost, rate, recipe) VALUES (${q(y)}, ${q(`ndev${i}`)}, ${yStart + i * 600e3}, ${yStart + i * 600e3 + mins * 60e3}, ${cost}, ${rate}, ${M ? q(recipeOf(i)) : "NULL"});`).join(" "));
console.log("[dev:daily-api] 昨日の順位の見本 5 人");
roll(today);

console.log(`[dev:daily-api] できた。1440 のデイリー (http://localhost:1440/web.html?page=daily) がここ (${BASE}) につながる。止めるのは Ctrl+C`);
await new Promise(() => {});

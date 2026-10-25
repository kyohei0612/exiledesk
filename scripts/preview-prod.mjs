#!/usr/bin/env node
/**
 * preview-prod.mjs — 手元で本番と同じ環境を出す (2026-10-24 オーナー「ローカルと鯖環境を合わせたら開発版ウェブで確かめる必要なく本番リリースできる」)
 *   pnpm preview:prod             … (a) 本番そのまま  http://exiledesk.localhost:1460/
 *   pnpm preview:prod -- --dev    … (b) 開発版と同じ  http://dev.exiledesk.localhost:1461/ (オーナーのブックマーク「ExileDesk開発版」)
 *   --no-build で前に作った物のまま立て直す、--port で番号を替える (出し先も別になる)。*.localhost は Chrome が手元 (127.0.0.1) に向ける
 *   --head で commit 済みの HEAD から作る (../ExileDesk-preview、他の部長の書きかけを入れない)、--live で (a) でも相場・訪問者を本番の live から読む (本番と見比べる時)
 * 作り (既定は今の作業中のファイルから。dist-web は触らない) を server/web/.wrangler/preview-dist(-dev)(-<番号>) に出し、
 * server/web の本番の wrangler.jsonc (run_worker_first・html_handling・404・D1 の名前) のまま wrangler dev (workerd) で出す。
 * (a) 本番の pnpm build:web と同じ並び (vite build + 相場の控え + 読み物 + ブログ)。本番の D1・KV に書かないよう、画面の送り先 (VITE_WEB_API) は
 *     手元の Worker 自身 (/boot.json・/log は 404 → 相場は /market-fallback.json の控え、分析の記録は捨てる)。
 * (b) 開発版のビルドの印 VITE_DEV_PREVIEW=1 (チュートリアル・シミュレーターが開く、分析は送らない、ブログは下書きも)。
 *     相場・配信は本番の server/live の /boot.json を読む (読むだけ。要望を送ると本番に届く)。
 *     10-24 にネットの開発版 (web-dev.exiledesk.workers.dev・deploy-web-dev.mjs・dev-gate.js) を消し、開発版はこの手元の (b) だけになった (オーナー)。
 * D1 は手元の写し (.wrangler/state-preview。シェアの shares は本番から新しい 20 行を読んで写す)。止める時は Ctrl+C (子の workerd も止まる)。
 * 本番と並べて比べる: node scripts/compare-prod-local.mjs http://127.0.0.1:1460 (Node からは *.localhost が引けないことがあるので数字で)
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "server/web");
const args = process.argv.slice(2);
const DEV = args.includes("--dev");
const BUILD = !args.includes("--no-build");
// --live: (a) でも相場・配信を本番の server/live から読む (本番と見比べる時、scripts/compare-snaps.mjs。分析の送りは照らしの台本の側で止める)
const LIVE = args.includes("--live");
const DEF = DEV ? 1461 : 1460;
const PORT = Number(args[args.indexOf("--port") + 1]) || DEF;
// 決まった番号でない時は出し先・設定も別に (同じ時に 2 つ立てても掴み合わない)
const TAG = `${DEV ? "-dev" : ""}${PORT === DEF ? "" : `-${PORT}`}`;
const WORK = resolve(WEB, ".wrangler");
const OUT = resolve(WORK, `preview-dist${TAG}`);
const STATE = resolve(WORK, "state-preview");
const CONF = resolve(WORK, `wrangler.preview${TAG}.json`);
const WRANGLER = resolve(WEB, "node_modules/wrangler/bin/wrangler.js");
const ORIGIN = `http://${DEV ? "dev." : ""}exiledesk.localhost:${PORT}`;
const run = (cmd, a, opt = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: "inherit", windowsHide: true, ...opt });
const node = (a, opt) => run(process.execPath, a, opt);

// --head: 作業中のファイルではなく commit 済みの HEAD から作る (他の部長の書きかけを入れない。隣の作業場所 ../ExileDesk-preview (git worktree、detached) で)
let SRC = ROOT;
if (BUILD && args.includes("--head")) {
  const git = (a, cwd = ROOT) => execFileSync("git", a, { cwd, encoding: "utf8", windowsHide: true }).trim();
  const sha = git(["rev-parse", "HEAD"]);
  SRC = resolve(ROOT, "..", "ExileDesk-preview");
  if (!existsSync(resolve(SRC, ".git"))) git(["worktree", "add", "--detach", SRC, sha]);
  else { git(["checkout", "-q", "--detach", "--force", sha], SRC); git(["clean", "-fdq"], SRC); }
  if (!existsSync(resolve(SRC, "node_modules"))) symlinkSync(resolve(ROOT, "node_modules"), resolve(SRC, "node_modules"), "junction");
  console.log(`HEAD ${sha.slice(0, 8)} ${git(["log", "-1", "--format=%s"], SRC).slice(0, 60)} から作る`);
}

// 1. 作る (型チェックは省く。出し先だけ替える)
if (BUILD) {
  rmSync(OUT, { recursive: true, force: true });
  // (a) は送り先を手元に、(b) は開発版と同じ (送り先は替えない・開発版の印)
  const env = { ...process.env, WEB_OUT: OUT, ...(DEV ? { VITE_DEV_PREVIEW: "1" } : LIVE ? {} : { VITE_WEB_API: ORIGIN }) };
  node([resolve(ROOT, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.web.config.ts"], { env, cwd: SRC });
  // 相場の控えは本番の build:web だけ (開発版には無い)。本番に置いてある物を写す (外の API を叩かない)
  if (!DEV) writeFileSync(resolve(OUT, "market-fallback.json"), execFileSync("curl", ["-sf", "https://exiledesk.com/market-fallback.json"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 28 }));
  node(["scripts/build-seo-pages.mjs", OUT], { cwd: SRC });
  node(["scripts/build-blog-pages.mjs", OUT, ...(DEV ? ["--drafts"] : [])], { cwd: SRC });
  // コスメティックのページ (/cosmetics/・/en/cosmetics/、noindex)。本番の build:web にも入れた (オーナー 10-25 の OK)
  node(["scripts/build-cosmetics-pages.mjs", OUT], { cwd: SRC });
}

// 2. 本番の wrangler.jsonc から設定を作る (置き場の道だけ替える。独自ドメインの routes は手元に要らない)
const src = JSON.parse(readFileSync(resolve(WEB, "wrangler.jsonc"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"));
delete src.$schema;
delete src.routes;
const conf = { ...src, main: "../move-gate.js", assets: { ...src.assets, directory: `./preview-dist${TAG}` } };
mkdirSync(WORK, { recursive: true });
writeFileSync(CONF, JSON.stringify(conf, null, 2));

// 3. 手元の D1 の写し: シェアの表を作り、本番の新しい 20 行を読んで入れる (本番は SELECT だけ)
const wr = (a, opt = {}) => execFileSync(process.execPath, [WRANGLER, ...a], { cwd: WEB, encoding: "utf8", windowsHide: true, maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"], ...opt });
wr(["d1", "execute", "exiledesk-logs", "--local", "--persist-to", STATE, "-c", CONF, "--file", resolve(ROOT, "server/live/migrations/0007_shares.sql")]);
try {
  const rows = JSON.parse(wr(["d1", "execute", "exiledesk-logs", "--remote", "--json", "-c", CONF, "--command", "SELECT id, code, at FROM shares ORDER BY at DESC LIMIT 20"]))[0].results;
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  if (rows.length) wr(["d1", "execute", "exiledesk-logs", "--local", "--persist-to", STATE, "-c", CONF, "--command", rows.map((r) => `INSERT OR IGNORE INTO shares (id, code, at) VALUES (${q(r.id)}, ${q(r.code)}, ${Number(r.at)});`).join(" ")]);
  console.log(`シェアの写し ${rows.length} 行 (例 ${ORIGIN}/s/${rows[0]?.id ?? "-"})`);
} catch (e) { console.warn("シェアの写しは取れなかった (wrangler login?)", String(e).slice(0, 160)); }

// 4. 立てる
console.log(`\n手元の${DEV ? "開発版" : "本番"}と同じ環境: ${ORIGIN}/  止めるのは Ctrl+C`);
const child = spawn(process.execPath, [WRANGLER, "dev", "-c", CONF, "--local", "--persist-to", STATE, "--ip", "localhost", "--port", String(PORT)], { cwd: WEB, stdio: "inherit", windowsHide: true });
child.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));

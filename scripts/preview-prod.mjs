#!/usr/bin/env node
/**
 * preview-prod.mjs — 手元で本番と同じ環境を出す (2026-10-24 オーナー「ローカルと鯖環境を合わせたら開発版ウェブで確かめる必要なく本番リリースできる」)
 *   pnpm preview:prod [--dev] [--no-build] [--port 1460]
 * 本番の Web と同じ作り (vite build + 相場の控え + 読み物 + ブログ) を server/web/.wrangler/preview-dist に出し、
 * server/web の本番の wrangler.jsonc (run_worker_first・html_handling・404・D1 の名前) のまま wrangler dev (workerd) で http://127.0.0.1:<port>/ に出す。
 *   --dev      開発版 (web-dev) と同じ作り (VITE_DEV_PREVIEW=1: チュートリアル・シミュレーターが開く、ブログは下書きも)
 *   --no-build 前に作った物のまま立て直す
 * 本番の D1・KV には書かない: D1 は手元の写し (.wrangler/state-preview。シェアの shares は本番から新しい 20 行を読んで写す)、
 * 画面の送り先 (VITE_WEB_API) は手元の Worker 自身 (/boot.json・/log は 404 → 相場は /market-fallback.json の控え、分析の記録は捨てる)。
 * dist-web (本番に出す物の置き場) は触らない。止める時は Ctrl+C (wrangler の子の workerd も一緒に止まる)。
 * 本番と並べて比べる: node scripts/compare-prod-local.mjs http://127.0.0.1:<port>
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = resolve(ROOT, "server/web");
const args = process.argv.slice(2);
const DEV = args.includes("--dev");
const BUILD = !args.includes("--no-build");
const PORT = Number(args[args.indexOf("--port") + 1]) || 1460;
const WORK = resolve(WEB, ".wrangler");
const OUT = resolve(WORK, DEV ? "preview-dist-dev" : "preview-dist");
const STATE = resolve(WORK, "state-preview");
const CONF = resolve(WORK, "wrangler.preview.json");
const WRANGLER = resolve(WEB, "node_modules/wrangler/bin/wrangler.js");
const ORIGIN = `http://127.0.0.1:${PORT}`;
const run = (cmd, a, opt = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: "inherit", windowsHide: true, ...opt });
const node = (a, opt) => run(process.execPath, a, opt);

// 1. 作る (本番の pnpm build:web と同じ並び。型チェックは省く。出し先だけ替える)
if (BUILD) {
  rmSync(OUT, { recursive: true, force: true });
  const env = { ...process.env, WEB_OUT: OUT, VITE_WEB_API: ORIGIN, ...(DEV ? { VITE_DEV_PREVIEW: "1" } : {}) };
  node([resolve(ROOT, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.web.config.ts"], { env });
  // 相場の控えは本番に置いてある物を写す (外の API を叩かない)
  const fb = execFileSync("curl", ["-sf", "https://exiledesk.com/market-fallback.json"], { encoding: "utf8", windowsHide: true, maxBuffer: 1 << 28 });
  writeFileSync(resolve(OUT, "market-fallback.json"), fb);
  node(["scripts/build-seo-pages.mjs", OUT]);
  node(["scripts/build-blog-pages.mjs", OUT, ...(DEV ? ["--drafts"] : [])]);
}

// 2. 本番の wrangler.jsonc から設定を作る (置き場の道だけ替える。独自ドメインの routes は手元に要らない)
const src = JSON.parse(readFileSync(resolve(WEB, "wrangler.jsonc"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"));
delete src.$schema;
delete src.routes;
const conf = { ...src, main: "../move-gate.js", assets: { ...src.assets, directory: `./${DEV ? "preview-dist-dev" : "preview-dist"}` } };
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
console.log(`\n手元の本番と同じ環境: ${ORIGIN}/  ${DEV ? "(開発版の作り)" : "(本番の作り)"}  止めるのは Ctrl+C`);
const child = spawn(process.execPath, [WRANGLER, "dev", "-c", CONF, "--local", "--persist-to", STATE, "--ip", "127.0.0.1", "--port", String(PORT)], { cwd: WEB, stdio: "inherit", windowsHide: true });
child.on("exit", (c) => process.exit(c ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));

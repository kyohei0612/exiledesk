/**
 * static.mjs — シミュ以外の見張りのうち、画面を開かずにリポジトリだけで決まる物 (最終チェック長の持ち物、10-28 ブラック 15 代目)。
 * 決まりの正は docs/spec/ (番号は各行)、回し方は docs/org/dev/app-watch.md。外のパッケージ・外の API は使わない。
 *
 *   node scripts/app-watch/static.mjs          … 全部。合わない所があれば終わりの値 1
 *   node scripts/app-watch/static.mjs --json   … 結果を JSON で
 *   node scripts/app-watch/static.mjs --update … hex の数を基準 (baseline.json) に書く
 *
 * 見る物:
 *   Y-90  鍵・トークンがリポジトリ (追跡中 + 追跡していない・無視していないファイル) に無い
 *   Y-93  鍵の口を URL の ?key= で受けない・呼ばない (server/live/src・scripts)
 *   Y-101 トップ・読み物・ads.txt・/assets/ が Worker を通らない (server/web/wrangler.jsonc の run_worker_first)
 *   Y-102 手元の作り (dev サーバー・開発版・localhost) は記録を送らない (no-log.ts の決まり) / 1460 の送り先は手元 (preview-prod.mjs)
 *   Y-105 どのページへ移っても screen の記録が出る (page.ts の移った時の分かれ道 → track.ts の screen)
 *   M-92  エミュの画面がシミュの画面のコードを import しない
 *   U-46  hex の色は style.css だけ (scripts/lint-hex.mjs をそのまま呼ぶ)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const JSON_OUT = process.argv.includes("--json");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
// git grep は当たり無しで 1 を返す (= 0 件)。2 以上 (式の誤りなど) は黙って 0 件にせず落とす
const git = (...a) => { try { return execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", windowsHide: true, maxBuffer: 64 << 20, stdio: "pipe" }); } catch (e) { if (e.status === 1 && a[0] === "grep") return ""; throw new Error(`git ${a.slice(0, 3).join(" ")} が落ちた: ${String(e.stderr).slice(0, 200)}`); } };
const BASE_PATH = join(dirname(fileURLToPath(import.meta.url)), "baseline.json");
const BASE = existsSync(BASE_PATH) ? JSON.parse(readFileSync(BASE_PATH, "utf8")).static ?? {} : {};
let hexNow = 0;
const results = []; // { rule, seen, bad: [{ where, what }] }
const rule = (id, title) => { const r = { rule: id, title, seen: 0, bad: [] }; results.push(r); return r; };

// ---- Y-90 鍵がリポジトリに無い ----
{
  const r = rule("Y-90", "鍵・トークンがリポジトリに無い");
  const PATS = [
    ["Discord の webhook", String.raw`discord(app)?\.com/api/webhooks/[0-9]{15,}/[A-Za-z0-9_-]{30,}`],
    ["Discord の bot token", String.raw`[MN][A-Za-z0-9]{23,25}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}`],
    ["Google の API key", String.raw`AIza[0-9A-Za-z_-]{35}`],
    ["秘密鍵", String.raw`-----BEGIN ([A-Z]+ )?PRIVATE KEY-----`],
    ["鍵の名前に値", String.raw`(REFRESH_KEY|YOUTUBE_API_KEY|TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET|DISCORD_WEBHOOK|DISCORD_BOT_TOKEN|REPORT_WEBHOOK|CF_ANALYTICS_TOKEN|CLOUDFLARE_API_TOKEN)["']?\s*[=:]\s*["']?[A-Za-z0-9_./+-]{12,}`],
    ["鍵のヘッダーに値", String.raw`x-exiledesk-key["']?\s*[:,]\s*["'][A-Za-z0-9_-]{12,}["']`],
  ];
  for (const [what, re] of PATS) {
    r.seen++;
    const out = git("grep", "-nIE", "--untracked", "-e", re, "--", ".", ":!node_modules", ":!**/node_modules/**", ":!scripts/app-watch/static.mjs").trim();
    for (const line of out ? out.split("\n") : []) r.bad.push({ where: line.split(":").slice(0, 2).join(":"), what });
  }
  // 鍵を置くファイルそのもの (.dev.vars・.env) が入っていない (.example は置いてよい)
  const files = git("ls-files", "-co", "--exclude-standard").split("\n").filter(Boolean);
  r.seen++;
  for (const f of files) if (/(^|\/)(\.dev\.vars|\.env(\.[a-z]+)?)$/.test(f) && !/\.example$/.test(f)) r.bad.push({ where: f, what: "鍵を置くファイルが追跡されうる (.gitignore に無い)" });
}

// ---- Y-93 鍵の口は ?key= で受けない・呼ばない ----
{
  const r = rule("Y-93", "鍵の口は x-exiledesk-key のヘッダーだけ (URL に鍵を載せない)");
  r.seen++;
  const out = git("grep", "-nIE", "-e", String.raw`searchParams\.get\(["']key["']\)|[?&]key=\$\{|[?&]key=["'+]`, "--", "server/live/src", "server/web", "scripts", "src", ":!scripts/app-watch/**").trim();
  for (const line of out ? out.split("\n") : []) r.bad.push({ where: line.split(":").slice(0, 2).join(":"), what: line.split(":").slice(2).join(":").trim().slice(0, 120) });
}

// ---- Y-101 Worker を通らない所 ----
{
  const r = rule("Y-101", "トップ・読み物・ads.txt・/assets/ は Worker を通らない");
  const conf = read("server/web/wrangler.jsonc");
  const m = conf.match(/"run_worker_first"\s*:\s*(true|\[[^\]]*\])/);
  const globs = m ? (m[1] === "true" ? ["/*"] : JSON.parse(m[1])) : [];
  const toRe = (g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  for (const p of ["/", "/index.html", "/web.html", "/ads.txt", "/assets/index-x.js", "/en/", "/guide/", "/robots.txt", "/sitemap.xml", "/icons/x.webp"]) {
    r.seen++;
    const g = globs.find((x) => toRe(x).test(p));
    if (g) r.bad.push({ where: "server/web/wrangler.jsonc", what: `${p} が run_worker_first の ${g} に当たる` });
  }
  // 消したベースのページ (Y-84) は Worker を通って 410 を返す
  for (const p of ["/bases", "/bases/", "/bases/gold-ring", "/en/bases/", "/en/bases/gold-ring"]) {
    r.seen++;
    if (!globs.some((x) => toRe(x).test(p))) r.bad.push({ where: "server/web/wrangler.jsonc", what: `${p} が run_worker_first に無い (410 を返せない、Y-84)` });
  }
}

// ---- Y-102 手元の作りは記録を送らない ----
{
  const r = rule("Y-102", "手元 (1440・1460・1461) から本番の記録に届かない");
  const nl = read("src/utils/no-log.ts");
  const want = [
    ["開発版・dev サーバーは送らない", /VITE_DEV_PREVIEW\s*===\s*"1"\s*\|\|\s*import\.meta\.env\.DEV\)\s*return true/],
    ["localhost・*.localhost は送らない", /localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]\)\$\|\\\.localhost\$\/\.test\(location\.hostname\)\)\s*return true/],
  ];
  for (const [what, re] of want) { r.seen++; if (!re.test(nl)) r.bad.push({ where: "src/utils/no-log.ts", what: `決まりの行が見つからない: ${what}` }); }
  // 送る口が noLog() を見る (log-sender の flush・put、track の screen)
  r.seen++;
  const ls = read("src/services/telemetry/log-sender.ts");
  if ((ls.match(/if \(noLog\(\)\)/g) ?? []).length < 2) r.bad.push({ where: "src/services/telemetry/log-sender.ts", what: "flush と put の両方で noLog() を見ていない" });
  r.seen++;
  const pp = read("scripts/preview-prod.mjs");
  if (!/DEV \? \{ VITE_DEV_PREVIEW: "1" \} : LIVE \? \{\} : \{ VITE_WEB_API: ORIGIN \}/.test(pp)) r.bad.push({ where: "scripts/preview-prod.mjs", what: "1460 の送り先を手元 (VITE_WEB_API: ORIGIN) にする行が見つからない" });
}

// ---- Y-105 ページを移るたびに screen ----
{
  const r = rule("Y-105", "どのページへ移っても screen の記録が出る");
  const pg = read("src/web/page.ts"), tk = read("src/web/track.ts");
  const keys = JSON.parse((pg.match(/const PAGE_KEYS = (\[[^\]]*\])/) ?? [, "[]"])[1].replace(/'/g, '"'));
  const block = pg.slice(pg.indexOf("pageTick.value++"), pg.indexOf("if (applying"));
  const arms = [...block.matchAll(/(?:else )?if \((.+?)\) track\("([^"]+)"/g)].map((m) => ({ cond: m[1], name: m[2] }));
  const hit = (cond, p) => {
    let x;
    if ((x = cond.match(/^p === "([^"]*)"$/))) return p === x[1];
    if ((x = cond.match(/^p\.startsWith\("([^"]*)"\)$/))) return p.startsWith(x[1]);
    if (/^dailyOf\(p\)$/.test(cond)) return /^page=daily/.test(p);
    return null; // 読めない分かれ道
  };
  for (const a of arms) if (hit(a.cond, "") === null) r.bad.push({ where: "src/web/page.ts", what: `読めない分かれ道 (台本を直す): ${a.cond}` });
  const pages = [...keys.map((k) => (k.startsWith("daily") ? `page=${k}&q=x` : `page=${k}`)), "course=x", ""];
  for (const p of pages) {
    r.seen++;
    const a = arms.find((x) => hit(x.cond, p));
    if (!a) { r.bad.push({ where: "src/web/page.ts", what: `「${p || "クラフト"}」へ移っても track("page:…") を呼ばない` }); continue; }
    const screenLine = tk.split("\n").find((l) => l.includes(`name === "${a.name}"`) && l.includes("screen("));
    if (!screenLine) r.bad.push({ where: "src/web/track.ts", what: `「${p || "クラフト"}」→ ${a.name} が screen() に入らない` });
  }
}

// ---- M-92 エミュはシミュを import しない ----
{
  const r = rule("M-92", "エミュの画面がシミュの画面のコードを import しない");
  const all = new Set(git("ls-files", "-co", "--exclude-standard", "src").split("\n").filter(Boolean));
  const EMU = /^src\/(views\/craft-stage|state\/emulator|services\/emulator)\//, SIM = /^src\/(views|state|services)\/simulator\//;
  const RE = /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gm;
  for (const f of [...all].filter((x) => EMU.test(x) && /\.(ts|vue)$/.test(x))) {
    r.seen++;
    for (const m of read(f).matchAll(RE)) {
      const spec = m[1] ?? m[2];
      const tg = spec.startsWith(".") ? posix.normalize(posix.join(posix.dirname(f), spec)) : spec.startsWith("@/") ? `src/${spec.slice(2)}` : null;
      if (tg && SIM.test(tg)) r.bad.push({ where: f, what: `import ${spec}` });
    }
  }
}

// ---- U-46 hex は style.css だけ (今の見張りをそのまま呼ぶ) ----
{
  // 10-28 に 576 件あった (前からの残り)。0 にするのはデザイン部長の仕事なので、ここは基準 (baseline.json の hex) より増えたら合わない
  const r = rule("U-46", "hex の色は style.css だけ (lint-hex.mjs、基準より増えない)");
  r.seen++;
  let out = "";
  try { out = execFileSync(process.execPath, [join(ROOT, "scripts/lint-hex.mjs")], { cwd: ROOT, encoding: "utf8", windowsHide: true, stdio: "pipe" }); }
  catch (e) { out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
  const n = Number((out.match(/(\d+) violations found/) ?? [, 0])[1]);
  hexNow = n;
  const base = BASE.hex ?? 0;
  if (n > base) r.bad.push({ where: "scripts/lint-hex.mjs", what: `${n} 件 (基準 ${base} より ${n - base} 増えた)。増えた所: lint-hex の一覧で新しい行` });
  else r.info = `${n} 件 (基準 ${base})`;
}

const total = results.reduce((a, r) => a + r.bad.length, 0);
if (JSON_OUT) console.log(JSON.stringify({ total, results }, null, 1));
else {
  for (const r of results) {
    console.log(`${r.bad.length ? "✗" : "✓"} ${r.rule} ${r.title} — 見た ${r.seen}・合わない ${r.bad.length}${r.info ? ` (${r.info})` : ""}`);
    for (const b of r.bad.slice(0, 20)) console.log(`    ${b.where}  ${b.what}`);
    if (r.bad.length > 20) console.log(`    …ほか ${r.bad.length - 20} 件`);
  }
  console.log(`合わない所: ${total}`);
}
// --update: 今の hex の数を基準に書く (減った時・わざと増やした時だけ。書いたら commit)
if (process.argv.includes("--update")) {
  const all = existsSync(BASE_PATH) ? JSON.parse(readFileSync(BASE_PATH, "utf8")) : {};
  all.static = { ...(all.static ?? {}), hex: hexNow };
  writeFileSync(BASE_PATH, `${JSON.stringify(all, null, 1)}\n`);
  console.log(`基準を書いた: hex ${hexNow}`);
}
process.exitCode = total ? 1 : 0;

#!/usr/bin/env node
/**
 * data-backup.mjs — 取り直せない外の写しを、別の非公開の repo (exiledesk-data) に控える / 戻す (E-06、2026-11-12)
 *
 * data-cache/ は git に無く、この PC だけにある。大半は台本で取り直せるが、次の 3 つは取り直す台本が無い:
 *   - Craft of Exile の写し (data-cache/coe-*。ルーンの特殊 MOD の重み = E-03 の元)
 *   - ジュエルの MOD の写し (data-cache/poe2db-jewels/。jewel-bases.json の元)
 *   - クライアントの表の書き出しの設定 (data-cache/client-export*\/config.json。どの表のどの列を書き出すか)
 * 控えの中身はこの (公開の) repo には写さない。置き場は非公開の repo の手元の clone。
 *
 *   pnpm data:backup                       … 控える物の一覧 (大きさ・鍵やトークンらしき文字の有る無し) を出すだけ
 *   pnpm data:backup --to <clone の場所>    … clone へ写し、MANIFEST.json (日・大きさ・sha256) を書く。git の commit / push はしない
 *   pnpm data:backup --to <clone> --push   … 写した後に、その clone で git add → commit → push
 *   pnpm data:backup --restore <clone>     … clone から data-cache/ へ戻す (今ある物は上書きしない。上書きは --force)
 * clone の作り方: git clone https://github.com/kyohei0612/exiledesk-data ../exiledesk-data
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache");
const args = process.argv.slice(2);
const val = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);

/** 控える物 (data-cache からの相対の道) */
function targets() {
  if (!existsSync(CACHE)) return [];
  const top = readdirSync(CACHE);
  const out = top.filter((f) => /^coe-/.test(f) && statSync(join(CACHE, f)).isFile());
  if (top.includes("poe2db-jewels")) out.push(...readdirSync(join(CACHE, "poe2db-jewels")).map((f) => `poe2db-jewels/${f}`));
  for (const d of top) if (d.startsWith("client-export") && existsSync(join(CACHE, d, "config.json"))) out.push(`${d}/config.json`);
  return out.sort();
}
/** 鍵・トークン・個人の情報らしき文字 (当たっても止めない、見せるだけ。ゲームの言葉の Token・サイトのコードの cookie は当たる) */
const RISK = /api[_-]?key|secret|token|password|passwd|authorization|bearer |cookie|POESESSID|@[a-z0-9-]+\.(com|jp)|[A-Z]:[\\/]+Users[\\/]/gi;
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

const list = targets();
if (args.includes("--restore")) {
  const from = resolve(val("--restore") ?? "");
  if (!existsSync(join(from, "MANIFEST.json"))) { console.error(`× ${from} に MANIFEST.json が無い (exiledesk-data の clone の場所を渡す)`); process.exit(1); }
  const man = JSON.parse(readFileSync(join(from, "MANIFEST.json"), "utf8"));
  let put = 0, kept = 0, bad = 0;
  for (const f of man.files) {
    const src = join(from, "data-cache", f.path), dst = join(CACHE, f.path);
    if (!existsSync(src) || sha(src) !== f.sha256) { console.error(`× 控えが壊れている・無い: ${f.path}`); bad++; continue; }
    if (existsSync(dst) && !args.includes("--force")) { kept++; continue; }
    mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); put++;
  }
  console.log(`戻した ${put}・今あるので触らなかった ${kept}・壊れ ${bad} (控えの日 ${man.date})`);
  process.exit(bad ? 1 : 0);
}

let total = 0;
const rows = list.map((p) => { const full = join(CACHE, p); const size = statSync(full).size; total += size; const hits = [...new Set((readFileSync(full, "utf8").match(RISK) ?? []).map((s) => s.toLowerCase()))]; return { path: p, size, hits }; });
console.log(`控える物 ${rows.length} ファイル・合わせて ${(total / 1024 / 1024).toFixed(1)} MB (取り直す台本の無い写し)`);
for (const r of rows) console.log(`  ${String(Math.round(r.size / 1024)).padStart(6)} KB  ${r.path}${r.hits.length ? `  〔当たった文字: ${r.hits.slice(0, 6).join("・")}〕` : ""}`);
const to = val("--to");
if (!to) { console.log("\n一覧だけ。写すのは --to <exiledesk-data の clone の場所>。当たった文字は前後を見て鍵でないかを確かめてから上げる"); process.exit(0); }

const dest = resolve(to);
if (!existsSync(join(dest, ".git"))) { console.error(`× ${dest} は git の clone ではない`); process.exit(1); }
const files = [];
for (const r of rows) {
  const dst = join(dest, "data-cache", r.path);
  mkdirSync(dirname(dst), { recursive: true }); copyFileSync(join(CACHE, r.path), dst);
  files.push({ path: r.path, size: r.size, sha256: sha(dst) });
}
writeFileSync(join(dest, "MANIFEST.json"), JSON.stringify({ date: new Date().toISOString().slice(0, 10), note: "ExileDesk の data-cache のうち取り直す台本の無い写し。戻す: pnpm data:backup --restore <ここ>", files }, null, 1) + "\n");
console.log(`\n写した: ${dest} (${files.length} ファイル + MANIFEST.json)`);
if (args.includes("--push")) {
  const g = (...a) => execFileSync("git", ["-C", dest, ...a], { stdio: "inherit", windowsHide: true });
  g("add", "data-cache", "MANIFEST.json");
  try { g("commit", "-m", `控え ${new Date().toISOString().slice(0, 10)} (${files.length} ファイル)`); } catch { console.log("変わった物が無いので commit しない"); process.exit(0); }
  g("push");
}

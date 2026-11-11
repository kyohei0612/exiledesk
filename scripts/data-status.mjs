#!/usr/bin/env node
/**
 * data-status.mjs — ゲームのデータの版の一覧 (E-06、2026-11-12)。読むだけ
 *
 * 新しいリーグの後に「どのデータが古いままか」を 1 か所で見る。データのファイルごとに:
 *   最後に変わった日 (git の履歴)・大きさ・中の印 (generated / patch / source があれば)・作る台本 (scripts/ の中でそのファイル名を書いている台本)
 * 外の写し (data-cache/、git に無い) は更新の日だけ。
 *   pnpm data:status              … 一覧 (古い順)
 *   pnpm data:status --since 2026-12-01 … その日より前から変わっていない物に印 (新リーグの日を渡す)
 *   pnpm data:status --json       … 機械で読む形
 * 作り直しの順は pnpm data:all。
 */
import { execFileSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const SINCE = args.includes("--since") ? args[args.indexOf("--since") + 1] : null;
const git = (...a) => { try { return execFileSync("git", ["-C", ROOT, ...a], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

/** ゲームのデータの置き場 (フォルダー直下の .json と、手で書いた直しの .ts) */
const DIRS = ["src/vendor/poe2htc/data", "src/services/htc", "src/services/craft-stage", "src/services/mods", "src/services/items", "src/i18n", "src/data"];
const HAND_TS = ["src/services/htc/weight-overrides.ts", "src/services/htc/poe2db-value-fixes.ts", "src/services/htc/poe2db-abyss-fix.ts", "src/services/htc/rune-split.ts"];
const files = [...DIRS.flatMap((d) => (existsSync(resolve(ROOT, d)) ? readdirSync(resolve(ROOT, d)).filter((f) => f.endsWith(".json")).map((f) => `${d}/${f}`) : [])), ...HAND_TS.filter((f) => existsSync(resolve(ROOT, f)))];

/** 作る台本: scripts/ の中でそのファイル名を書いている build-*・audit-*・refresh-* (名前の一致だけ。読むだけの台本も混ざるので目安) */
const scripts = readdirSync(resolve(ROOT, "scripts")).filter((f) => /^(build|audit|extract|refresh)-.*\.(mjs|py)$/.test(f)).map((f) => [f, readFileSync(resolve(ROOT, "scripts", f), "utf8")]);
const makers = (file) => { const base = file.split("/").pop(); return scripts.filter(([, t]) => t.includes(base)).map(([f]) => f); };
/** 頭の 2,000 字から印を読む (大きい JSON を全部読まない) */
function stamp(file) {
  const fd = openSync(resolve(ROOT, file), "r"); const buf = Buffer.alloc(2000); const n = readSync(fd, buf, 0, 2000, 0); closeSync(fd);
  const head = buf.toString("utf8", 0, n);
  const pick = (k) => head.match(new RegExp(`"${k}"\\s*:\\s*"([^"]{0,80})`))?.[1];
  return [pick("generated") && `generated ${pick("generated").slice(0, 10)}`, pick("patch") && `patch ${pick("patch")}`, pick("source") && `source ${pick("source").slice(0, 40)}`].filter(Boolean).join(" / ");
}
const rows = files.map((f) => {
  const m = makers(f);
  return { file: f, date: git("log", "-1", "--format=%cs", "--", f) || "(git に無い)", kb: Math.round(statSync(resolve(ROOT, f)).size / 1024), stamp: f.endsWith(".json") ? stamp(f) : "手で書く", makers: f.endsWith(".ts") ? [] : m };
}).sort((a, b) => a.date.localeCompare(b.date));
const cacheDir = resolve(ROOT, "data-cache");
const caches = existsSync(cacheDir) ? readdirSync(cacheDir).map((d) => ({ name: d, date: statSync(resolve(cacheDir, d)).mtime.toISOString().slice(0, 10) })).sort((a, b) => a.date.localeCompare(b.date)) : [];

if (args.includes("--json")) { console.log(JSON.stringify({ rows, caches }, null, 1)); process.exit(0); }
const old = (d) => (SINCE && d < SINCE ? " ◀ 古いまま" : "");
console.log(`ゲームのデータ ${rows.length} ファイル (最後に変わった日の古い順${SINCE ? `、${SINCE} より前から変わっていない物に印` : ""})\n`);
for (const r of rows) console.log(`${r.date}  ${String(r.kb).padStart(6)} KB  ${r.file}${old(r.date)}\n            ${r.stamp || "印なし"} ／ 作る台本: ${r.makers.length ? r.makers.join("・") : r.stamp === "手で書く" ? "無し (手)" : "見つからない (手か、上流の取り込み)"}`);
console.log(`\n外の写し data-cache/ (git に無い、この PC だけ) ${caches.length} 個: 古い ${caches.slice(0, 3).map((c) => `${c.name} ${c.date}`).join("・")} … 新しい ${caches.slice(-3).map((c) => `${c.name} ${c.date}`).join("・")}`);
const none = rows.filter((r) => !r.makers.length);
console.log(`\n作る台本が見つからない ${none.length} ファイル: ${none.map((r) => r.file.split("/").pop()).join("・")}`);
if (SINCE) console.log(`${SINCE} より前から変わっていない: ${rows.filter((r) => r.date < SINCE).length} / ${rows.length} ファイル`);

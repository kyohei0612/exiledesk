#!/usr/bin/env node
/**
 * build-sw.mjs — Web 版の service worker (dist-web/sw.js) を作る (2026-10-15 PWA)。本体は scripts/pwa-sw.js。
 *
 * 最初に持つ物 (PRECACHE) = 画面と計算とデータ: index.html (/)・assets・ui-art・fonts・アイコン。絵 (base-art など) は入れない (使った物から順に SW がためる)。
 * VERSION = 持つ物の中身の hash。中身が同じなら版も同じ (出し直しても利用者に「新しい版」を出さない)。ART_VERSION = 絵の中身の hash (変わった時だけ絵を捨てる)。
 *
 *   node scripts/build-sw.mjs [出力先 (既定 dist-web、WEB_OUT でも)]
 * pnpm build:web の最後に回す (vite build の後)
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, process.argv[2] ?? process.env.WEB_OUT ?? "dist-web");
const SHELL_DIRS = ["assets", "ui-art", "fonts", "web"];
const SHELL_FILES = ["favicon.png", "favicon.ico"];
/** 持たない物 (SNS に貼った時の絵は画面で使わない) */
const SKIP = new Set(["web/og.png"]);
const ART_DIRS = ["base-art", "unique-art", "rune-art", "skill-art"];

const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const rel = (p) => relative(OUT, p).split(sep).join("/");
const url = (r) => "/" + r.split("/").map(encodeURIComponent).join("/");
const hashOf = (files) => {
  const h = createHash("sha256");
  for (const f of files) { h.update(rel(f)); h.update("\0"); h.update(readFileSync(f)); }
  return h.digest("hex").slice(0, 12);
};

if (!existsSync(join(OUT, "index.html"))) { console.error(`build-sw: ${OUT}/index.html が無い (先に vite build)`); process.exit(1); }
const files = [...SHELL_DIRS.flatMap((d) => walk(join(OUT, d))), ...SHELL_FILES.map((f) => join(OUT, f)).filter(existsSync)]
  .filter((f) => !SKIP.has(rel(f))).sort();
const shell = [join(OUT, "index.html"), ...files];
const art = ART_DIRS.flatMap((d) => walk(join(OUT, d))).sort();
const VERSION = hashOf(shell);
const ART_VERSION = hashOf(art);
const PRECACHE = ["/", ...files.map((f) => url(rel(f)))];
const head = `const VERSION = ${JSON.stringify(VERSION)};\nconst ART_VERSION = ${JSON.stringify(ART_VERSION)};\nconst PRECACHE = ${JSON.stringify(PRECACHE)};\n`;
writeFileSync(join(OUT, "sw.js"), head + readFileSync(join(ROOT, "scripts/pwa-sw.js"), "utf8"));
const mb = (fs) => (fs.reduce((s, f) => s + statSync(f).size, 0) / 1048576).toFixed(1);
console.log(`service worker: 版 ${VERSION} · 最初に持つ物 ${PRECACHE.length} 個 ${mb(shell)} MB · 絵 ${art.length} 個 ${mb(art)} MB (使った物から)`);

#!/usr/bin/env node
// 出した後の後片付けの数え (R-03 の ②、オーナー 11-12「ア」= 台本で数えて、ずれがあれば出した人に知らせる。止めない)。読むだけ。
//   1 設計図が「開発版だけ・本番待ち・OK 待ち」と言うスイッチが、本番の表 (src/web/release-flags.ts の RELEASED) にある
//   2 更新内容のある本番の版 (src/data/changelog-notes.json) のうち、出し待ちの紙 docs/pending-release.md の「済み」の行に無い版
//     (数えるのは紙の「数えの始まり = v0.1.N」から。それより前の抜けは git の履歴が記録)
// 使い方: node scripts/check-release-tidy.mjs [--root <dir>]   (pnpm check:release-tidy)
//   ずれ 0 なら 1 行。ずれがあれば 1 件 1 行で並べる。どちらも exit 0 (出しは止めない)。
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const i = process.argv.indexOf("--root");
const root = path.resolve(i >= 0 ? process.argv[i + 1] : process.cwd());
const read = (p) => readFileSync(path.join(root, p), "utf8");
const out = [];

// 1 スイッチ: 本番の表
const flags = read("src/web/release-flags.ts").split(/\r?\n/);
const a = flags.findIndex((l) => /^const RELEASED\b/.test(l));
let b = a;
while (b < flags.length && !/^\]\)/.test(flags[b])) b++;
const released = new Set((flags.slice(a, b).join("\n").replace(/\/\/.*$/gm, "").match(/"[A-Za-z0-9]+"/g) || []).map((x) => x.slice(1, -1)));
// 設計図: スイッチの名前のそばに「開発版だけ・本番待ち・OK 待ち・未リリース」があり、同じそばに「で本番・本番入り」が無い
const NOT_YET = /開発版だけ|本番待ち|OK 待ち|OK まで|未リリース/;
const specDir = path.join(root, "docs/spec");
for (const f of readdirSync(specDir).filter((x) => x.endsWith(".md"))) {
  for (const ln of readFileSync(path.join(specDir, f), "utf8").split(/\r?\n/)) {
    for (const m of ln.matchAll(/スイッチ `?([A-Za-z][A-Za-z0-9]+)`?/g)) {
      if (!released.has(m[1])) continue;
      const near = ln.slice(Math.max(0, m.index - 14), m.index + m[0].length + 26);
      if (!NOT_YET.test(near) || /で本番|本番入り/.test(near)) continue;
      const id = (ln.match(/\*\*([A-Z]-\d+[a-z]?\d*)/) || [])[1] || "番号の無い行";
      out.push(`[スイッチ] ${f} ${id}: 設計図は「${(near.match(NOT_YET) || [])[0]}」、スイッチ ${m[1]} はもう本番の表にある → 状態を「有効」に (G-29 ⑤)`);
    }
  }
}

// 2 出し待ちの紙の「済み」に無い版
const pending = read("docs/pending-release.md");
const start = Number((pending.match(/数えの始まり = v0\.1\.(\d+)/) || [])[1] || 0);
const done = new Set();
for (const ln of pending.split(/\r?\n/)) if (ln.startsWith("済み")) for (const m of ln.matchAll(/v0\.1\.(\d+)/g)) done.add(Number(m[1]));
const notes = JSON.parse(read("src/data/changelog-notes.json"));
const missing = Object.entries(notes)
  .filter(([, v]) => Array.isArray(v) && v.length) // 裏方の空の版は数えない (R-07)
  .map(([k]) => Number(k.split(".")[2]))
  .filter((n) => n >= start && !done.has(n))
  .sort((x, y) => x - y);
const show = missing.length > 12 ? [...missing.slice(0, 3), "…", ...missing.slice(-6)] : missing;
if (missing.length) out.push(`[出し待ちの紙] docs/pending-release.md の「済み」に無い版 ${missing.length} つ: ${show.map((n) => (n === "…" ? n : "v0.1." + n)).join("・")} → 済みの行を足す`);

console.log(out.length ? `後片付けのずれ ${out.length} 件 (R-03、出しは止めない):\n` + [...new Set(out)].join("\n") : `後片付けのずれ 0 (本番のスイッチ ${released.size}・済みの版は v0.1.${start} から数えた)`);

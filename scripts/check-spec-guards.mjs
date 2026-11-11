#!/usr/bin/env node
// 決まり → 見張り / テスト の表 (外のレビューの 2、オーナー 11-12「２やる」= 歯止めが中身を見る形に)。読むだけ・止めない。
//   設計図の番号が、テスト (tests/)・見張り (scripts/sim-watch・app-watch・check-*.mjs)・フックの中に名前で出るかを数え、
//   ① 紙は「見張り」と言うのに、どのテスト・見張りにも番号が出ない決まり ② テスト・見張りに番号が出るのに、紙の確かめ方に見張りと書いていない決まり を並べる。
//   名前が出る = その決まりを確かめている、とは限らない (テストの名前の頭に番号を書く形「E-41: …」にそろえていくための表)。
// 使い方: node scripts/check-spec-guards.mjs [--list] [--paper engine] [--root <dir>]   (pnpm check:spec-guards)
//   既定は紙ごとの数と上から数件。--list で全部。どちらも exit 0。
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ai = process.argv.indexOf("--root");
const R = path.resolve(ai >= 0 ? process.argv[ai + 1] : process.cwd());
const list = process.argv.includes("--list");
const pi = process.argv.indexOf("--paper");
const only = pi >= 0 ? process.argv[pi + 1] : "";
const walk = (d, f = []) => { if (!existsSync(d)) return f; for (const n of readdirSync(d)) { if (n === "node_modules" || n === "archive") continue; const p = path.join(d, n); statSync(p).isDirectory() ? walk(p, f) : f.push(p.replace(/\\/g, "/")); } return f; };

// 設計図の決まり (番号の付いた行 + 状態・確かめの子の行)
const D = path.join(R, "docs/spec");
const items = new Map();
for (const f of readdirSync(D).filter((x) => x.endsWith(".md"))) {
  let cur = null;
  for (const ln of readFileSync(path.join(D, f), "utf8").split(/\r?\n/)) {
    const m = ln.match(/^\s*(?:- \*\*|\| ?\*{0,2})(?:\(撤回\) )?([GYEMSURTD]-\d{2,3}[a-z]?\d*x?)(?![\w〜])/);
    if (m) { cur = { file: f.replace(".md", ""), text: ln }; if (!items.has(m[1])) items.set(m[1], cur); }
    else if (cur && /^\s+- /.test(ln)) cur.text += "\n" + ln;
  }
}
const says = (t) => {
  if (/^\s*(?:- \*\*|\|)[^*|]{0,12}\(撤回|^\s*- \*\*[A-Z]-\S+ \(撤回| — 撤回|廃止/.test(t.slice(0, 80)) || / — 撤回/.test(t)) return "撤回";
  const tail = t.slice(Math.max(0, t.lastIndexOf(" — "))) + (t.match(/確かめ(?:方)?[:： ][^\n]*/g) || []).join(" ");
  return /見張り|golden|tests\/|\.test\.ts|check-[a-z-]+\.mjs|judge|sim-watch|app-watch/.test(tail) ? "見張り" : /外の正解|poe2db|トレード|取引所|オーナーのゲーム|オーナーがゲーム|CoE|画面|スナップ/.test(tail) ? "ほか" : "書いていない";
};

// 見張り・テストの中に出る番号 → どのファイルか
const guardFiles = [
  ...walk(path.join(R, "tests")).filter((f) => /\.(ts|mjs)$/.test(f)),
  ...walk(path.join(R, "scripts/sim-watch")).filter((f) => /\.(mjs|js|ts)$/.test(f)),
  ...walk(path.join(R, "scripts/app-watch")).filter((f) => /\.(mjs|js|ts)$/.test(f)),
  ...readdirSync(path.join(R, "scripts")).filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => path.join(R, "scripts", f).replace(/\\/g, "/")),
  ...walk(path.join(R, ".claude/hooks")),
];
const where = new Map();
for (const f of guardFiles) for (const m of readFileSync(f, "utf8").matchAll(/(?<![A-Za-z0-9])([GYEMSURTD]-\d{2,3}[a-z]?\d*)/g)) if (items.has(m[1])) { const s = where.get(m[1]) || new Set(); s.add(f.replace(R.replace(/\\/g, "/") + "/", "")); where.set(m[1], s); }

const rows = {};
const noGuard = [], notSaid = [];
for (const [id, it] of items) {
  if (only && it.file !== only) continue;
  const k = says(it.text);
  if (k === "撤回") continue;
  const r = (rows[it.file] ??= { n: 0, said: 0, named: 0, both: 0 });
  r.n++; if (k === "見張り") r.said++; if (where.has(id)) r.named++; if (k === "見張り" && where.has(id)) r.both++;
  const head = it.text.replace(/^\s*(?:- \*\*|\| ?)/, "").replace(/\*\*/g, "").slice(0, 60);
  if (k === "見張り" && !where.has(id)) noGuard.push(`${it.file} ${head}`);
  if (k !== "見張り" && where.has(id)) notSaid.push(`${it.file} ${head} ← ${[...where.get(id)].slice(0, 2).join("・")}`);
}
console.log("決まり → 見張り / テスト の表 (撤回を除く。止めない)");
console.log("紙 | 決まり | 紙が見張りと言う | 見張り・テストに番号が出る | 両方そろう");
for (const [f, r] of Object.entries(rows)) console.log(`${f} | ${r.n} | ${r.said} | ${r.named} | ${r.both}`);
const show = (title, a) => { console.log(`\n${title}: ${a.length} 個`); for (const x of list ? a : a.slice(0, 6)) console.log("  " + x); if (!list && a.length > 6) console.log(`  … (--list で全部)`); };
show("① 紙は見張りと言うのに、どのテスト・見張りにも番号が出ない (テストの名前の頭に番号を書く)", noGuard);
show("② テスト・見張りに番号が出るのに、紙の確かめ方に見張りと書いていない (紙の確かめ方を直す)", notSaid);

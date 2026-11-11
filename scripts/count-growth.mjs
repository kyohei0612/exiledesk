#!/usr/bin/env node
// 増えた分の数え (G-29b、オーナー 11-12「３やる」= 足す一方を止める。週 1 回と出した後の後片付けの時に回す)。読むだけ・止めない。
//   設計図の字・決まり・フックの行・台本・テスト・口・スイッチ・部の紙・作業場の数を 1 行ずつ出し、前の控えとの差を並べる。
//   一緒に「消せる候補」(読まれていないスイッチ・名前がどこにも出ない台本・撤回が半分を超えた章・中身の残っていない古い作業場) を出す。
// 使い方: node scripts/count-growth.mjs [--save] [--root <dir>]   (pnpm count:growth)
//   --save で今の数を控え (scripts/count-growth.baseline.json) に取り直す。どちらも exit 0。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ai = process.argv.indexOf("--root");
const R = path.resolve(ai >= 0 ? process.argv[ai + 1] : process.cwd());
const save = process.argv.includes("--save");
const BASE = path.join(R, "scripts/count-growth.baseline.json");
const rd = (p) => readFileSync(path.join(R, p), "utf8");
const walk = (d, f = []) => { if (!existsSync(d)) return f; for (const n of readdirSync(d)) { if (n === "node_modules" || n === ".git" || n === "worktrees") continue; const p = path.join(d, n); statSync(p).isDirectory() ? walk(p, f) : f.push(p.replace(/\\/g, "/")); } return f; };
const lines = (t) => t.split(/\r?\n/).length;
const git = (...a) => { try { return execFileSync("git", ["-C", R, ...a], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };

// --- 数
const specDir = path.join(R, "docs/spec");
const spec = readdirSync(specDir).filter((f) => f.endsWith(".md")).map((f) => [f, readFileSync(path.join(specDir, f), "utf8")]);
const DEF = /^\s*(?:- \*\*|\| ?\*{0,2})(?:\(撤回\) )?([GYEMSURTD]-\d{2,3}[a-z]?\d*x?)(?![\w〜])/;
let rules = 0, retracted = 0;
const chapters = []; // 撤回の多い章
for (const [f, t] of spec) {
  let ch = null;
  for (const ln of t.split(/\r?\n/)) {
    const h = ln.match(/^#{2,4} (.*)/);
    if (h) { ch = { f, name: h[1].slice(0, 30), n: 0, r: 0 }; chapters.push(ch); continue; }
    if (!DEF.test(ln)) continue;
    const isR = /^\s*(?:- \*\*|\|)[^*|]{0,12}\(撤回|^\s*- \*\*[A-Z]-\S+ \(撤回| — 撤回/.test(ln);
    rules++; if (isR) retracted++;
    if (ch) { ch.n++; if (isR) ch.r++; }
  }
}
const hookDir = path.join(R, ".claude/hooks");
const hooks = existsSync(hookDir) ? readdirSync(hookDir) : [];
const scripts = walk(path.join(R, "scripts")).filter((f) => /\.(mjs|js|ts|cjs|ps1|py)$/.test(f));
const tests = walk(path.join(R, "tests")).filter((f) => /\.test\.ts$/.test(f));
const flagsT = rd("src/web/release-flags.ts");
const flagNames = [...flagsT.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]+):\s/gm)].map((m) => m[1]);
const FL = flagsT.split(/\r?\n/); const ra = FL.findIndex((l) => /^const RELEASED\b/.test(l)); let rb = ra; while (rb < FL.length && !/^\]\)/.test(FL[rb])) rb++;
const released = new Set((FL.slice(ra, rb).join("\n").replace(/\/\/.*$/gm, "").match(/"[A-Za-z0-9]+"/g) || []).map((x) => x.slice(1, -1)));
const wts = git("worktree", "list", "--porcelain").split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9));
const now = {
  "設計図の字": spec.reduce((a, [, t]) => a + t.length, 0),
  "設計図の行": spec.reduce((a, [, t]) => a + lines(t), 0),
  "決まり": rules,
  "うち撤回": retracted,
  "記録の紙の字": walk(path.join(specDir, "history")).reduce((a, f) => a + readFileSync(f, "utf8").length, 0),
  "フックの行": hooks.reduce((a, f) => a + lines(readFileSync(path.join(hookDir, f), "utf8")), 0),
  "台本": scripts.length,
  "テスト": tests.length,
  "口": Object.keys(JSON.parse(rd("package.json")).scripts).length,
  "スイッチ": flagNames.length,
  "うち本番": released.size,
  "部の紙": walk(path.join(R, "docs/org")).filter((f) => f.endsWith(".md")).length,
  "作業場": wts.length,
};

// --- 消せる候補
const cand = [];
// 読まれていないスイッチ (本番の表にあって、src のどこにも名前が出ない)
const srcText = walk(path.join(R, "src")).filter((f) => /\.(ts|vue)$/.test(f) && !f.endsWith("web/release-flags.ts")).map((f) => readFileSync(f, "utf8")).join("\n");
const unread = [...released].filter((n) => !new RegExp(`["'\`]${n}["'\`]`).test(srcText));
if (unread.length) cand.push(`読まれていないスイッチ ${unread.length} 個 (本番の表から名前を消せる、印が要る): ${unread.slice(0, 8).join(" ")}${unread.length > 8 ? " …" : ""}`);
// 名前がどこにも出ない台本 (設計図・部の紙・ほかの台本・口・フック・自動の流れ・テスト・CLAUDE.md)
const refs = [...walk(path.join(R, "docs")), ...walk(path.join(R, "scripts")), ...walk(path.join(R, "tests")), ...walk(path.join(R, ".github")), ...walk(hookDir), path.join(R, "package.json"), path.join(R, "CLAUDE.md"), ...walk(path.join(R, "server")).filter((f) => /package\.json$|\.md$/.test(f))]
  .filter((f) => /\.(md|mjs|js|ts|cjs|json|yml|txt)$/.test(f) && !/baseline|golden|trees(-old)?\.json/.test(f) && existsSync(f));
const refText = new Map(refs.map((f) => [f.replace(/\\/g, "/"), readFileSync(f, "utf8")]));
const lonely = scripts.filter((s) => { const b = path.basename(s); const stem = b.replace(/\.(mjs|js|ts|cjs)$/, ""); for (const [f, t] of refText) { if (f === s) continue; if (t.includes(b) || t.includes(`/${stem}"`) || t.includes(`/${stem}'`)) return false; } return true; });
if (lonely.length) cand.push(`名前がどこにも出ない台本 ${lonely.length} 本: ${lonely.slice(0, 6).map((s) => s.replace(R.replace(/\\/g, "/") + "/", "")).join(" ")}${lonely.length > 6 ? " …" : ""}`);
// 撤回が半分を超えた章 (決まり 4 つ以上)
const dead = chapters.filter((c) => c.n >= 4 && c.r / c.n > 0.5);
if (dead.length) cand.push(`撤回が半分を超えた章 ${dead.length} つ (記録の紙へ移せる): ${dead.map((c) => `${c.f.replace(".md", "")}「${c.name}」${c.r}/${c.n}`).join("・")}`);
// 中身の残っていない古い作業場 (書きかけ 0・本線に無い commit 0・最後の commit が 3 日より前)
const idle = [];
for (const w of wts.slice(1)) {
  if (!existsSync(w)) { idle.push(w + " (置き場が無い)"); continue; }
  const g = (...a) => { try { return execFileSync("git", ["-C", w, ...a], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return "?"; } };
  const age = (Date.now() / 1000 - Number(g("log", "-1", "--format=%ct"))) / 86400;
  if (g("status", "--short") === "" && g("rev-list", "--count", "origin/main..HEAD") === "0" && age > 3) idle.push(path.basename(w));
}
if (idle.length) cand.push(`中身の残っていない古い作業場 ${idle.length} 個 (書きかけ 0・本線に無い commit 0・3 日より前): ${idle.join(" ")}`);

// --- 出す
const old = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : null;
const diff = (k) => { if (!old || old.数[k] === undefined) return ""; const d = now[k] - old.数[k]; return d === 0 ? " (±0)" : ` (${d > 0 ? "+" : ""}${d})`; };
console.log(`増えた分の数え (G-29b)${old ? `、前の控え ${old.日}` : "、控えなし"}`);
console.log(Object.keys(now).map((k) => `${k} ${now[k].toLocaleString("ja-JP")}${diff(k)}`).join(" / "));
console.log(cand.length ? "消せる候補:\n- " + cand.join("\n- ") : "消せる候補: 無し");
if (save) { writeFileSync(BASE, JSON.stringify({ 日: new Date().toLocaleDateString("sv-SE"), 数: now }, null, 2) + "\n"); console.log("控えを取り直した: scripts/count-growth.baseline.json"); }

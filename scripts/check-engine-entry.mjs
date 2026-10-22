#!/usr/bin/env node
/**
 * check-engine-entry.mjs — エンジンの入口の見張り (付け替えの手 8、2026-10-20。案は docs/org/emulator/notes/2026-10-20-engine-entry-plan.md)。
 * 持ち主は docs/org/owners.txt (scripts/owner-of.mjs) から引く。数えるのは src/ の .ts・.vue の import / export from / import()。
 *   A 入口の外: シミュ・チュートリアル・解析の物が、エンジン部の仕組み (src/services/・src/vendor/ のジンの物) を
 *     入口 services/craft-stage/engine.ts を通さずに読む
 *   B 凍結: アプリ専用の services/simulator/htc/ を、その外の Web の物 (アプリの物以外) が読む
 *   C よその窓口・置き場: シミュ・チュートリアル・解析が engine-emu.ts を、エミュが engine-sim.ts を読む。エンジンの中で、核 (services/craft-stage の
 *     engine-sim/・engine-emu/ の外) が engine-sim/ / engine-emu/ を読む、engine-sim/ と engine-emu/ が互いを読む (2026-10-22 深夜、notes/2026-10-22-entry-split-plan.md)
 *   D 画面の混ざり: エミュの物がシミュ・チュートリアルの物を読む、シミュ・チュートリアルの物がエミュの物を読む (2026-10-22 深夜 オーナー
 *     「コードが混ざらないように」。両方が使う画面の部品は共通 src/components へ、中身はエンジンの入口へ。控えから始めて減らす)
 * 付け替え (手 7) の前なので、今の違反の数をファイルごとに控え (check-engine-entry.baseline.json) に持ち、
 * 決まり (A・B) ごとの合計が控えより増えた時だけ落ちる (オーナー 10-20 OK)。ファイルを割って import が移っただけの時は
 * 合計が同じなので落とさず、ファイルごとの増えは知らせだけ (10-20 の R3 で、移っただけで落ちたため)。減ったら `--write` で控えを取り直す。
 *
 *   node scripts/check-engine-entry.mjs           … 作業ツリーで数えて控えと比べる (CI は checkout = HEAD)
 *   node scripts/check-engine-entry.mjs --head    … commit 済みの HEAD の中身で数える (書きかけを入れない)
 *   node scripts/check-engine-entry.mjs --write   … 控えを取り直す (--head と一緒に使う)
 *   node scripts/check-engine-entry.mjs --list    … 違反の行を全部出す
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOwners, ownerOf } from "./owner-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = resolve(ROOT, "scripts/check-engine-entry.baseline.json");
const args = new Set(process.argv.slice(2));
const head = args.has("--head");

const sh = (cmd) => execSync(cmd, { windowsHide: true, cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const files = sh(head ? "git ls-tree -r --name-only HEAD src" : "git ls-files src")
  .split("\n").filter((f) => /\.(ts|vue)$/.test(f) && !f.endsWith(".d.ts"));
const all = new Set(head ? sh("git ls-tree -r --name-only HEAD src").split("\n") : sh("git ls-files -co --exclude-standard src").split("\n"));
const read = (f) => (head ? sh(`git show HEAD:"${f}"`) : existsSync(resolve(ROOT, f)) ? readFileSync(resolve(ROOT, f), "utf8") : "");

/** 相対の import の先 → リポジトリの根からのパス (見つからなければ null) */
function resolveSpec(from, spec) {
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const c of [base, `${base}.ts`, `${base}.vue`, `${base}.js`, `${base}.json`, `${base}/index.ts`]) if (all.has(c)) return c;
  return base;
}

const rows = loadOwners();
const WEB_SIDE = new Set(["シミュ", "チュートリアル", "解析", "エミュ"]);
/** 画面の混ざり (D) で数えるシミュの側 (チュートリアルはシミュ部長の持ち物) */
const SIM_SIDE = new Set(["シミュ", "チュートリアル"]);
/** 入口 (核 engine.ts と、出した側だけの engine-sim.ts・engine-emu.ts。2026-10-22 深夜、notes/2026-10-22-entry-split-plan.md) */
const ENTRIES = new Set(["src/services/craft-stage/engine.ts", "src/services/craft-stage/engine-sim.ts", "src/services/craft-stage/engine-emu.ts"]);
const CS = "src/services/craft-stage/";
/** C で見る側: 画面 (sim / emu) と、エンジンの中の置き場 (core / for-sim / for-emu)・窓口 (win-sim / win-emu) */
function sideOfEngine(path, who) {
  if (path === `${CS}engine-sim.ts`) return "win-sim";
  if (path === `${CS}engine-emu.ts`) return "win-emu";
  if (path.startsWith(`${CS}engine-sim/`)) return "for-sim";
  if (path.startsWith(`${CS}engine-emu/`)) return "for-emu";
  if (path === `${CS}engine.ts`) return "core-win";
  if (who === "ジン" && path.startsWith(CS)) return "core";
  if (SIM_SIDE.has(who) || who === "解析") return "sim";
  if (who === "エミュ") return "emu";
  return null;
}
/** 読んではいけない向き (読む側 → 読まれる側) */
function crosses(a, b) {
  if (a === "sim" && (b === "win-emu" || b === "for-emu")) return true;
  if (a === "emu" && (b === "win-sim" || b === "for-sim")) return true;
  if ((a === "core" || a === "core-win") && (b === "for-sim" || b === "for-emu" || b === "win-sim" || b === "win-emu")) return true;
  if (a === "for-sim" && (b === "for-emu" || b === "win-emu")) return true;
  if (a === "for-emu" && (b === "for-sim" || b === "win-sim")) return true;
  return false;
}
const IMPORT_RE = /(?:^|[\s;])(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;

const hits = []; // { rule, file, target }
for (const f of files) {
  const who = ownerOf(f, rows);
  const text = read(f);
  for (const m of text.matchAll(IMPORT_RE)) {
    const t = resolveSpec(f, m[1] ?? m[2] ?? m[3]);
    if (!t) continue;
    const tw = ownerOf(t, rows);
    if (WEB_SIDE.has(who) && tw === "ジン" && /^src\/(services|vendor)\//.test(t) && !ENTRIES.has(t)) hits.push({ rule: "A", file: f, target: t });
    if (sideOfEngine(f, who) && sideOfEngine(t, tw) && crosses(sideOfEngine(f, who), sideOfEngine(t, tw))) hits.push({ rule: "C", file: f, target: t });
    if ((who === "エミュ" && SIM_SIDE.has(tw)) || (SIM_SIDE.has(who) && tw === "エミュ")) hits.push({ rule: "D", file: f, target: t });
    if (t.startsWith("src/services/simulator/htc/") && !f.startsWith("src/services/simulator/htc/") && who !== "アプリ") hits.push({ rule: "B", file: f, target: t });
  }
}

const count = {};
for (const h of hits) count[`${h.rule} ${h.file}`] = (count[`${h.rule} ${h.file}`] ?? 0) + 1;
const total = (r) => hits.filter((h) => h.rule === r).length;
console.log(`見張り: A 入口の外 ${total("A")} 行 (${new Set(hits.filter((h) => h.rule === "A").map((h) => h.file)).size} ファイル)・B 凍結の htc/ ${total("B")} 行・C よその窓口 ${total("C")} 行・D エミュ ⇄ シミュ ${total("D")} 行 (${head ? "HEAD" : "作業ツリー"})`);
if (args.has("--list")) for (const h of hits) console.log(`${h.rule}\t${h.file}\t→ ${h.target}`);

if (args.has("--write")) {
  writeFileSync(BASE, JSON.stringify(Object.fromEntries(Object.entries(count).sort()), null, 1) + "\n");
  console.log(`控えを書いた: ${BASE}`);
  process.exit(0);
}
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : {};
const worse = Object.entries(count).filter(([k, n]) => n > (base[k] ?? 0));
const better = Object.entries(base).filter(([k, n]) => (count[k] ?? 0) < n);
const sumOf = (o, r) => Object.entries(o).filter(([k]) => k.startsWith(`${r} `)).reduce((a, [, n]) => a + n, 0);
const over = ["A", "B", "C", "D"].filter((r) => sumOf(count, r) > sumOf(base, r));
for (const [k, n] of worse) console.log(`${over.includes(k[0]) ? "増えた" : "移った? (合計は増えていない)"}: ${k} … ${base[k] ?? 0} → ${n}`);
for (const r of over) console.log(`増えた: ${r} の合計 ${sumOf(base, r)} → ${sumOf(count, r)} (${r === "C" ? "シミュは engine.ts と engine-sim.ts、エミュは engine.ts と engine-emu.ts だけ。核は engine-sim/・engine-emu/ を読まない" : r === "D" ? "エミュとシミュは互いの物を読まない。両方で使う部品は共通 src/components へ (ジン部長)" : "入口 engine.ts から取る。足りない物はジン部長に入口へ"})`);
if (better.length) console.log(`減った ${better.length} ファイル: 良い。\`node scripts/check-engine-entry.mjs --head --write\` で控えを取り直す`);
if (over.length) process.exit(1);
console.log("増えた所なし");

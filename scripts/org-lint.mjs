#!/usr/bin/env node
/**
 * org-lint.mjs — 組織の md とコードの荒れを数えて、物差しを超えた物だけを出す (2026-10-22、ホワイト用。docs/org/white/README.md の決まり 7・8)。
 * 読むだけ (何も書かない・直さない)。アプリ (src-tauri・craft-v2・trade2・market・pob-check、owners.txt の「アプリ」) と vendor/ は数えない。
 *
 *   node scripts/org-lint.mjs          … 人の読む形
 *   node scripts/org-lint.mjs --json   … JSON (ホワイトが前の日と比べる用)
 *
 * 使われていない物は import の図で数える (web・アプリ・テスト・台本の入口から届かないファイル、ほかのファイルに名前が出てこない export)。
 * 文字列で import する物 (動的 import の変数・設定ファイルの名前) は拾えないので「候補」として出す
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOwners, ownerOf } from "./owner-of.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEMORY = join(homedir(), ".claude/projects/C--Users-kyohei-ExileDesk/memory");
const LIMIT = { board: 40, todoKB: 8, rules: 10, memory: 120, lines: 500, untrackedHours: 24 };
/** 数えない所 (アプリ・取り込んだ物・動画・生成物) */
const SKIP = /(^|\/)(node_modules|dist[^/]*|src-tauri|vendor|craft-v2|trade2|market|pob-check|video|\.wrangler|data-cache)(\/|$)/;
/** import の図に入れない所 (図には凍結の所も入れる。通り道が切れると読まれている物を読まれないと数えるので) */
const NO_GRAPH = /(^|\/)(node_modules|dist[^/]*|src-tauri|video|\.wrangler|data-cache)(\/|$)/;
const CODE = new Set([".ts", ".vue", ".mjs", ".js"]);

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p) => readFileSync(p, "utf8");
const lineCount = (t) => t.split(/\r?\n/).length - (t.endsWith("\n") ? 1 : 0);
const owners = loadOwners();
const frozen = (p) => SKIP.test(p) || ownerOf(p, owners) === "アプリ";

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (NO_GRAPH.test(rel(p))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (CODE.has(extname(e.name)) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const found = { md: [], code: [], stray: [] };
const add = (kind, item) => found[kind].push(item);

// ---- md の物差し ----
const board = join(MEMORY, "black-board.md");
if (existsSync(board)) { const n = lineCount(read(board)); if (n > LIMIT.board) add("md", { what: "板の行数", path: "memory/black-board.md", value: n, limit: LIMIT.board }); }
const memIdx = join(MEMORY, "MEMORY.md");
if (existsSync(memIdx)) { const n = lineCount(read(memIdx)); if (n > LIMIT.memory) add("md", { what: "MEMORY.md の行数", path: "memory/MEMORY.md", value: n, limit: LIMIT.memory }); }
const ORG = join(ROOT, "docs/org");
for (const d of readdirSync(ORG, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const todo = join(ORG, d.name, "todo.md");
  if (existsSync(todo)) { const kb = Math.round((statSync(todo).size / 1024) * 10) / 10; if (kb > LIMIT.todoKB) add("md", { what: "todo.md の大きさ (KB)", path: rel(todo), value: kb, limit: LIMIT.todoKB }); }
  const readme = join(ORG, d.name, "README.md");
  if (existsSync(readme)) {
    // 「## 決まり」の節の頭の行 (番号つき・箇条書き) を数える
    const lines = read(readme).split(/\r?\n/);
    const head = lines.findIndex((l) => /^## 決まり/.test(l));
    const end = head < 0 ? -1 : lines.findIndex((l, i) => i > head && l.startsWith("## "));
    const n = head < 0 ? 0 : lines.slice(head + 1, end < 0 ? undefined : end).filter((l) => /^(\d+\.|-)\s/.test(l)).length;
    if (n > LIMIT.rules) add("md", { what: "README の決まりの数", path: rel(readme), value: n, limit: LIMIT.rules });
  }
}

// ---- コード: 500 行超え ----
const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "scripts")), ...walk(join(ROOT, "server")), ...walk(join(ROOT, "tests"))];
const text = new Map(files.map((f) => [f, read(f)]));
for (const [f, t] of text) {
  const p = rel(f);
  if (frozen(p)) continue;
  const n = lineCount(t);
  if (n > LIMIT.lines) add("code", { what: "500 行超え", path: p, value: n, limit: LIMIT.lines, owner: ownerOf(p, owners) });
}

// ---- コード: import の図 ----
const SPEC = /(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
function resolveSpec(from, spec) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;
  const base = spec.startsWith("/") ? join(ROOT, spec) : resolve(dirname(from), spec);
  const noQ = base.replace(/\?.*$/, "");
  for (const c of [noQ, ...[".ts", ".vue", ".mjs", ".js"].map((x) => noQ + x), noQ.replace(/\.js$/, ".ts"), join(noQ, "index.ts")]) if (text.has(c)) return c;
  return null;
}
const edges = new Map();
for (const [f, t] of text) {
  const to = new Set();
  for (const m of t.matchAll(SPEC)) { const r = resolveSpec(f, m[1] ?? m[2] ?? m[3]); if (r) to.add(r); }
  // 台本は bundleEntry(resolve(ROOT, "src/…ts")) のように文字列でも読む
  for (const m of t.matchAll(/["'`]((?:src|scripts|server)\/[^"'`\s]+\.(?:ts|vue|mjs|js))["'`]/g)) { const r = join(ROOT, m[1]); if (text.has(r)) to.add(r); }
  edges.set(f, to);
}
// 入口: html の script、テスト、台本 (名前が _ で始まらない物)、サーバーの入口、設定ファイル
const entries = new Set();
for (const h of ["index.html", "web.html"]) for (const m of read(join(ROOT, h)).matchAll(/src="\/([^"]+\.ts)"/g)) entries.add(join(ROOT, m[1]));
for (const f of text.keys()) {
  const p = rel(f);
  // scripts/_*-probe は vitest -c scripts/_*.config.ts で回す見張り、server/*/public/ は配っている物
  if (/^tests\/.*\.test\.ts$/.test(p) || /^scripts\/(?:.*\/)?([^_/][^/]*\.(mjs|ts|js)|[^/]*\.(test|config)\.ts)$/.test(p) || /^server\/[^/]+\/(src\/index\.ts|[^/]+\.js|public\/.*)$/.test(p)) entries.add(f);
}
for (const c of readdirSync(ROOT).filter((n) => /^(vite|vitest).*\.config\.ts$/.test(n))) for (const m of read(join(ROOT, c)).matchAll(SPEC)) { const r = resolveSpec(join(ROOT, c), m[1] ?? m[2] ?? m[3]); if (r) entries.add(r); }
const reach = (starts) => {
  const seen = new Set(starts);
  const q = [...starts];
  while (q.length) for (const n of edges.get(q.pop()) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
};
const reached = reach([...entries].filter((f) => text.has(f)));
for (const f of text.keys()) {
  const p = rel(f);
  if (reached.has(f) || frozen(p) || p.startsWith("tests/")) continue;
  add("code", { what: "どこからも読まれないファイル (候補)", path: p, owner: ownerOf(p, owners) });
}
// web から届くのに持ち主が「アプリ」(凍結のはずの物を web が使っている = owners.txt の食い違い)
const web = reach([join(ROOT, "src/web/main.ts")].filter((f) => text.has(f)));
const appDirs = new Map();
for (const f of web) { const p = rel(f); if (ownerOf(p, owners) === "アプリ") appDirs.set(dirname(p), (appDirs.get(dirname(p)) ?? 0) + 1); }
for (const [d, n] of appDirs) add("code", { what: "web が使うのに owners.txt が「アプリ」(フォルダーごとのファイル数)", path: `${d}/`, value: n, owner: "アプリ" });
// owners.txt の行で 1 つもファイルに当たらない物
const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8", windowsHide: true }).split("\n").filter(Boolean);
read(join(ROOT, "docs/org/owners.txt")).split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean).forEach((l, i) => {
  const re = owners[i].re;
  if (!tracked.some((p) => re.test(p))) add("code", { what: "owners.txt の行がどのファイルにも当たらない", path: `docs/org/owners.txt: ${l}` });
});
// 他のファイルに名前が出てこない export (自分のファイルの中だけで使う物は export を外せる)
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
const fileWords = new Map();
const wordFiles = new Map();
for (const [f, t] of text) {
  const ws = new Set(t.match(/[A-Za-z_$][\w$]*/g) ?? []);
  fileWords.set(f, ws);
  for (const w of ws) wordFiles.set(w, (wordFiles.get(w) ?? 0) + 1);
}
for (const [f, t] of text) {
  const p = rel(f);
  if (frozen(p) || p.startsWith("tests/") || !reached.has(f)) continue;
  const dead = [...t.matchAll(EXPORT)].map((m) => m[1]).filter((n) => (wordFiles.get(n) ?? 0) <= 1);
  if (dead.length) add("code", { what: "他から使われない export (候補)", path: p, value: dead.length, names: dead, owner: ownerOf(p, owners) });
}

// ---- 残り物: 1 日以上 commit されない ?? のファイル ----
const now = Date.now();
for (const l of execSync("git status --porcelain=v1 -uall", { cwd: ROOT, encoding: "utf8", windowsHide: true }).split("\n")) {
  if (!l.startsWith("??")) continue;
  const p = l.slice(3).replace(/^"|"$/g, "");
  if (p.startsWith("docs/org/white/notes/")) continue;
  const full = join(ROOT, p);
  if (!existsSync(full)) continue;
  const h = (now - statSync(full).mtimeMs) / 3600000;
  if (h >= LIMIT.untrackedHours) add("stray", { what: "1 日以上 commit されない ?? のファイル", path: p, value: Math.floor(h), owner: ownerOf(p, owners) });
}

// ---- 出す ----
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ date: new Date().toISOString().slice(0, 10), limits: LIMIT, ...found }, null, 1));
} else {
  const total = found.md.length + found.code.length + found.stray.length;
  if (!total) console.log("荒れ無し");
  for (const [kind, title] of [["md", "md"], ["code", "コード"], ["stray", "残り物"]]) {
    if (!found[kind].length) continue;
    console.log(`## ${title} (${found[kind].length})`);
    const by = new Map();
    for (const x of found[kind]) by.set(x.what, [...(by.get(x.what) ?? []), x]);
    for (const [what, xs] of by) {
      console.log(`- ${what}: ${xs.length}`);
      for (const x of xs.slice(0, 15)) console.log(`    ${x.path}${x.value != null ? ` ${x.value}${x.limit != null ? ` / ${x.limit}` : ""}` : ""}${x.names ? ` (${x.names.slice(0, 5).join(", ")}${x.names.length > 5 ? " …" : ""})` : ""}${x.owner ? ` [${x.owner}]` : ""}`);
      if (xs.length > 15) console.log(`    … ほか ${xs.length - 15} (--json で全部)`);
    }
  }
}

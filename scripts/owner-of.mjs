#!/usr/bin/env node
/**
 * owner-of.mjs — ファイルの持ち主の部を docs/org/owners.txt から引く (2026-10-20、オーナー OK の「持ち主の表を機械で持つ」)。
 * 開発部長が振る時・部長が commit する前に使う。案は docs/org/dev/notes/2026-10-20-agent-friendly.md の 3。
 *
 *   node scripts/owner-of.mjs <パス…>   … 1 行ずつ「部<TAB>パス」
 *   node scripts/owner-of.mjs --status  … git status の書きかけ (未 commit・未追跡) を部ごとに並べる
 *   node scripts/owner-of.mjs --check <部> <パス…>  … <部> の物でないパスを出す (警告だけ、終わりの値は 0)
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** glob (`*` = / を越えない、`**` = どこまでも) → 正規表現 */
function globRe(g) {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      i++;
      if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** owners.txt の行 (上から順、下の行ほど強い) */
export function loadOwners(root = ROOT) {
  return readFileSync(resolve(root, "docs/org/owners.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .map((l) => { const [g, dept] = l.split(/\s+/); return { re: globRe(g), dept }; });
}

/** パス (リポジトリの根から、/ 区切り) → 部 */
export function ownerOf(path, rows = loadOwners()) {
  const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
  let hit = "不明";
  for (const r of rows) if (r.re.test(p)) hit = r.dept;
  return hit;
}

function statusPaths() {
  const out = execSync("git status --porcelain=v1 -uall", { windowsHide: true, cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((l) => ({ st: l.slice(0, 2), path: l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, "") }));
}

const norm = (p) => relative(ROOT, resolve(process.cwd(), p)).replace(/\\/g, "/");

const [, , ...args] = process.argv;
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (!isMain) {
  // 部品として読まれた時 (check-engine-entry.mjs など) は何もしない
} else if (!args.length) {
  console.log("使い方: node scripts/owner-of.mjs <パス…> | --status | --check <部> <パス…>");
} else if (args[0] === "--status") {
  const rows = loadOwners();
  const by = new Map();
  for (const f of statusPaths()) {
    const d = ownerOf(f.path, rows);
    if (!by.has(d)) by.set(d, []);
    by.get(d).push(`${f.st} ${f.path}`);
  }
  if (!by.size) console.log("書きかけ無し");
  for (const [d, fs] of [...by].sort()) console.log(`## ${d} (${fs.length})\n${fs.map((f) => `  ${f}`).join("\n")}`);
} else if (args[0] === "--check") {
  const [, dept, ...paths] = args;
  const rows = loadOwners();
  const other = paths.map(norm).map((p) => [ownerOf(p, rows), p]).filter(([d]) => d !== dept);
  for (const [d, p] of other) console.log(`警告: ${p} は ${d} の物 (${dept} ではない)`);
} else {
  const rows = loadOwners();
  for (const p of args.map(norm)) console.log(`${ownerOf(p, rows)}\t${p}`);
}

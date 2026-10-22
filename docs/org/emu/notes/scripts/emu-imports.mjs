// エミュの画面 (owners.txt の「エミュ」) が入口 engine.ts を通さずにジンの src/services・src/vendor を読む所を数える
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
const ROOT = "C:/Users/kyohei/ExileDesk";
const { loadOwners, ownerOf } = await import("file:///C:/Users/kyohei/ExileDesk/scripts/owner-of.mjs");
const rows = loadOwners();
const sh = (c) => execSync(c, { cwd: ROOT, encoding: "utf8", windowsHide: true });
const all = new Set(sh("git ls-files -co --exclude-standard src").split("\n"));
const files = [...all].filter((f) => /\.(ts|vue)$/.test(f) && ownerOf(f, rows) === "エミュ");
const RE = /(?:^|[\s;])(?:import|export)\s([^"'`;]*?)from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/gm;
const res = (from, spec) => {
  if (!spec.startsWith(".")) return null;
  const b = posix.normalize(posix.join(posix.dirname(from), spec));
  for (const c of [b, `${b}.ts`, `${b}.vue`, `${b}.js`, `${b}.json`, `${b}/index.ts`]) if (all.has(c)) return c;
  return b;
};
const out = [];
for (const f of files) {
  const t = readFileSync(resolve(ROOT, f), "utf8");
  for (const m of t.matchAll(RE)) {
    const tg = res(f, m[2] ?? m[3]);
    if (!tg || !/^src\/(services|vendor)\//.test(tg)) continue;
    const tw = ownerOf(tg, rows);
    if (tg === "src/services/craft-stage/engine.ts") continue;
    const names = (m[1] ?? "dynamic import()").replace(/\s+/g, " ").trim();
    out.push({ f, tg, tw, names, type: /^type\s/.test(names) });
  }
}
console.log(JSON.stringify({ files: files.length, rows: out }, null, 0));

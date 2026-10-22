// out.json → 先ごとの表 (markdown)。入口 engine.ts が同じ名前を出していれば「入口にある」
import { readFileSync } from "node:fs";
const S = process.argv[2]; // out.json のあるフォルダー
const d = JSON.parse(readFileSync(`${S}/out.json`, "utf8"));
const eng = readFileSync("C:/Users/kyohei/ExileDesk/src/services/craft-stage/engine.ts", "utf8");
const have = new Set();
for (const m of eng.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g))
  for (const p of m[1].split(",")) { const n = p.trim().split(/\s+as\s+/).pop(); if (n) have.add(n); }
const namesOf = (s) => {
  const m = s.match(/\{([^}]*)\}/);
  const list = m ? m[1].split(",").map((x) => x.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean) : [];
  const def = s.replace(/^type\s+/, "").split(/[,{]/)[0].trim();
  if (def && def !== "dynamic import()" && !def.startsWith("*")) list.unshift(`default:${def}`);
  if (s.includes("* as")) list.unshift(s.trim());
  if (s === "dynamic import()") list.push("import()");
  return list;
};
const groups = {};
for (const r of d.rows) (groups[r.tg] ??= []).push(r);
const lines = [];
let inEntry = 0, notEntry = 0;
const order = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
for (const [tg, rs] of order) {
  const owner = rs[0].tw;
  const names = new Map();
  for (const r of rs) for (const n of namesOf(r.names)) {
    const e = names.get(n) ?? new Set(); e.add(r.f.replace(/^src\/(views\/craft-stage|state\/emulator)\//, "")); names.set(n, e);
  }
  const cells = [...names].map(([n, fs]) => {
    const ok = have.has(n);
    if (owner === "ジン") ok ? inEntry++ : notEntry++;
    return `${ok ? "✅" : ""}\`${n}\` (${[...fs].join("・")})`;
  });
  lines.push(`| ${tg.replace(/^src\//, "")} | ${owner} | ${rs.length} | ${cells.join("、")} |`);
}
console.log(lines.join("\n"));
console.log(`\n名前 (ジン): 入口にもうある ${inEntry}・まだ無い ${notEntry}`);

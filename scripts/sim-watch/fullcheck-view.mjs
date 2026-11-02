// fullcheck-view.mjs — fullcheck.mjs の結果を読む。 node fullcheck-view.mjs <jsonl> [--all (ずれの無い手も)] [--kind N,C,V,S,M,K] [--w 420]
import { readFileSync } from "node:fs";
const a = process.argv.slice(2), f = a[0], o = (k, v) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : v; };
const kinds = o("--kind")?.split(","), w = Number(o("--w", 420)), all = a.includes("--all");
for (const r of readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l))) {
  if (r.type === "parent") { console.log("■", r.name, r.err ?? r.item, r.err ? "" : `(見本の違い ${r.people?.length})`); continue; }
  if (r.err) { console.log(" 落ち", r.parent ?? r.tree, r.row ?? r.box, r.err.slice(0, 200)); continue; }
  const fs = (r.finds ?? []).filter((x) => !kinds || kinds.includes(x.kind));
  if (!fs.length && !all) continue;
  console.log(` ${r.row ?? `${r.tree} ${r.box} ${r.cur}+${r.omens}`} ${JSON.stringify(r.v ?? {})} ${r.skip ? "SKIP " + r.skip : `人${r.persons} 結果${r.outcomes} ${r.how ?? ""} 箱: ${(r.outs ?? []).join(" ")}`}`);
  for (const x of fs) console.log(`    ${x.kind} ${x.key} ×${x.n} ${JSON.stringify(x.ex[0]).slice(0, w)}`);
}

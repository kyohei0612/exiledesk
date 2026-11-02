// fullcheck-sum.mjs — fullcheck.mjs の結果を 行 × ずれの種類で束ねる。 node fullcheck-sum.mjs <jsonl> [--w 300]
import { readFileSync } from "node:fs";
const a = process.argv.slice(2), w = Number(a[a.indexOf("--w") + 1] || 300);
const rows = readFileSync(a[0], "utf8").trim().split("\n").map((l) => JSON.parse(l));
const norm = (k) => k.replace(/g:.*/, "g:").replace(/c:[0-9.|]+~\w+/, "c:").replace(/-?\d+\|-?\d+/, "#").replace(/(ItemFoundRarityIncreasePrefix|ItemFoundRarityIncrease|EvasionRating|FireResistance|ColdResistance|IncreasedLife|LocalEnergyShieldPercent)/g, "狙")
  .replace(/(狙,?)+/g, "狙").replace(/見本 -\d\+\d エンジン .*/, "");
const st = new Map(), g = new Map();
for (const r of rows) {
  if (r.type !== "hand" && r.type !== "tree") continue;
  const row = r.row ?? `木:${r.cur?.split(":")[0]}+${(r.omens ?? []).join("+").replace(/Omenof/g, "")}${r.keep ? (r.keep.length ? "(残)" : "(全)") : ""}${r.free ? "(無)" : ""}`;
  const s = st.get(row) ?? { ran: 0, skip: 0, parents: new Set(), outcomes: 0, why: new Map() }; st.set(row, s);
  if (r.skip) { s.skip++; s.why.set(r.skip, (s.why.get(r.skip) ?? 0) + 1); continue; }
  if (r.err) { s.err = (s.err ?? 0) + 1; continue; }
  if (r.back) { s.backs = (s.backs ?? 0) + 1; continue; }
  s.ran++; s.parents.add(r.parent ?? r.tree); s.outcomes += r.outcomes ?? 0;
  for (const f of r.finds ?? []) {
    const k = `${f.kind} ${row} ${norm(f.key)}`, x = g.get(k) ?? { k, n: 0, parents: new Set(), ex: f.ex[0], v: r.v };
    x.n++; x.parents.add(r.parent ?? r.tree); g.set(k, x);
  }
}
console.log("== 行ごと");
for (const [k, s] of st) console.log(`${k}: 回 ${s.ran} 親 ${s.parents.size} 結果 ${s.outcomes} 飛ばし ${s.skip}${s.backs ? " ↩" + s.backs : ""}${s.err ? " 落ち" + s.err : ""}${s.ran ? "" : " 理由 " + [...s.why.keys()].slice(0, 3).join(" / ").slice(0, 120)}`);
console.log("== ずれ", g.size);
for (const x of [...g.values()].sort((p, q) => p.k.localeCompare(q.k))) console.log(`${x.k} ×${x.n} 親[${[...x.parents].slice(0, 5).join(",")}${x.parents.size > 5 ? "…" + x.parents.size : ""}] ${JSON.stringify(x.v ?? "")} ${JSON.stringify(x.ex).slice(0, w)}`);

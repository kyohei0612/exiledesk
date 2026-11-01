// fullcheck-one.mjs — 結果の 1 行を全部見せる。 node fullcheck-one.mjs <jsonl> <親> <行> [kind]
import { readFileSync } from "node:fs";
const [f, p, row, kind] = process.argv.slice(2);
for (const l of readFileSync(f, "utf8").trim().split("\n")) {
  const r = JSON.parse(l);
  if (r.type !== "hand" || r.parent !== p || r.row !== row) continue;
  console.log(JSON.stringify(r.v), r.skip ?? `人${r.persons} 結果${r.outcomes} ${r.how} ${r.hitAims ?? ""}`, (r.outs ?? []).join("  "), JSON.stringify(r.probs ?? {}));
  for (const x of r.finds ?? []) if (!kind || x.kind === kind) console.log("  ", x.kind, x.key, "×" + x.n, JSON.stringify(x.ex[0]).slice(0, 700));
}

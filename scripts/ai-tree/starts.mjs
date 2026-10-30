/**
 * starts.mjs — 始め方の比べ (S-178): 固定する MOD ごとに問題を作って solve を並列に回し、完成までの表を出す。
 *   node scripts/ai-tree/starts.mjs <問題.json> [--jobs 12] [--only a,b] [--limit 3] [solve の指定 …]
 * 候補は pool の普通の MOD 全部 + 白ベース。固定の段は狙いならその段、外れは一番上。ベースの代金とフラクチャーを作る費用は数えない
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [file, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); if (i < 0) return d; const v = rest[i + 1]; rest.splice(i, 2); return v; };
const jobs = Number(opt("jobs", 12)), only = opt("only", ""), limit = Number(opt("limit", 0));
const white = opt("white", "1") !== "0";
const problem = JSON.parse(fs.readFileSync(file, "utf8"));
const CLI = "scripts/ai-tree/ai-tree.mjs";
const run = (args) => new Promise((ok) => {
  const c = spawn("node", [CLI, ...args]);
  let o = "", e = "";
  c.stdout.on("data", (d) => (o += d));
  c.stderr.on("data", (d) => (e += d));
  c.on("close", () => ok({ o, e }));
});

const pool = JSON.parse((await run(["pool", "--base", problem.base, "--ilvl", String(problem.itemLevel ?? 82), "--group", "normal"])).o);
const aimTier = new Map(Object.values(problem.aims).flatMap((a) => a.mods.map((m) => (typeof m === "string" ? [m, a.tier] : [m.id, m.tier ?? a.tier]))));
let cands = pool.map((x) => ({ id: x.id, text: x.text, aim: aimTier.has(x.id), tier: aimTier.get(x.id) ?? 1 }));
if (only) cands = cands.filter((c) => only.split(",").some((k) => c.id.includes(k)));
if (limit) cands = [...cands.filter((c) => c.aim), ...cands.filter((c) => !c.aim)].slice(0, limit);

const dir = path.join(process.env.AI_TREE_DIR ?? "data-cache/ai-tree", "starts", problem.name);
fs.mkdirSync(dir, { recursive: true });
const tasks = [...(white ? [{ id: null, text: "白ベース", aim: false }] : []), ...cands];
const rows = [];
const one = async (c) => {
  const name = `${problem.name}-${c.id ? c.id.split("/").pop() : "white"}`;
  const p = c.id
    ? { ...problem, name, basePrice: 0, start: { rarity: "rare", mods: [{ mod: c.id, tier: `T${c.tier}`, fractured: true }] }, solve: { ...problem.solve, opening: true } }
    : { ...problem, name, basePrice: 0 };
  const f = path.join(dir, `${name}.json`);
  fs.writeFileSync(f, JSON.stringify(p));
  const { o, e } = await run(["solve", f, "--free-base", ...rest]);
  try {
    const d = JSON.parse(o);
    rows.push({ start: c.text, id: c.id, aim: c.aim, id2: d.id, doneRate: d.doneRate, cost: d.costPerItem, ci95: d.costPerItemCi95, steps: d.steps.perItem, bases: d.basesPerItem, estimate: d.gap.estimate, off: d.gap.off, seconds: Math.round(d.solveMs / 1000), states: d.solve.states, truncated: d.solve.truncated, stuck: d.ends.stuck ?? 0 });
  } catch { rows.push({ start: c.text, id: c.id, error: (e || o).slice(-200) }); }
  console.error(`${rows.length}/${tasks.length} ${c.text}`);
};
const queue = [...tasks];
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await one(queue.shift()); }));
rows.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
const table = { problem: problem.name, basePrice: 0, note: "ベースとフラクチャーを作る費用は入れていない。bases は 1 個あたりの本数", rows };
fs.writeFileSync(path.join(dir, "table.json"), JSON.stringify(table, null, 1));
console.log(JSON.stringify(table, null, 1));

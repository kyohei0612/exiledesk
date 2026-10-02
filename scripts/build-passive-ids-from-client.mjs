#!/usr/bin/env node
/**
 * build-passive-ids-from-client.mjs — パッシブのノードの番号 → ゲームの文字列 ID (2026-10-03)
 *
 * 火力チェックの「ビルドプランナーに書き出す」で使う。ゲームのビルドプランナー (.build) は passives を文字列の ID
 * (PassiveSkills 表の Id、例 intelligence49) で書くが、PoB のツリー (spec.nodes / TreeData/<版>/tree.json) はノードの番号
 * (PassiveSkillGraphId) しか持たないので、ここで対応表を作る。
 *
 * 元: data-cache/client-export-passives/tables/English/PassiveSkills.json (config.json は Id / PassiveSkillGraphId)。
 *     2026-10-03 の実測: 9731 行、PassiveSkillGraphId は全部違う、PoB の tree.json (0_5) の 4914 ノード全部に対応がある
 * 出力: src/data/passive-ids.json ({ "<番号>": "<Id>" })。PoB の TreeData にあるノードだけに絞る (全部入れると 2 倍の大きさになる)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = readdirSync(resolve(ROOT, "data-cache"))
  .map((d) => resolve(ROOT, "data-cache", d, "tables", "English", "PassiveSkills.json"))
  .find((p) => existsSync(p) && "PassiveSkillGraphId" in (JSON.parse(readFileSync(p, "utf8"))[0] ?? {}));
if (!dir) {
  console.error("PassiveSkills の Id / PassiveSkillGraphId が書き出されていない (data-cache/client-export-passives で npx pathofexile-dat)");
  process.exit(1);
}
const rows = JSON.parse(readFileSync(dir, "utf8"));
const byGraph = new Map();
for (const r of rows) {
  if (!r.Id || !r.PassiveSkillGraphId) continue;
  if (byGraph.has(r.PassiveSkillGraphId)) console.warn(`同じ番号が 2 行: ${r.PassiveSkillGraphId} (${byGraph.get(r.PassiveSkillGraphId)} / ${r.Id})`);
  else byGraph.set(r.PassiveSkillGraphId, r.Id);
}

// PoB のツリーにあるノードだけ (版が複数あれば全部の和)
const treeDir = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/TreeData");
const treeIds = new Set();
for (const v of readdirSync(treeDir)) {
  const p = resolve(treeDir, v, "tree.json");
  if (!existsSync(p)) continue;
  for (const k of Object.keys(JSON.parse(readFileSync(p, "utf8")).nodes ?? {})) treeIds.add(Number(k));
}
const out = {};
const missing = [];
for (const id of [...treeIds].sort((a, b) => a - b)) {
  const s = byGraph.get(id);
  if (s) out[id] = s;
  else missing.push(id);
}
writeFileSync(resolve(ROOT, "src/data/passive-ids.json"), JSON.stringify(out) + "\n");
console.log(`passive-ids.json: ${Object.keys(out).length} 件 (表 ${rows.length} 行、PoB のツリー ${treeIds.size} ノード、対応なし ${missing.length}${missing.length ? ": " + missing.slice(0, 10).join(",") : ""})`);

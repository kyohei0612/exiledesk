#!/usr/bin/env node
/**
 * PoB の Mod*.lua から各 mod の `statOrder` を抽出し、key -> 数値 の map を生成。
 * POE2DB / ゲーム内表示の並び順は statOrder ベース。
 * 出力: src/i18n/stat-order.json
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const POB_DATA = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/Data");

const FILES = [
  "ModItem.lua",
  "ModCorrupted.lua",
  "ModJewel.lua",
  "ModFlask.lua",
  "ModVeiled.lua",
  "ModCharm.lua",
  "ModItemExclusive.lua",
];

const out = {};
let total = 0;

for (const f of FILES) {
  let txt;
  try {
    txt = await readFile(resolve(POB_DATA, f), "utf-8");
  } catch {
    continue;
  }
  const lines = txt.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*\["([^"]+)"\]\s*=\s*\{(.+)\},\s*$/);
    if (!m) continue;
    const key = m[1];
    const body = m[2];
    const so = body.match(/statOrder\s*=\s*\{\s*(\d+)/);
    if (!so) continue;
    out[key] = parseInt(so[1]);
    total++;
  }
  console.log(`  ${f.padEnd(25)} parsed`);
}

const outPath = resolve(ROOT, "src/i18n/stat-order.json");
await writeFile(outPath, JSON.stringify(out, null, 0));
console.log(`\n統計: ${total} entries with statOrder`);
console.log(`Output: ${outPath}`);

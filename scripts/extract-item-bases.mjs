#!/usr/bin/env node
/**
 * PoB の Data/Bases/*.lua から item base item とその implicit/stats を抽出。
 * オーナー指示「特に武器周りはかなり多いからな気を付けてねベースごとに暗黙違うから」
 * に応じ、ベース別 implicit mod を CraftHelper で参照可能にする。
 *
 * 出力: src/i18n/item-bases.json
 *  {
 *    "<base name>": {
 *      "category": "sword" | "axe" | ... ,  // ファイル名
 *      "type": "One Hand Sword" | ...,     // PoB の正式 type
 *      "tags": ["weapon", "one_hand_weapon", ...],
 *      "implicit": "+(16-24) to all Attributes" | null,
 *      "weapon": { PhysicalMin, PhysicalMax, CritChanceBase, AttackRateBase, Range } | null,
 *      "armour": { ArmourBase, EvasionBase, EnergyShieldBase } | null,
 *      "req": { level, str, dex, int }
 *    }, ...
 *  }
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BASES_DIR = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/Data/Bases");

/** Lua の `key = value` 1 行ペアから value を抜く（数値 / 文字列 / true|false） */
function parseLuaScalar(s) {
  s = s.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const sm = s.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (sm) return sm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  return s;
}

/**
 * itemBases["Name"] = { ... } のブロックを 1 つパース。
 * ネスト table もある（tags = {...}, weapon = {...}, req = {...}）ので深さ 1 まで対応。
 */
function parseBaseBlock(name, body) {
  const out = { name, type: "", tags: [], implicit: null, weapon: null, armour: null, req: {} };

  // type = "..."
  const typeM = body.match(/type\s*=\s*"([^"]+)"/);
  if (typeM) out.type = typeM[1];

  // tags = { ...inner... }
  const tagsM = body.match(/tags\s*=\s*\{\s*([^{}]*)\s*\}/);
  if (tagsM) {
    const tagPairs = tagsM[1];
    out.tags = (tagPairs.match(/(\w+)\s*=\s*true/g) ?? []).map((s) =>
      s.replace(/\s*=\s*true/, "").trim(),
    );
  }

  // implicit = "..."
  const implM = body.match(/implicit\s*=\s*"([^"]*)"/);
  if (implM && implM[1] !== "") out.implicit = implM[1];

  // weapon = { ... }
  const weaponM = body.match(/weapon\s*=\s*\{\s*([^{}]*)\s*\}/);
  if (weaponM) {
    out.weapon = {};
    const wkv = weaponM[1].match(/(\w+)\s*=\s*([^,]+?)\s*,?\s*$/gm);
    // simpler: match each `Key = Number,`
    const kvRe = /(\w+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
    let mm;
    while ((mm = kvRe.exec(weaponM[1])) !== null) {
      out.weapon[mm[1]] = Number(mm[2]);
    }
  }

  // armour = { ArmourBase, EvasionBase, EnergyShieldBase }
  const armourM = body.match(/armour\s*=\s*\{\s*([^{}]*)\s*\}/);
  if (armourM) {
    out.armour = {};
    const kvRe = /(\w+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
    let mm;
    while ((mm = kvRe.exec(armourM[1])) !== null) {
      out.armour[mm[1]] = Number(mm[2]);
    }
  }

  // req = { level = N, str = N, ... }
  const reqM = body.match(/req\s*=\s*\{\s*([^{}]*)\s*\}/);
  if (reqM) {
    const kvRe = /(\w+)\s*=\s*(-?\d+(?:\.\d+)?)/g;
    let mm;
    while ((mm = kvRe.exec(reqM[1])) !== null) {
      out.req[mm[1]] = Number(mm[2]);
    }
  }

  return out;
}

/**
 * 1 ファイルから itemBases["Name"] = { ... } 全 entry を抽出。
 * Lua block は複数行に渡るので、行ごとに `itemBases["Name"] = {` で開始 → `}` で終了の
 * ブレースカウントベースで切り出す。
 */
async function parseFile(filePath, category) {
  const txt = await readFile(filePath, "utf-8");
  const lines = txt.split(/\r?\n/);
  const entries = [];
  let cur = null;
  let depth = 0;
  for (const line of lines) {
    if (cur === null) {
      const startM = line.match(/^itemBases\["([^"]+)"\]\s*=\s*\{/);
      if (startM) {
        cur = { name: startM[1], body: line.replace(/^[^=]+=\s*/, "") };
        // 開始行内のブレースカウント
        depth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
        if (depth === 0) {
          const e = parseBaseBlock(cur.name, cur.body);
          entries.push({ ...e, category });
          cur = null;
        }
        continue;
      }
    } else {
      cur.body += "\n" + line;
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (depth === 0) {
        const e = parseBaseBlock(cur.name, cur.body);
        entries.push({ ...e, category });
        cur = null;
      }
    }
  }
  return entries;
}

const files = (await readdir(BASES_DIR)).filter((f) => f.endsWith(".lua"));
const all = {};
let totalCount = 0;
let withImplicit = 0;
const byCategory = {};

for (const f of files) {
  const cat = f.replace(/\.lua$/, "");
  const entries = await parseFile(resolve(BASES_DIR, f), cat);
  byCategory[cat] = entries.length;
  for (const e of entries) {
    all[e.name] = e;
    totalCount++;
    if (e.implicit) withImplicit++;
  }
  console.log(`  ${cat.padEnd(15)} ${entries.length} bases (${entries.filter((x) => x.implicit).length} with implicit)`);
}

const outPath = resolve(ROOT, "src/i18n/item-bases.json");
await writeFile(outPath, JSON.stringify(all, null, 0));

console.log(`\n総 base 数: ${totalCount}`);
console.log(`implicit を持つ base: ${withImplicit}`);
console.log(`Output: ${outPath} (${(JSON.stringify(all).length / 1024).toFixed(1)} KB)`);

console.log("\n=== 武器系の implicit サンプル (各 type 1 件) ===");
const weaponTypes = new Set();
for (const [name, e] of Object.entries(all)) {
  if (!e.implicit) continue;
  if (!e.weapon) continue;
  if (weaponTypes.has(e.type)) continue;
  weaponTypes.add(e.type);
  console.log(`  ${e.type.padEnd(20)} "${name}": ${e.implicit}`);
}

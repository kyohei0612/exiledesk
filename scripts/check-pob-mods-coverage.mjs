#!/usr/bin/env node
/**
 * PoB の ModItem.lua / ModCorrupted.lua / ModJewel.lua / ModFlask.lua / ModRunes.lua
 * （automated-generated, GGG 公式データソース）と bundle.json (RePoE 抽出) を
 * key 単位で 2 重チェックする。
 *
 * - PoB にあるが bundle に無い: 漏れの可能性
 * - 両方にある: spawn weight 一致確認
 * - bundle にあるが PoB に無い: bundle 過剰（PoE1 dead data 等）
 *
 * オーナー指示: 「指輪以外の MOD もオールチェック / PoB 参照なら英語でいけるから 2 重で安心」
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const POB_DATA = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/Data");
const bundle = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"),
);

/**
 * ModX.lua の 1 行 entry をパースする。
 * ["KeyName"] = { ... full single line ... },
 * 内部で type/level/group/weightKey/weightVal を抜く。
 */
async function parsePobModFile(name) {
  const luaPath = resolve(POB_DATA, name);
  const txt = await readFile(luaPath, "utf-8");
  const entries = [];

  // 1 行 entry のみ対象（ModRunes.lua の multi-line は別形式で skip）
  const lines = txt.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*\["([^"]+)"\]\s*=\s*\{(.+)\},\s*$/);
    if (!m) continue;
    const key = m[1];
    const body = m[2];
    const typeM = body.match(/type\s*=\s*"([^"]+)"/);
    const levelM = body.match(/level\s*=\s*(\d+)/);
    const groupM = body.match(/group\s*=\s*"([^"]+)"/);
    const wKeyM = body.match(/weightKey\s*=\s*\{([^}]*)\}/);
    const wValM = body.match(/weightVal\s*=\s*\{([^}]*)\}/);
    if (!typeM || !wKeyM || !wValM) continue;
    const weightKey = (wKeyM[1].match(/"([^"]+)"/g) ?? []).map((s) =>
      s.slice(1, -1),
    );
    const weightVal = wValM[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s));
    entries.push({
      key,
      type: typeM[1],
      level: levelM ? parseInt(levelM[1]) : 1,
      group: groupM ? groupM[1] : "",
      weightKey,
      weightVal,
    });
  }
  return entries;
}

const FILES = ["ModItem.lua", "ModCorrupted.lua", "ModJewel.lua", "ModFlask.lua"];
const allPob = [];
for (const f of FILES) {
  const e = await parsePobModFile(f);
  console.log(`[parse] ${f}: ${e.length} entries`);
  for (const x of e) allPob.push({ ...x, source: f });
}

console.log(`\n=== 集計 ===`);
console.log(`PoB Mod*.lua 抽出 total: ${allPob.length}`);
console.log(`bundle.json: ${Object.keys(bundle).length}`);

// 重複 key を除外（同じ key が ModItem と ModCharm 両方に出る等）
const pobByKey = new Map();
for (const e of allPob) {
  if (!pobByKey.has(e.key)) pobByKey.set(e.key, e);
}
console.log(`PoB unique key: ${pobByKey.size}`);

// 比較
const bundleKeys = new Set(Object.keys(bundle));
const pobOnly = [];
const bundleOnly = [];
const mismatched = [];

for (const [k, e] of pobByKey.entries()) {
  if (!bundleKeys.has(k)) {
    pobOnly.push(e);
    continue;
  }
  // weight 比較
  const b = bundle[k];
  const bSpawn = (b.spawn ?? []).reduce((acc, s) => {
    acc[s.t] = s.w;
    return acc;
  }, {});
  const pSpawn = {};
  for (let i = 0; i < e.weightKey.length; i++) {
    pSpawn[e.weightKey[i]] = e.weightVal[i];
  }
  // どちらかにしかない tag、または値が違う tag を集める
  const allTags = new Set([...Object.keys(bSpawn), ...Object.keys(pSpawn)]);
  const diffs = [];
  for (const t of allTags) {
    const bv = bSpawn[t];
    const pv = pSpawn[t];
    if (bv !== pv) {
      // bundle は w=0 を一部削除してる仕様なので bv=undef && pv=0 はOK
      if (bv === undefined && pv === 0) continue;
      diffs.push({ tag: t, bundle: bv ?? "(none)", pob: pv ?? "(none)" });
    }
  }
  if (diffs.length > 0) {
    mismatched.push({ key: k, diffs });
  }
}

for (const k of bundleKeys) {
  if (!pobByKey.has(k)) {
    bundleOnly.push(k);
  }
}

console.log(`\n=== PoB にあって bundle に無い (重大な漏れの可能性): ${pobOnly.length} ===`);
const pobOnlyByType = {};
const pobOnlyByGroup = {};
for (const e of pobOnly) {
  pobOnlyByType[e.type] = (pobOnlyByType[e.type] ?? 0) + 1;
  pobOnlyByGroup[e.source] = (pobOnlyByGroup[e.source] ?? 0) + 1;
}
console.log(`  type 別:`, pobOnlyByType);
console.log(`  ファイル別:`, pobOnlyByGroup);
console.log(`\n  サンプル 15 件:`);
for (const e of pobOnly.slice(0, 15)) {
  console.log(`    [${e.source}] ${e.key} | type=${e.type} group=${e.group} lv=${e.level}`);
}

console.log(`\n=== bundle にあって PoB に無い: ${bundleOnly.length} ===`);
console.log(`  サンプル 10 件:`);
for (const k of bundleOnly.slice(0, 10)) {
  console.log(`    ${k}`);
}

console.log(`\n=== weight 不一致: ${mismatched.length} ===`);
for (const m of mismatched.slice(0, 5)) {
  console.log(`  ${m.key}:`);
  for (const d of m.diffs.slice(0, 5)) {
    console.log(`    tag '${d.tag}' bundle=${d.bundle} pob=${d.pob}`);
  }
}

#!/usr/bin/env node
/**
 * 画像4 の "Strength" グループ同居構造（通常8 tier + 冒涜 hybrid 2 + エッセンス 3）が
 * bundle 内で groups フィールドの紐付けで再現可能かを確認する。
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUNDLE = JSON.parse(await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"));

console.log("##### 1. 通常 Strength suffix 全 tier（蛮人～タイタン） #####");
const standardStr = [];
for (const [k, m] of Object.entries(BUNDLE)) {
  if (m.type !== "suffix") continue;
  if (m.essence || m.corrupt || m.desecrated) continue;
  if (/^IncreasedStrength\d+/.test(k)) {
    standardStr.push({ k, ja: m.text_ja, groups: m.groups, lvl: m.level });
  }
}
console.log(`count=${standardStr.length}`);
for (const e of standardStr) {
  console.log(`  ${e.k.padEnd(28)} lvl=${String(e.lvl).padStart(2)} groups=${JSON.stringify(e.groups)}  | "${e.ja}"`);
}

console.log("\n##### 2. 冒涜 Strength hybrid (AMANAMU/ULAMAN suffix) #####");
const desecHybrid = [];
for (const [k, m] of Object.entries(BUNDLE)) {
  if (!m.desecrated) continue;
  if (m.type !== "suffix") continue;
  if (/(StrengthAndIntelligence|StrengthAndDexterity)/.test(k)) {
    desecHybrid.push({ k, ja: m.text_ja, groups: m.groups, lvl: m.level });
  }
}
console.log(`count=${desecHybrid.length}`);
for (const e of desecHybrid) {
  console.log(`  ${e.k}`);
  console.log(`    lvl=${e.lvl} groups=${JSON.stringify(e.groups)}`);
  console.log(`    ja="${e.ja}"`);
}

console.log("\n##### 3. エッセンス無限 (EssenceDisplayAttributes1-5) #####");
const essAttr = [];
for (const [k, m] of Object.entries(BUNDLE)) {
  if (k.startsWith("EssenceDisplayAttributes")) {
    essAttr.push({ k, ja: m.text_ja, groups: m.groups, lvl: m.level });
  }
}
console.log(`count=${essAttr.length}`);
for (const e of essAttr) {
  console.log(`  ${e.k}`);
  console.log(`    lvl=${e.lvl} groups=${JSON.stringify(e.groups)}`);
  console.log(`    ja="${e.ja}"`);
}

// groups の共通要素を抽出
const allGroups = new Set();
for (const e of [...standardStr, ...desecHybrid, ...essAttr]) {
  for (const g of e.groups ?? []) allGroups.add(g);
}
console.log("\n##### 4. すべての mod の groups 統合 #####");
console.log(`unique groups: ${[...allGroups].join(", ")}`);

// groups で Strength を含む mod を全部数える（同じグループに何件あるか）
console.log("\n##### 5. 'Strength' を含む group key の全 mod 件数（bundle 全体） #####");
for (const g of allGroups) {
  if (!/strength/i.test(g)) continue;
  let count = 0;
  let kinds = { normal: 0, essence: 0, corrupt: 0, desecrated: 0 };
  let typeBreakdown = { prefix: 0, suffix: 0 };
  for (const [k, m] of Object.entries(BUNDLE)) {
    if (!(m.groups ?? []).includes(g)) continue;
    count++;
    if (m.essence) kinds.essence++;
    else if (m.corrupt) kinds.corrupt++;
    else if (m.desecrated) kinds.desecrated++;
    else kinds.normal++;
    typeBreakdown[m.type] = (typeBreakdown[m.type] ?? 0) + 1;
  }
  console.log(`  group "${g}": total=${count}  prefix=${typeBreakdown.prefix} suffix=${typeBreakdown.suffix}  | normal=${kinds.normal} essence=${kinds.essence} corrupt=${kinds.corrupt} desecrated=${kinds.desecrated}`);
}

console.log("\n##### 6. 画像4 の同居構造との比較 #####");
console.log(`画像4 (Strength suffix): 通常8 + 冒涜2 + エッセンス3 = 13 件`);
console.log(`bundle (Strength group, suffix のみで集計):`);
for (const g of allGroups) {
  if (!/strength/i.test(g)) continue;
  const all = [];
  for (const [k, m] of Object.entries(BUNDLE)) {
    if (!(m.groups ?? []).includes(g)) continue;
    if (m.type !== "suffix") continue;
    let kind = m.essence ? "essence" : m.corrupt ? "corrupt" : m.desecrated ? "desecr" : "normal";
    all.push({ k, kind, lvl: m.level, ja: m.text_ja });
  }
  console.log(`\n  group "${g}" suffix only: ${all.length} 件`);
  for (const e of all.sort((a, b) => a.lvl - b.lvl)) {
    console.log(`    [${e.kind.padEnd(8)}] lvl=${String(e.lvl).padStart(2)} ${e.k}`);
    console.log(`        "${(e.ja ?? "").slice(0, 70)}"`);
  }
}

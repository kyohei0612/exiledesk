#!/usr/bin/env node
/**
 * オーナーが「essence/desecrated 足りてない？」と心配したので、
 * bundle 内の essence/desecrated 関連 mod を kind 横断で実数確認する。
 *
 * 目的: kind="essence" は 46 件しかないが、これは PoB 内部分類。
 * 実際にゲームでの essence 関連 mod は通常 prefix/suffix 内の
 * `EssenceXxx` キーや高 tier 版にも分散しているため、それらも合算する。
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const bundle = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"),
);
const upstream = JSON.parse(
  await readFile(resolve(ROOT, "data-cache/mods.en.json"), "utf-8"),
);

console.log("===== bundle (mods-bundle.json) 全体集計 =====");
console.log(`total: ${Object.keys(bundle).length}`);

// kind 別
const byKind = { normal: 0, essence: 0, corrupted: 0, desecrated: 0 };
for (const m of Object.values(bundle)) {
  if (m.essence) byKind.essence++;
  else if (m.corrupt) byKind.corrupted++;
  else if (m.desecrated) byKind.desecrated++;
  else byKind.normal++;
}
for (const [k, v] of Object.entries(byKind)) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}

// "Essence" を含む key の全件（kind 横断）
console.log("\n===== key に 'Essence' を含む mod (kind 横断) =====");
const essenceKeys = Object.keys(bundle).filter((k) => /[Ee]ssence/.test(k));
console.log(`総数: ${essenceKeys.length}`);
const essenceByKind = { normal: 0, essence: 0, corrupted: 0, desecrated: 0 };
for (const k of essenceKeys) {
  const m = bundle[k];
  if (m.essence) essenceByKind.essence++;
  else if (m.corrupt) essenceByKind.corrupted++;
  else if (m.desecrated) essenceByKind.desecrated++;
  else essenceByKind.normal++;
}
for (const [k, v] of Object.entries(essenceByKind)) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}

// "Essence" を含む key のサンプル 10 件
console.log("\nsample:");
for (const k of essenceKeys.slice(0, 12)) {
  const m = bundle[k];
  const kind = m.essence ? "essence" : m.corrupt ? "corrupt" : m.desecrated ? "desecr" : "normal";
  console.log(`  [${kind.padEnd(7)}] ${k}: "${(m.text_ja ?? "").slice(0, 50)}"`);
}

// 冒涜系 (desecrated kind)
console.log("\n===== desecrated kind 内訳 (boss 別) =====");
const desKeys = Object.keys(bundle).filter((k) => bundle[k].desecrated);
const byBoss = { Amanamu: 0, Ulaman: 0, Kurgal: 0, Other: 0 };
for (const k of desKeys) {
  if (k.includes("Amanamu")) byBoss.Amanamu++;
  else if (k.includes("Ulaman")) byBoss.Ulaman++;
  else if (k.includes("Kurgal")) byBoss.Kurgal++;
  else byBoss.Other++;
}
for (const [b, c] of Object.entries(byBoss)) console.log(`  ${b.padEnd(12)} ${c}`);

// 上流 vs bundle の覆い率
console.log("\n===== 上流 RePoE poe2 vs bundle カバレッジ =====");
const upstreamEntries = Object.keys(upstream);
const upstreamCovered = upstreamEntries.filter((k) => k in bundle);
console.log(`upstream total entries: ${upstreamEntries.length}`);
console.log(`upstream covered by bundle: ${upstreamCovered.length}`);
console.log(`upstream NOT covered: ${upstreamEntries.length - upstreamCovered.length}`);

// 上流の essence-related で bundle 漏れ
console.log("\n===== 上流の Essence 関連で bundle に無い key =====");
const upstreamEssence = upstreamEntries.filter((k) => /[Ee]ssence/.test(k));
const upstreamEssenceMissing = upstreamEssence.filter((k) => !(k in bundle));
console.log(`上流 Essence 系 total: ${upstreamEssence.length}`);
console.log(`bundle に入ってる: ${upstreamEssence.length - upstreamEssenceMissing.length}`);
console.log(`漏れ: ${upstreamEssenceMissing.length}`);
if (upstreamEssenceMissing.length > 0 && upstreamEssenceMissing.length <= 25) {
  console.log("\n漏れ一覧:");
  for (const k of upstreamEssenceMissing) {
    const v = upstream[k];
    console.log(`  ${k} | dom=${v.domain} gt=${v.generation_type} ess_only=${!!v.is_essence_only}`);
  }
} else if (upstreamEssenceMissing.length > 25) {
  console.log("\n漏れの先頭 15 件:");
  for (const k of upstreamEssenceMissing.slice(0, 15)) {
    const v = upstream[k];
    console.log(`  ${k} | dom=${v.domain} gt=${v.generation_type} ess_only=${!!v.is_essence_only}`);
  }
}

// 上流の desecrated で bundle 漏れ
console.log("\n===== 上流の domain=desecrated で bundle に無い key =====");
const upstreamDes = upstreamEntries.filter((k) => upstream[k].domain === "desecrated");
const upstreamDesMissing = upstreamDes.filter((k) => !(k in bundle));
console.log(`上流 desecrated total: ${upstreamDes.length}`);
console.log(`bundle に入ってる: ${upstreamDes.length - upstreamDesMissing.length}`);
console.log(`漏れ: ${upstreamDesMissing.length}`);
if (upstreamDesMissing.length > 0) {
  console.log("\n漏れ一覧:");
  for (const k of upstreamDesMissing.slice(0, 15)) {
    const v = upstream[k];
    console.log(`  ${k} | gt=${v.generation_type} text="${(v.text ?? "").slice(0, 50)}"`);
  }
}

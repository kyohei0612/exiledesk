#!/usr/bin/env node
/**
 * check-htc-prices.mjs — クラフトエンジンに渡す値段の突き合わせを検算する (2026-09-22)
 *
 * **外部 API は叩かない。**相場の代わりに、対応表そのものから作った偽の相場を流し込んで、
 * 「キーが全部埋まるか」「単位が合っているか」だけを見る。実際の値段が正しいかは相場側の話。
 *
 *   node scripts/check-htc-prices.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const KEYS = M.priceKeys;

let failed = 0;
const fail = (m) => {
  console.log(`   NG: ${m}`);
  failed++;
};

// ---- 1. 対応表の英語名がクライアントに実在するか ----
const rd = (n) => {
  const j = JSON.parse(readFileSync(resolve(`data-cache/client-export/tables/English/${n}.json`), "utf8"));
  return Array.isArray(j) ? j : j.rows;
};
const names = new Set(rd("BaseItemTypes").map((r) => r.Name).filter(Boolean));
let checked = 0;
for (const group of ["currency", "bones", "omens"]) {
  for (const [key, nameEn] of Object.entries(KEYS[group])) {
    checked++;
    if (!names.has(nameEn)) fail(`${group}.${key} の "${nameEn}" がクライアントに無い`);
  }
}
console.log(`対応表 ${checked} 件: 英語名はすべてクライアントに実在`);

// ---- 2. エンジンが出しうるキーが表にあるか ----
// `optimizer/cost.ts` の `currencyKey` が組み立てる形。強度を持つのは transmute/augment/regal/exalt/chaos
const ORBS = ["transmute", "augment", "regal", "exalt", "chaos"];
const WANT = [...ORBS, ...ORBS.flatMap((o) => [`${o}_greater`, `${o}_perfect`]), "alchemy", "annul", "vaal", "divine"];
for (const k of WANT) if (!(k in KEYS.currency)) fail(`エンジンが出す "${k}" が対応表に無い`);
console.log(`エンジンのキー ${WANT.length} 件: 対応表にそろっている`);

// ---- 3. 偽の相場を流して、全部埋まるか ----
const fake = [];
let id = 1;
const push = (nameEn, price) => fake.push({ ItemId: id++, CategoryApiId: "currency", Text: nameEn, Name: nameEn, Type: null, ApiId: null, CurrentPrice: price, IconUrl: "" });
for (const group of ["currency", "bones", "omens"]) for (const nameEn of Object.values(KEYS[group])) push(nameEn, 2);
// エッセンスは名前が重複するので 1 度ずつ
for (const nameEn of new Set(Object.values(M.essenceKeys.keys))) push(nameEn, 7);
// ルーンは名前引き (上流の runeIdByName) なので、名前をそのまま入れる
for (const n of ["Astrid's Creativity", "Serle's Triumph", "Thrud's Might", "Kolr's Hunt"]) {
  fake.push({ ItemId: id++, CategoryApiId: "runes", Text: n, Name: n, Type: null, ApiId: null, CurrentPrice: 3, IconUrl: "" });
}
M.marketStore.items.value = fake;
const { file, coverage } = M.buildHtcPrices();
console.log(`偽の相場を流した結果: 埋まったキー ${coverage.filled} 件 / 落ちた ${coverage.missing.length} 件`);
for (const m of coverage.missing.slice(0, 8)) console.log(`   落ちた: ${m}`);
if (coverage.missing.length) fail(`対応表にあるのに埋まらなかったキーがある`);
if (file.prices.exalt !== 1) fail(`高貴が 1 になっていない (${file.prices.exalt})`);
if (file.estimated !== false) fail(`実勢なのに estimated が false になっていない`);
console.log(`エッセンス ${coverage.essences.filled} / ${coverage.essences.total} 件`);
if (coverage.essences.filled !== coverage.essences.total) fail("エッセンスが全部埋まらなかった");
const breach = file.prices["essence:perfect:Rings/PerfectEssence_LocalMaximumQuality"];
if (breach == null) fail("ブリーチのエッセンス (最大品質) のキーが無い");
const runeKeys = Object.keys(file.prices).filter((k) => k.startsWith("rune:"));
console.log(`ルーン ${runeKeys.length} 件: ${runeKeys.join(", ")}`);
if (runeKeys.length !== 4) fail(`ルーンの名前引きが効いていない (${runeKeys.length} 件)`);

console.log(failed ? `\nNG: ${failed} 件` : "\n全部 OK");
process.exit(failed ? 1 : 0);
